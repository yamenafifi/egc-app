from datetime import datetime, timezone


class ExpenseClaimApplicationModel:
    """
    An employee's PDF of receipts, staged here through AI extraction and
    two tiers of human review before it becomes a real ERPNext Expense
    Claim. Kept as its own local record for the same reason
    DeductionRequestModel/TimesheetSubmissionModel are: nothing about
    "what was actually purchased" is known until Gemini has extracted it
    and an Accountant has corrected/approved it - egc_hr is deliberately
    NOT involved anywhere in this flow (Expense Claim isn't part of its
    payroll rule engine); the real Expense Claim is created directly
    against ERPNext via erp_service.push_expense_claim().

    status lifecycle:
      submitted            → uploaded, awaiting an Accountant to start processing
      processing           → Gemini extraction in progress
      extracted            → receipts extracted, awaiting Accountant review/approval
      accountant_approved  → Accountant approved, awaiting Operations Manager
      approved             → Operations Manager gave final approval (push attempted -
                              see push_status for whether it actually landed in ERPNext)
      rejected             → sent back for correction at either tier - never a dead
                              end, docstatus-equivalent state that reopens for editing
      withdrawn            → the employee pulled their own claim back before an
                              Accountant started reviewing it (status was still
                              "submitted" or "processing" - see the withdraw route's
                              docstring in app/api/expense_claims.py for exactly where
                              that line is drawn). Terminal, employee-initiated, and
                              distinct from "rejected": nobody sent this back, the
                              employee just changed their mind before anyone reviewed it.

    push_status mirrors DeductionRequestModel's separation of "the review
    decision" from "did it actually land in ERPNext" - final approval can
    succeed as a decision while the push fails (ERPNext unreachable,
    missing Company config, validation error), and that distinction must
    stay visible and *persisted* (not just fired once in a notification -
    see TimesheetSubmissionModel's push_detail for what NOT to do):
      None      → not yet attempted
      "pushed"   → ERPNext created the Expense Claim cleanly
      "failed"   → ERPNext was unreachable or rejected it - see push_detail

    job_status tracks the AI extraction run separately from `status` -
    `status` is the coarse application lifecycle (which already has its
    own "processing" value), while job_status is "which attempt is this
    and how did it go", since a re-run is legal (Re-run Processing) and
    the caller/UI needs to tell a genuinely-running job apart from a
    stuck one (see STALE_JOB_MINUTES in app/api/expense_claims.py):
      None        → no extraction attempt has ever started
      "queued"    → handed to the background job queue, not running yet
      "running"   → the Gemini call/PDF split is actually in progress
      "succeeded" → the last attempt completed and wrote receipts
      "failed"    → the last attempt raised - see processing_error
    """

    COLLECTION = "expense_claim_applications"

    @staticmethod
    def new(
        employee_user_id: str,
        employee_username: str,
        employee_display_name: str,
        employee_erp_id: str,
        company: str,
        project_id: str | None,
        project_name: str | None,
        purpose: str,
        source_pdf_file_id: str,
        source_pdf_filename: str,
        created_by_user_id: str | None = None,
        created_by_display_name: str | None = None,
    ) -> dict:
        now = datetime.now(timezone.utc)
        return {
            "employee_user_id": employee_user_id,
            "employee_username": employee_username,
            "employee_display_name": employee_display_name,
            "employee_erp_id": employee_erp_id,
            "company": company,
            "project_id": project_id,
            "project_name": project_name,
            "purpose": purpose,
            "source_pdf_file_id": source_pdf_file_id,
            "source_pdf_filename": source_pdf_filename,
            # None for a normal employee self-submission - only set when an
            # Accountant used POST /for-employee to submit on someone else's
            # behalf (expense_claims.create_for_employee), so the employee
            # and every later reviewer can see this wasn't self-reported.
            "created_by_user_id": created_by_user_id,
            "created_by_display_name": created_by_display_name,
            "status": "submitted",
            "submitted_at": now,
            "processing_error": None,
            "job_status": None,
            "job_started_at": None,
            "job_finished_at": None,
            "triggered_by_user_id": None,
            "triggered_by_display_name": None,
            "receipts": [],
            "total_claimed_amount": 0,
            "accountant_reviewed_by": None,
            "accountant_reviewed_by_name": None,
            "accountant_reviewed_at": None,
            "final_reviewed_by": None,
            "final_reviewed_by_name": None,
            "final_reviewed_at": None,
            "rejection_reason": None,
            "erp_expense_claim": None,
            "push_status": None,
            "push_detail": None,
            "withdrawn_at": None,
        }

    @staticmethod
    def new_receipt(
        file_id: str,
        page_start: int,
        page_end: int,
        vendor_name: str | None = None,
        vat_number: str | None = None,
        receipt_number: str | None = None,
        receipt_date: str | None = None,
        subtotal_amount: float | None = None,
        discount_amount: float | None = None,
        vat_amount: float | None = None,
        total_amount: float | None = None,
        zatca_qr_raw: str | None = None,
        description_en: str = "",
        description_ar: str = "",
        confidence_notes: str | None = None,
        line_items: list | None = None,
        qr_decoded: dict | None = None,
        qr_decode_error: str | None = None,
        receipt_datetime: str | None = None,
        expense_category: str | None = None,
        our_vat_number_present: bool = False,
    ) -> dict:
        return {
            "file_id": file_id,
            "page_start": page_start,
            "page_end": page_end,
            "vendor_name": vendor_name,
            "vat_number": vat_number,
            "receipt_number": receipt_number,
            "receipt_date": receipt_date,
            # Which configured Expense Category (see expense_category.py)
            "expense_category": expense_category,
            # Whether OUR company's VAT number (Settings > Expense Claims)
            # appears on this receipt, distinct from the vendor's own
            # vat_number above - a compliance flag Gemini sets, correctable
            # by the Accountant like every other AI-guessed field here.
            "our_vat_number_present": our_vat_number_present,
            # Full ISO date+time when known (from the ZATCA QR's own
            # timestamp tag, which - unlike receipt_date - actually
            # carries a time component) - receipt_date alone can't answer
            # "what time was this purchased", which the QR data can.
            "receipt_datetime": receipt_datetime,
            "subtotal_amount": subtotal_amount,
            "discount_amount": discount_amount,
            "vat_amount": vat_amount,
            "total_amount": total_amount,
            "zatca_qr_raw": zatca_qr_raw,
            # qr_decoded: the deterministically-parsed ZATCA TLV fields
            # (see app/services/zatca.py) - seller_name/vat_number/
            # timestamp/invoice_total/vat_total, legally the source of
            # truth per ZATCA e-invoicing rules, independent of whatever
            # Gemini separately read off the printed receipt text above.
            "qr_decoded": qr_decoded,
            "qr_decode_error": qr_decode_error,
            "line_items": line_items or [],
            "description_en": description_en,
            "description_ar": description_ar,
            "confidence_notes": confidence_notes,
            "included": True,
        }

    @staticmethod
    def total_claimed(receipts: list) -> float:
        return round(sum(r.get("total_amount") or 0 for r in receipts if r.get("included")), 2)

    @staticmethod
    def to_public(app: dict) -> dict:
        return {
            "id": str(app["_id"]),
            "employee_user_id": app.get("employee_user_id"),
            "employee_display_name": app.get("employee_display_name"),
            "employee_erp_id": app.get("employee_erp_id"),
            "company": app.get("company"),
            "project_id": app.get("project_id"),
            "project_name": app.get("project_name"),
            "purpose": app.get("purpose", ""),
            "source_pdf_filename": app.get("source_pdf_filename"),
            "created_by_display_name": app.get("created_by_display_name"),
            "status": app.get("status", "submitted"),
            "submitted_at": app["submitted_at"].isoformat() if app.get("submitted_at") else None,
            "processing_error": app.get("processing_error"),
            "job_status": app.get("job_status"),
            "job_started_at": app["job_started_at"].isoformat() if app.get("job_started_at") else None,
            "job_finished_at": app["job_finished_at"].isoformat() if app.get("job_finished_at") else None,
            "triggered_by_display_name": app.get("triggered_by_display_name"),
            "receipts": [
                {**r, "index": i} for i, r in enumerate(app.get("receipts", []))
            ],
            "total_claimed_amount": app.get("total_claimed_amount", 0),
            "accountant_reviewed_by_name": app.get("accountant_reviewed_by_name"),
            "accountant_reviewed_at": app["accountant_reviewed_at"].isoformat()
                if app.get("accountant_reviewed_at") else None,
            "final_reviewed_by_name": app.get("final_reviewed_by_name"),
            "final_reviewed_at": app["final_reviewed_at"].isoformat()
                if app.get("final_reviewed_at") else None,
            "rejection_reason": app.get("rejection_reason"),
            "erp_expense_claim": app.get("erp_expense_claim"),
            "push_status": app.get("push_status"),
            "push_detail": app.get("push_detail"),
            "withdrawn_at": app["withdrawn_at"].isoformat() if app.get("withdrawn_at") else None,
        }
