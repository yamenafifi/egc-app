"""
Expense Claim Routes  —  /api/expense-claims
===============================================
POST /                                — employee submits a PDF of receipts
GET  /employees                       — Accountant's picker: EGC App accounts eligible to
                                         have a claim created for them (active, ERP-linked)
POST /for-employee                    — Accountant submits a PDF of receipts on behalf of
                                         another employee (expense_claims.create_for_employee)
GET  /mine                            — the caller's own applications
GET  /<id>                            — detail (owner, or a reviewer)
GET  /<id>/pdf                        — the original uploaded PDF
GET  /<id>/receipts/<n>/pdf           — one AI-split single-receipt PDF
POST /<id>/withdraw                   — employee pulls back their own claim, only
                                         while it hasn't reached Accountant review yet
GET  /readiness                       — is ERPNext/Gemini configured enough to post?
POST /<id>/process                    — Accountant starts/re-runs Gemini extraction as a
                                         background job; returns 202 immediately, poll GET /<id>
                                         for job_status
PATCH /<id>/receipts/<n>              — Accountant corrects a field / toggles included
POST /<id>/approve                    — Accountant's approval (first tier)
POST /<id>/reject                     — Accountant sends it back for correction
GET  /pending-final-approval          — Operations Manager's queue
POST /final-approve                   — bulk: final approval, posts to ERPNext
POST /final-reject                    — bulk: sends back to the Accountant
GET  /receipts/search                 — search every extracted receipt line across all claims,
                                         by project/date range/free text (vendor, description,
                                         line items) - not scoped to one claim at a time
GET  /receipts/export-zip             — same filters as receipts/search (plus vat_present_only) -
                                         a ZIP of every matching receipt's PDF, plus a manifest.csv
                                         summarizing the batch

Two different authorities, same shape as attendance's two-tier review and
deductions' HR review: an Accountant (expense_claims.review) processes
and gives the first approval; only an Operations Manager
(expense_claims.final_approve) can give final approval, which is what
actually creates the real ERPNext Expense Claim - see
erp_service.push_expense_claim() and its own docstring for why this goes
straight to ERPNext rather than through egc_hr.
"""

import csv
import io
import re
import zipfile
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from bson import ObjectId
from flask import Blueprint, request, jsonify, g, Response

from app.utils.database import get_db
from app.models.expense_claim_application import ExpenseClaimApplicationModel
from app.models.user import UserModel
from app.middleware.auth_middleware import jwt_required_custom, require_permission
from app.services import file_storage_service, job_queue
from app.services.project_site_cache import get_site
from app.services.erp_service import erp_service, ERPNextError
from app.services.expense_claim_processor import run_extraction_job
from app.services.notification_service import notify, notify_all_with_permission
from config.settings import Config

bp = Blueprint("expense_claims", __name__, url_prefix="/api/expense-claims")


@bp.before_request
def _require_expense_claims_module_enabled():
    from app.services.settings_service import is_module_enabled
    if not is_module_enabled("expense_claims"):
        return jsonify({"error": "The Expense Claims module is currently disabled."}), 403

MAX_UPLOAD_BYTES = 45 * 1024 * 1024  # matches gemini_service.MAX_PDF_BYTES

# How stale an in-flight "processing" job has to be before it's treated as
# crashed rather than genuinely running, and a re-trigger is allowed instead
# of a 409. gemini_service.py retries up to MAX_ATTEMPTS=3 times at
# REQUEST_TIMEOUT=300s each (plus backoff) on transient failures, so a
# genuinely-alive job can legitimately run ~16 minutes worst case - this has
# to clear that with real headroom, since it's a recovery path for a dead
# worker thread/process, not a normal-latency budget.
STALE_JOB_MINUTES = 20


def _get_application_or_404(application_id):
    try:
        oid = ObjectId(application_id)
    except Exception:
        return None
    db = get_db()
    return db[ExpenseClaimApplicationModel.COLLECTION].find_one({"_id": oid})


def _content_disposition(filename: str) -> str:
    """HTTP header values must be Latin-1 - a raw non-ASCII filename (an
    Arabic-named upload, an accented character) breaks send_header with
    UnicodeEncodeError. ascii_fallback keeps old clients working; filename*
    (RFC 5987/6266) gives modern browsers the real name."""
    ascii_fallback = filename.encode("ascii", "ignore").decode("ascii").strip() or "file.pdf"
    return f'inline; filename="{ascii_fallback}"; filename*=UTF-8\'\'{quote(filename)}'


def _can_view(user, app: dict) -> bool:
    if user.get("is_sysadmin"):
        return True
    if app["employee_user_id"] == str(user["_id"]):
        return True
    perms = set(user.get("permissions", []))
    return "expense_claims.review" in perms or "expense_claims.final_approve" in perms


@bp.route("", methods=["POST"])
@jwt_required_custom
def submit_application():
    user = g.current_user
    if not user.get("erp_employee_id"):
        return jsonify({"error": "Your account is not linked to an ERP employee record."}), 400

    project_id = request.form.get("project_id")
    purpose = request.form.get("purpose", "")
    pdf = request.files.get("pdf")
    if not project_id or not pdf:
        return jsonify({"error": "project_id and a pdf file are required."}), 400

    pdf_bytes = pdf.read()
    if not pdf_bytes:
        return jsonify({"error": "Uploaded file is empty."}), 400
    if len(pdf_bytes) > MAX_UPLOAD_BYTES:
        return jsonify({
            "error": f"Receipts PDF is {len(pdf_bytes) / 1024 / 1024:.1f}MB, "
                     f"over the {MAX_UPLOAD_BYTES // 1024 // 1024}MB limit.",
        }), 400

    try:
        employee = erp_service.get_employee(user["erp_employee_id"])
    except ERPNextError as e:
        return jsonify({"error": str(e)}), e.status_code
    company = employee.get("company")
    if not company:
        return jsonify({"error": "Could not resolve your Company from ERPNext."}), 400

    site = get_site(project_id)
    project_name = site.get("project_name") if site else None

    file_id = file_storage_service.store(pdf_bytes, pdf.filename or "receipts.pdf")

    doc = ExpenseClaimApplicationModel.new(
        employee_user_id=str(user["_id"]), employee_username=user["username"],
        employee_display_name=user["display_name"], employee_erp_id=user["erp_employee_id"],
        company=company, project_id=project_id, project_name=project_name, purpose=purpose,
        source_pdf_file_id=file_id, source_pdf_filename=pdf.filename or "receipts.pdf",
    )
    db = get_db()
    result = db[ExpenseClaimApplicationModel.COLLECTION].insert_one(doc)
    doc["_id"] = result.inserted_id

    notify_all_with_permission(
        "expense_claims.review", "expense_claim_submitted", "New Expense Claim Application",
        f"{user['display_name']} submitted a receipts PDF for {project_name or project_id}.",
        link=f"/expense-claims/review?application={str(doc['_id'])}",
        related_id=str(doc["_id"]),
    )

    return jsonify({"application": ExpenseClaimApplicationModel.to_public(doc)}), 201


@bp.route("/employees", methods=["GET"])
@require_permission("expense_claims.create_for_employee")
def list_claimable_employees():
    db = get_db()
    users = db[UserModel.COLLECTION].find(
        {"is_active": True, "erp_employee_id": {"$nin": [None, ""]}},
        {"display_name": 1, "username": 1, "erp_employee_id": 1, "department": 1},
    ).sort("display_name", 1)
    return jsonify({"employees": [
        {
            "id": str(u["_id"]),
            "display_name": u.get("display_name"),
            "username": u.get("username"),
            "erp_employee_id": u.get("erp_employee_id"),
            "department": u.get("department"),
        }
        for u in users
    ]}), 200


@bp.route("/for-employee", methods=["POST"])
@require_permission("expense_claims.create_for_employee")
def submit_application_for_employee():
    db = get_db()

    employee_user_id = request.form.get("employee_user_id")
    project_id = request.form.get("project_id")
    purpose = request.form.get("purpose", "")
    pdf = request.files.get("pdf")
    if not employee_user_id or not project_id or not pdf:
        return jsonify({"error": "employee_user_id, project_id and a pdf file are required."}), 400

    try:
        employee = db[UserModel.COLLECTION].find_one({"_id": ObjectId(employee_user_id)})
    except Exception:
        return jsonify({"error": "Invalid employee_user_id."}), 400
    if not employee or not employee.get("is_active"):
        return jsonify({"error": "That employee does not have an active EGC App account."}), 400
    if not employee.get("erp_employee_id"):
        return jsonify({"error": "That employee's account is not linked to an ERP employee record."}), 400

    pdf_bytes = pdf.read()
    if not pdf_bytes:
        return jsonify({"error": "Uploaded file is empty."}), 400
    if len(pdf_bytes) > MAX_UPLOAD_BYTES:
        return jsonify({
            "error": f"Receipts PDF is {len(pdf_bytes) / 1024 / 1024:.1f}MB, "
                     f"over the {MAX_UPLOAD_BYTES // 1024 // 1024}MB limit.",
        }), 400

    try:
        erp_employee = erp_service.get_employee(employee["erp_employee_id"])
    except ERPNextError as e:
        return jsonify({"error": str(e)}), e.status_code
    company = erp_employee.get("company")
    if not company:
        return jsonify({"error": "Could not resolve this employee's Company from ERPNext."}), 400

    site = get_site(project_id)
    project_name = site.get("project_name") if site else None

    file_id = file_storage_service.store(pdf_bytes, pdf.filename or "receipts.pdf")

    doc = ExpenseClaimApplicationModel.new(
        employee_user_id=str(employee["_id"]), employee_username=employee["username"],
        employee_display_name=employee["display_name"], employee_erp_id=employee["erp_employee_id"],
        company=company, project_id=project_id, project_name=project_name, purpose=purpose,
        source_pdf_file_id=file_id, source_pdf_filename=pdf.filename or "receipts.pdf",
        created_by_user_id=str(g.current_user["_id"]), created_by_display_name=g.current_user["display_name"],
    )
    result = db[ExpenseClaimApplicationModel.COLLECTION].insert_one(doc)
    doc["_id"] = result.inserted_id

    notify_all_with_permission(
        "expense_claims.review", "expense_claim_submitted", "New Expense Claim Application",
        f"{g.current_user['display_name']} submitted a receipts PDF on behalf of {employee['display_name']} for {project_name or project_id}.",
        link=f"/expense-claims/review?application={str(doc['_id'])}",
        related_id=str(doc["_id"]),
    )
    notify(
        str(employee["_id"]), "expense_claim_created_for_you", "Expense Claim Submitted On Your Behalf",
        f"{g.current_user['display_name']} submitted a receipts PDF on your behalf for {project_name or project_id}.",
        link=f"/expense-claims/{str(doc['_id'])}",
        related_id=str(doc["_id"]),
    )

    return jsonify({"application": ExpenseClaimApplicationModel.to_public(doc)}), 201


@bp.route("/mine", methods=["GET"])
@jwt_required_custom
def my_applications():
    db = get_db()
    user_id = str(g.current_user["_id"])
    apps = db[ExpenseClaimApplicationModel.COLLECTION].find(
        {"employee_user_id": user_id}
    ).sort("submitted_at", -1)
    return jsonify({"applications": [ExpenseClaimApplicationModel.to_public(a) for a in apps]}), 200


@bp.route("/<application_id>", methods=["GET"])
@jwt_required_custom
def get_application(application_id):
    app = _get_application_or_404(application_id)
    if not app:
        return jsonify({"error": "Application not found."}), 404
    if not _can_view(g.current_user, app):
        return jsonify({"error": "You do not have access to this application."}), 403
    return jsonify({"application": ExpenseClaimApplicationModel.to_public(app)}), 200


@bp.route("/<application_id>/pdf", methods=["GET"])
@jwt_required_custom
def get_source_pdf(application_id):
    app = _get_application_or_404(application_id)
    if not app:
        return jsonify({"error": "Application not found."}), 404
    if not _can_view(g.current_user, app):
        return jsonify({"error": "You do not have access to this application."}), 403
    found = file_storage_service.read(app["source_pdf_file_id"])
    if not found:
        return jsonify({"error": "Stored file not found."}), 404
    data, filename, content_type = found
    return Response(data, mimetype=content_type or "application/pdf", headers={
        "Content-Disposition": _content_disposition(filename),
    })


@bp.route("/<application_id>/receipts/<int:index>/pdf", methods=["GET"])
@jwt_required_custom
def get_receipt_pdf(application_id, index):
    app = _get_application_or_404(application_id)
    if not app:
        return jsonify({"error": "Application not found."}), 404
    if not _can_view(g.current_user, app):
        return jsonify({"error": "You do not have access to this application."}), 403
    receipts = app.get("receipts", [])
    if index < 0 or index >= len(receipts):
        return jsonify({"error": "No such receipt."}), 404
    found = file_storage_service.read(receipts[index]["file_id"])
    if not found:
        return jsonify({"error": "Stored file not found."}), 404
    data, filename, content_type = found
    return Response(data, mimetype=content_type or "application/pdf", headers={
        "Content-Disposition": _content_disposition(filename),
    })


@bp.route("/<application_id>/withdraw", methods=["POST"])
@jwt_required_custom
def withdraw_application(application_id):
    """The employee's own escape hatch, only while the claim genuinely
    hasn't been looked at yet: "submitted" (not yet processed) and
    "processing" (the AI job is running, but no human has acted) are
    both fair game. The instant it becomes "extracted" it enters the
    Accountant's queue and is shown to the employee themselves as "Under
    Review" (see utils/expenseClaims.js's STATUS_BADGE) - that's the
    literal line "reached under review" draws, and there's no walking it
    back from there without going through reject/re-review like anyone
    else's correction."""
    app = _get_application_or_404(application_id)
    if not app:
        return jsonify({"error": "Application not found."}), 404
    if app["employee_user_id"] != str(g.current_user["_id"]):
        return jsonify({"error": "You can only withdraw your own expense claim."}), 403
    if app["status"] not in ("submitted", "processing"):
        return jsonify({"error": "This claim is already under review and can no longer be withdrawn."}), 409

    db = get_db()
    result = db[ExpenseClaimApplicationModel.COLLECTION].find_one_and_update(
        {"_id": app["_id"], "status": app["status"]},
        {"$set": {"status": "withdrawn", "withdrawn_at": datetime.now(timezone.utc)}},
        return_document=True,
    )
    if not result:
        return jsonify({"error": "This application was changed by someone else - reload and try again."}), 409
    return jsonify({"application": ExpenseClaimApplicationModel.to_public(result)}), 200


def _search_receipts(project_id=None, date_from=None, date_to=None, q="", vat_present_only=False):
    """Search across every extracted, included receipt line - not scoped
    to one claim - by project/date range/free text/our-VAT-presence.
    Fetches candidate applications (filtered server-side by project where
    given) then filters/flattens receipts in Python: the simplest correct
    approach at this data volume (EGC's own headcount is ~100 employees
    per docs/PAYROLL_OPERATIONS.md in egc-erp-hr) - not worth a
    nested-array Mongo aggregation pipeline for a few hundred receipts at
    most. receipt_date/receipt_datetime are ISO strings (YYYY-MM-DD[...]),
    so plain string comparison sorts/filters them correctly with no need
    to parse into real datetimes first. Shared by search_receipts() (JSON)
    and export_receipts_zip() (a ZIP of the same filtered set, with PDFs).
    """
    db = get_db()
    mongo_filter = {"receipts.0": {"$exists": True}}
    if project_id:
        mongo_filter["project_id"] = project_id

    results = []
    for app in db[ExpenseClaimApplicationModel.COLLECTION].find(mongo_filter):
        for idx, r in enumerate(app.get("receipts", [])):
            if not r.get("included"):
                continue
            if vat_present_only and not r.get("our_vat_number_present"):
                continue
            receipt_date = r.get("receipt_date")
            if date_from and (not receipt_date or receipt_date < date_from):
                continue
            if date_to and (not receipt_date or receipt_date > date_to):
                continue
            if q:
                haystack = " ".join(str(x) for x in [
                    r.get("vendor_name") or "", r.get("description_en") or "", r.get("description_ar") or "",
                    r.get("receipt_number") or "", r.get("expense_category") or "",
                    " ".join((li.get("description") or "") for li in (r.get("line_items") or [])),
                ]).lower()
                if q not in haystack:
                    continue
            results.append({
                **r,
                "receipt_index": idx,
                "application_id": str(app["_id"]),
                "employee_display_name": app.get("employee_display_name"),
                "project_id": app.get("project_id"),
                "project_name": app.get("project_name"),
                "claim_status": app.get("status"),
            })

    results.sort(key=lambda r: r.get("receipt_datetime") or r.get("receipt_date") or "", reverse=True)
    return results


def _receipt_filters_from_request():
    return {
        "project_id": request.args.get("project_id") or None,
        "date_from": request.args.get("date_from") or None,
        "date_to": request.args.get("date_to") or None,
        "q": (request.args.get("q") or "").strip().lower(),
        "vat_present_only": (request.args.get("vat_present_only") or "").lower() in ("1", "true", "yes"),
    }


@bp.route("/receipts/search", methods=["GET"])
@require_permission("expense_claims.review")
def search_receipts():
    return jsonify({"receipts": _search_receipts(**_receipt_filters_from_request())}), 200


_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename_part(s: str, max_len: int = 40) -> str:
    return _SAFE_FILENAME_RE.sub("_", s or "").strip("_")[:max_len] or "receipt"


@bp.route("/receipts/export-zip", methods=["GET"])
@require_permission("expense_claims.review")
def export_receipts_zip():
    """Same filters as receipts/search (project_id/date_from/date_to/q),
    plus vat_present_only - bundles every matching receipt's PDF into one
    ZIP alongside a manifest.csv, for handing a batch to accounting/audit
    in one file rather than clicking through receipts one at a time."""
    filters = _receipt_filters_from_request()
    receipts = _search_receipts(**filters)
    if not receipts:
        return jsonify({"error": "No receipts match these filters."}), 404

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        manifest = io.StringIO()
        writer = csv.writer(manifest)
        writer.writerow([
            "Vendor", "Employee", "Project", "Date", "Amount (SAR)", "Category",
            "VAT Number", "Our VAT Present", "Receipt Number", "PDF Filename",
        ])

        used_names = set()
        for r in receipts:
            vendor = _safe_filename_part(r.get("vendor_name") or "receipt")
            date_part = _safe_filename_part((r.get("receipt_date") or "")[:10] or "undated")
            base_name = f"{date_part}_{vendor}"
            filename = f"{base_name}.pdf"
            n = 1
            while filename in used_names:
                n += 1
                filename = f"{base_name}_{n}.pdf"
            used_names.add(filename)

            found = file_storage_service.read(r["file_id"])
            if found:
                pdf_bytes, _, _ = found
                zf.writestr(filename, pdf_bytes)
            else:
                filename = "(file missing)"

            writer.writerow([
                r.get("vendor_name") or "", r.get("employee_display_name") or "",
                r.get("project_name") or r.get("project_id") or "",
                r.get("receipt_date") or "", r.get("total_amount") if r.get("total_amount") is not None else "",
                r.get("expense_category") or "", r.get("vat_number") or "",
                "Yes" if r.get("our_vat_number_present") else "No",
                r.get("receipt_number") or "", filename,
            ])

        # UTF-8 BOM: several vendor/employee names here are Arabic, and
        # Excel silently mis-renders UTF-8 CSVs without one.
        zf.writestr("manifest.csv", "﻿" + manifest.getvalue())

    buf.seek(0)
    export_name = f"receipts-export-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.zip"
    return Response(buf.getvalue(), mimetype="application/zip", headers={
        "Content-Disposition": f'attachment; filename="{export_name}"',
    })


@bp.route("/pending-review", methods=["GET"])
@require_permission("expense_claims.review")
def pending_review():
    """The Accountant's queue - everything still in their court: not yet
    processed, mid-processing, extracted and awaiting their approval, or
    sent back to them by the Operations Manager. Deliberately excludes
    `approved` (done) - matches deductions.py::pending_requests()'s
    single-status-set shape."""
    db = get_db()
    apps = db[ExpenseClaimApplicationModel.COLLECTION].find(
        {"status": {"$in": ["submitted", "processing", "extracted"]}}
    ).sort("submitted_at", -1)
    return jsonify({"applications": [ExpenseClaimApplicationModel.to_public(a) for a in apps]}), 200


@bp.route("/readiness", methods=["GET"])
@require_permission("expense_claims.review")
def readiness():
    findings = []
    if not Config.GEMINI_ENABLED or not Config.GEMINI_API_KEY:
        findings.append({
            "severity": "blocker",
            "title": "Gemini is not configured",
            "detail": "GEMINI_ENABLED/GEMINI_API_KEY must be set before AI extraction can run.",
        })

    company = request.args.get("company")
    if company:
        try:
            company_doc = erp_service.get_company(company)
            if not company_doc.get("default_expense_claim_payable_account"):
                findings.append({
                    "severity": "blocker", "title": f"{company} has no default Expense Claim payable account",
                    "detail": "Set Company.default_expense_claim_payable_account in ERPNext.",
                })
            if not company_doc.get("cost_center"):
                findings.append({
                    "severity": "blocker", "title": f"{company} has no default cost center",
                    "detail": "Set Company.cost_center in ERPNext.",
                })
        except ERPNextError as e:
            findings.append(_erp_error_finding("Cannot read Company from ERPNext", e))

        try:
            if not erp_service.expense_claim_type_exists():
                findings.append({
                    "severity": "blocker",
                    "title": f"Expense Claim Type '{erp_service.EXPENSE_CLAIM_TYPE}' does not exist",
                    "detail": "Create it in ERPNext and map it to a GL account for this company.",
                })
        except ERPNextError as e:
            findings.append(_erp_error_finding("Cannot read Expense Claim Type from ERPNext", e))

    return jsonify({"findings": findings}), 200


def _erp_error_finding(title: str, e: ERPNextError) -> dict:
    if e.status_code == 403:
        return {
            "severity": "blocker", "title": title,
            "detail": f"The ERP_API_KEY credential doesn't have permission for this: {e}. "
                      f"Grant the EGC Integration Agent (or whichever role this key uses) read "
                      f"access on Company/Expense Claim Type and read/write/create/submit on "
                      f"Expense Claim.",
        }
    return {"severity": "blocker", "title": title, "detail": str(e)}


def _job_is_stale(app: dict) -> bool:
    started = app.get("job_started_at")
    if not started:
        # status="processing" with no job_started_at can only be a record
        # from before this background-job model existed (the old code set
        # status="processing" synchronously, with no job tracking at all) -
        # there is zero evidence any job is actually in flight, so treat it
        # as stale rather than leaving it stuck forever.
        return True
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - started > timedelta(minutes=STALE_JOB_MINUTES)


@bp.route("/<application_id>/process", methods=["POST"])
@require_permission("expense_claims.review")
def process_application(application_id):
    app = _get_application_or_404(application_id)
    if not app:
        return jsonify({"error": "Application not found."}), 404

    startable = app["status"] in ("submitted", "accountant_approved") or (
        app["status"] == "processing" and _job_is_stale(app)
    )
    if not startable:
        return jsonify({"error": f"Cannot process from status '{app['status']}'."}), 409

    user = g.current_user
    db = get_db()
    # Atomic guard on `status` (rather than the read-then-write this replaced):
    # two accountants double-clicking "Start Processing" at once can only ever
    # have one of them actually flip the document and enqueue a job.
    result = db[ExpenseClaimApplicationModel.COLLECTION].find_one_and_update(
        {"_id": app["_id"], "status": app["status"]},
        {"$set": {
            "status": "processing", "processing_error": None,
            # A stale rejection_reason from a previous round-trip would
            # otherwise survive forever - status never actually becomes
            # "rejected" (accountant_reject/final_reject send it back to
            # "submitted"/"extracted" instead), so rejection_reason is the
            # only signal a "sent back for correction" banner has to key
            # off; starting a fresh run means whatever needed fixing is
            # being addressed, so the old reason is now stale.
            "rejection_reason": None,
            "job_status": "queued", "job_started_at": datetime.now(timezone.utc),
            "job_finished_at": None,
            "triggered_by_user_id": str(user["_id"]),
            "triggered_by_display_name": user["display_name"],
        }},
        return_document=True,
    )
    if not result:
        return jsonify({"error": "This application was changed by someone else - reload and try again."}), 409

    job_queue.submit(run_extraction_job, application_id)

    return jsonify({
        "application": ExpenseClaimApplicationModel.to_public(result),
        "message": "Extraction job started.",
    }), 202


@bp.route("/<application_id>/receipts/<int:index>", methods=["PATCH"])
@require_permission("expense_claims.review")
def update_receipt(application_id, index):
    app = _get_application_or_404(application_id)
    if not app:
        return jsonify({"error": "Application not found."}), 404
    receipts = app.get("receipts", [])
    if index < 0 or index >= len(receipts):
        return jsonify({"error": "No such receipt."}), 404

    body = request.get_json(silent=True) or {}
    editable = (
        "vendor_name", "vat_number", "receipt_number", "receipt_date", "subtotal_amount",
        "discount_amount", "vat_amount", "total_amount", "description_en", "description_ar",
        "included", "expense_category", "our_vat_number_present",
    )
    for field in editable:
        if field in body:
            receipts[index][field] = body[field]

    db = get_db()
    db[ExpenseClaimApplicationModel.COLLECTION].update_one(
        {"_id": app["_id"]},
        {"$set": {
            "receipts": receipts,
            "total_claimed_amount": ExpenseClaimApplicationModel.total_claimed(receipts),
        }},
    )
    updated = db[ExpenseClaimApplicationModel.COLLECTION].find_one({"_id": app["_id"]})
    return jsonify({"application": ExpenseClaimApplicationModel.to_public(updated)}), 200


@bp.route("/<application_id>/approve", methods=["POST"])
@require_permission("expense_claims.review")
def accountant_approve(application_id):
    app = _get_application_or_404(application_id)
    if not app:
        return jsonify({"error": "Application not found."}), 404
    if app["status"] != "extracted":
        return jsonify({"error": f"Cannot approve from status '{app['status']}'."}), 409
    if not any(r.get("included") for r in app.get("receipts", [])):
        return jsonify({"error": "At least one receipt must be marked Included before approving."}), 400

    user = g.current_user
    db = get_db()
    db[ExpenseClaimApplicationModel.COLLECTION].update_one(
        {"_id": app["_id"]},
        {"$set": {
            "status": "accountant_approved",
            "accountant_reviewed_by": str(user["_id"]), "accountant_reviewed_by_name": user["display_name"],
            "accountant_reviewed_at": datetime.now(timezone.utc),
        }},
    )

    notify_all_with_permission(
        "expense_claims.final_approve", "expense_claim_ready_for_final_approval",
        "Expense Claim ready for final approval",
        f"{user['display_name']} approved {app['employee_display_name']}'s expense claim "
        f"({app.get('total_claimed_amount', 0)} SAR).",
        link=f"/expense-claims/final-approval?application={application_id}",
        related_id=application_id,
    )

    updated = db[ExpenseClaimApplicationModel.COLLECTION].find_one({"_id": app["_id"]})
    return jsonify({"application": ExpenseClaimApplicationModel.to_public(updated)}), 200


@bp.route("/<application_id>/reject", methods=["POST"])
@require_permission("expense_claims.review")
def accountant_reject(application_id):
    app = _get_application_or_404(application_id)
    if not app:
        return jsonify({"error": "Application not found."}), 404
    if app["status"] not in ("extracted", "accountant_approved"):
        return jsonify({"error": f"Cannot reject from status '{app['status']}'."}), 409

    body = request.get_json(silent=True) or {}
    reason = body.get("reason")
    if not reason:
        return jsonify({"error": "reason is required when rejecting."}), 400

    db = get_db()
    db[ExpenseClaimApplicationModel.COLLECTION].update_one(
        {"_id": app["_id"]}, {"$set": {"status": "submitted", "rejection_reason": reason}},
    )
    notify(
        app["employee_user_id"], "expense_claim_rejected", "Expense Claim sent back for correction",
        reason, link=f"/expense-claims/{application_id}", related_id=application_id,
    )
    updated = db[ExpenseClaimApplicationModel.COLLECTION].find_one({"_id": app["_id"]})
    return jsonify({"application": ExpenseClaimApplicationModel.to_public(updated)}), 200


@bp.route("/pending-final-approval", methods=["GET"])
@require_permission("expense_claims.final_approve")
def pending_final_approval():
    db = get_db()
    apps = db[ExpenseClaimApplicationModel.COLLECTION].find(
        {"status": "accountant_approved"}
    ).sort("accountant_reviewed_at", -1)
    return jsonify({"applications": [ExpenseClaimApplicationModel.to_public(a) for a in apps]}), 200


@bp.route("/final-approve", methods=["POST"])
@require_permission("expense_claims.final_approve")
def final_approve():
    """Bulk: the operations manager selects any number of
    accountant_approved applications and approves them together. Each
    one pushes to ERPNext independently, so one bad application in the
    batch doesn't block the rest - results report per-application
    outcome, same shape as attendance.py's final_approve_submissions()."""
    db = get_db()
    user = g.current_user
    body = request.get_json(silent=True) or {}
    application_ids = body.get("application_ids") or []
    if not application_ids:
        return jsonify({"error": "application_ids is required and must be non-empty."}), 400

    results = []
    for application_id in application_ids:
        app = _get_application_or_404(application_id)
        if not app or app["status"] != "accountant_approved":
            results.append({"application_id": application_id, "ok": False, "error": "Not awaiting final approval."})
            continue

        push_status, push_detail, erp_expense_claim = "failed", None, None
        try:
            erp_expense_claim = erp_service.push_expense_claim(app, app["employee_erp_id"])
            push_status = "pushed"
        except ERPNextError as e:
            push_detail = str(e)

        now = datetime.now(timezone.utc)
        db[ExpenseClaimApplicationModel.COLLECTION].update_one(
            {"_id": app["_id"]},
            {"$set": {
                "status": "approved",
                "final_reviewed_by": str(user["_id"]), "final_reviewed_by_name": user["display_name"],
                "final_reviewed_at": now,
                "push_status": push_status, "push_detail": push_detail,
                "erp_expense_claim": erp_expense_claim,
            }},
        )

        if push_status == "pushed":
            notify(
                app["employee_user_id"], "expense_claim_approved", "Your expense claim was approved",
                f"{app.get('total_claimed_amount', 0)} SAR has been submitted to accounting.",
                link=f"/expense-claims/{application_id}", related_id=application_id,
            )
        else:
            notify(
                str(user["_id"]), "expense_claim_push_failed", "Expense claim approved but didn't reach ERPNext",
                f"{app['employee_display_name']}'s claim was approved but ERPNext rejected it: {push_detail}",
                link="/expense-claims/final-approval", related_id=application_id,
            )
        results.append({"application_id": application_id, "ok": True, "push_status": push_status})

    return jsonify({"results": results}), 200


@bp.route("/final-reject", methods=["POST"])
@require_permission("expense_claims.final_approve")
def final_reject():
    db = get_db()
    user = g.current_user
    body = request.get_json(silent=True) or {}
    application_ids = body.get("application_ids") or []
    reason = body.get("reason")
    if not application_ids:
        return jsonify({"error": "application_ids is required and must be non-empty."}), 400
    if not reason:
        return jsonify({"error": "reason is required when rejecting."}), 400

    results = []
    for application_id in application_ids:
        app = _get_application_or_404(application_id)
        if not app or app["status"] != "accountant_approved":
            results.append({"application_id": application_id, "ok": False, "error": "Not awaiting final approval."})
            continue

        db[ExpenseClaimApplicationModel.COLLECTION].update_one(
            {"_id": app["_id"]},
            {"$set": {
                # Back to "extracted", not "accountant_approved" - the
                # Accountant's earlier approval is exactly what's being
                # overturned, so it must not silently reappear unchanged
                # in this same final-approval queue.
                "status": "extracted", "rejection_reason": reason,
                "final_reviewed_by": str(user["_id"]), "final_reviewed_by_name": user["display_name"],
                "final_reviewed_at": datetime.now(timezone.utc),
            }},
        )
        notify_all_with_permission(
            "expense_claims.review", "expense_claim_final_rejected", "Expense Claim rejected at final approval",
            f"{user['display_name']} rejected {app['employee_display_name']}'s claim: {reason}",
            link=f"/expense-claims/review?application={application_id}",
            related_id=application_id,
        )
        results.append({"application_id": application_id, "ok": True})

    return jsonify({"results": results}), 200
