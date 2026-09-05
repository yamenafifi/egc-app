"""
Expense Claim AI Extraction Job
==================================
The actual work behind POST /expense-claims/<id>/process, run off the
request thread by app/services/job_queue.py. Runs in a background
thread with no Flask request context - get_db() doesn't need one
(app/utils/database.py is a plain module-level Mongo singleton), so
this reads/writes the database directly like any request handler would.

Whatever happens, this function must leave job_status as either
"succeeded" or "failed" - never leave it hanging as "running", or a
crashed job looks identical to a genuinely long-running one forever.

Every write back to the application here is guarded by status="processing"
in the query, not just the _id: an employee is allowed to withdraw their
own claim while it's still processing (see app/api/expense_claims.py's
withdraw endpoint), and a job that finishes after that point must not
silently resurrect a withdrawn claim back into "extracted"/"submitted".
"""

import io
from datetime import datetime, timezone

from bson import ObjectId

from app.models.expense_category import ExpenseCategoryModel
from app.models.expense_claim_application import ExpenseClaimApplicationModel
from app.services import file_storage_service
from app.services.gemini_service import extract_receipts, GeminiError
from app.services.notification_service import notify
from app.services.qr_scanner import scan_for_qr
from app.services.settings_service import get_settings_doc
from app.services.zatca import decode_zatca_qr, ZatcaDecodeError
from app.utils.database import get_db


def _resolve_receipt_datetime(qr_decoded: dict | None, receipt_date: str | None) -> str | None:
    """The ZATCA QR's own timestamp tag is the only source that actually
    carries a time component - receipt_date from the printed text is
    date-only. Prefer the QR's timestamp when it decoded cleanly; fall
    back to midnight on receipt_date so every receipt still sorts/filters
    correctly by day even without a working QR code."""
    if qr_decoded and qr_decoded.get("timestamp"):
        return qr_decoded["timestamp"]
    if receipt_date:
        return f"{receipt_date}T00:00:00"
    return None


def run_extraction_job(application_id: str) -> None:
    db = get_db()
    collection = db[ExpenseClaimApplicationModel.COLLECTION]
    app = collection.find_one({"_id": ObjectId(application_id)})
    if not app:
        return  # deleted out from under the job - nothing to report to
    if app["status"] != "processing":
        return  # withdrawn (or otherwise moved on) before this job got to run

    collection.update_one({"_id": app["_id"], "status": "processing"}, {"$set": {"job_status": "running"}})

    try:
        found = file_storage_service.read(app["source_pdf_file_id"])
        if not found:
            raise GeminiError("Stored source PDF could not be read.")
        pdf_bytes, _, _ = found

        categories = [ExpenseCategoryModel.to_public(c) for c in db[ExpenseCategoryModel.COLLECTION].find()]
        company_vat_number = get_settings_doc(db).get("company_vat_number")

        result = extract_receipts(pdf_bytes, categories=categories, company_vat_number=company_vat_number)

        from pypdf import PdfReader, PdfWriter
        reader = PdfReader(io.BytesIO(pdf_bytes))

        receipts = []
        for r in result["receipts"]:
            start, end = r["page_start"], r["page_end"]
            writer = PdfWriter()
            for page_num in range(start - 1, end):
                if 0 <= page_num < len(reader.pages):
                    writer.add_page(reader.pages[page_num])
            buf = io.BytesIO()
            writer.write(buf)
            file_id = file_storage_service.store(
                buf.getvalue(), f"{application_id}-receipt-{start}-{end}.pdf",
            )

            # Deterministic QR decode straight off the rendered page pixels -
            # see qr_scanner.py's docstring for why Gemini is no longer asked
            # to transcribe this itself.
            qr_raw = scan_for_qr(pdf_bytes, start, end)
            qr_decoded, qr_decode_error = None, None
            if qr_raw:
                try:
                    qr_decoded = decode_zatca_qr(qr_raw)
                except ZatcaDecodeError as e:
                    qr_decode_error = str(e)
            else:
                qr_decode_error = "No QR code could be detected on this receipt's page(s)."

            receipts.append(ExpenseClaimApplicationModel.new_receipt(
                file_id=file_id, page_start=start, page_end=end,
                vendor_name=r.get("vendor_name"), vat_number=r.get("vat_number"),
                receipt_number=r.get("receipt_number"), receipt_date=r.get("receipt_date"),
                subtotal_amount=r.get("subtotal_amount"), discount_amount=r.get("discount_amount"),
                vat_amount=r.get("vat_amount"), total_amount=r.get("total_amount"),
                zatca_qr_raw=qr_raw,
                expense_category=r.get("expense_category"),
                our_vat_number_present=bool(r.get("our_vat_number_present")),
                description_en=r.get("description_en", ""), description_ar=r.get("description_ar", ""),
                confidence_notes=r.get("confidence_notes"),
                line_items=r.get("line_items") or [],
                qr_decoded=qr_decoded, qr_decode_error=qr_decode_error,
                receipt_datetime=_resolve_receipt_datetime(qr_decoded, r.get("receipt_date")),
            ))
    except Exception as e:
        update_result = collection.update_one(
            {"_id": app["_id"], "status": "processing"},
            {"$set": {
                "status": "submitted", "processing_error": str(e),
                "job_status": "failed", "job_finished_at": datetime.now(timezone.utc),
            }},
        )
        if update_result.matched_count and app.get("triggered_by_user_id"):
            notify(
                app["triggered_by_user_id"], "expense_claim_extraction_failed",
                "Expense claim extraction failed",
                f"Extracting receipts for {app['employee_display_name']}'s claim failed: {e}",
                link=f"/expense-claims/review?application={application_id}",
                related_id=application_id,
            )
        return

    update_result = collection.update_one(
        {"_id": app["_id"], "status": "processing"},
        {"$set": {
            "status": "extracted", "receipts": receipts,
            "total_claimed_amount": ExpenseClaimApplicationModel.total_claimed(receipts),
            "job_status": "succeeded", "job_finished_at": datetime.now(timezone.utc),
        }},
    )
    if update_result.matched_count and app.get("triggered_by_user_id"):
        notify(
            app["triggered_by_user_id"], "expense_claim_extraction_completed",
            "Expense claim extraction finished",
            f"Found {len(receipts)} receipt(s) in {app['employee_display_name']}'s claim - ready to review.",
            link=f"/expense-claims/review?application={application_id}",
            related_id=application_id,
        )
