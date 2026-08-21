"""
Deduction Routes  —  /api/deductions
=======================================
GET  /employees                    — active-employee search, for the "who is this about" picker
POST /requests                     — a supervisor flags an incident (equipment damage,
                                      verified unproductive hours, etc. - NOT traffic
                                      violations, which HR records manually - see
                                      DeductionRequestModel's own docstring)
GET  /requests/mine                — the caller's own submitted requests
GET  /requests/pending             — HR's review queue
GET  /requests/<id>                 — detail
POST /requests/<id>/convert         — HR picks the real category/amount/date and creates
                                       the actual EGC Deduction
POST /requests/<id>/dismiss         — HR declines to act on it
GET  /categories                    — active EGC Deduction Categories, for the convert form
GET  /mine                          — the caller's own Deductions (from egc_hr)
POST /<name>/appeal                 — the deducted employee appeals it
GET  /appeals/pending               — HR's appeal review queue
POST /<name>/resolve-appeal         — HR upholds or overturns an appeal

Two different authorities, same shape as attendance's two-tier review:
a supervisor's request is only a flag - it never touches egc_hr by
itself. Only deductions.review (HR) can convert it into a real,
submitted EGC Deduction or resolve an appeal against one.
"""

from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, request, jsonify, g

from app.utils.database import get_db
from app.models.deduction_request import DeductionRequestModel
from app.middleware.auth_middleware import jwt_required_custom, require_permission
from app.services.project_site_cache import get_sites
from app.services.erp_service import erp_service, ERPNextError
from app.services.egc_hr_service import egc_hr_service, EGCHRError
from app.services.notification_service import notify, notify_by_erp_employee_id, notify_all_with_permission

bp = Blueprint("deductions", __name__, url_prefix="/api/deductions")


def _caller_supervises_anything() -> bool:
    user = g.current_user
    if user.get("is_sysadmin"):
        return True
    erp_employee_id = user.get("erp_employee_id")
    if not erp_employee_id:
        return False
    return any(erp_employee_id in (site.get("supervisors") or []) for site in get_sites())


@bp.route("/employees", methods=["GET"])
@jwt_required_custom
def search_employees():
    if not _caller_supervises_anything():
        return jsonify({"error": "You do not supervise any project sites."}), 403
    try:
        employees = erp_service.search_employees_for_picker(request.args.get("search"))
    except ERPNextError as e:
        return jsonify({"error": str(e)}), e.status_code
    return jsonify({"employees": employees}), 200


@bp.route("/requests", methods=["POST"])
@jwt_required_custom
def create_request():
    user = g.current_user
    body = request.get_json(silent=True) or {}

    employee_erp_id = body.get("employee_erp_id")
    category_hint = body.get("category_hint")
    description = body.get("description")
    if not employee_erp_id or not category_hint or not description:
        return jsonify({"error": "employee_erp_id, category_hint, and description are required."}), 400
    if category_hint not in DeductionRequestModel.CATEGORY_HINTS:
        return jsonify({"error": f"category_hint must be one of {DeductionRequestModel.CATEGORY_HINTS}."}), 400
    if not _caller_supervises_anything():
        return jsonify({"error": "You do not supervise any project sites."}), 403

    try:
        employee = erp_service.get_employee(employee_erp_id)
    except ERPNextError as e:
        return jsonify({"error": str(e)}), e.status_code
    if not employee:
        return jsonify({"error": "Unknown employee."}), 404

    project_id = body.get("project_id")
    project_name = next((s.get("project_name") for s in get_sites() if s["name"] == project_id), None) \
        if project_id else None

    incident_date = None
    if body.get("incident_date"):
        incident_date = datetime.fromisoformat(body["incident_date"]).replace(tzinfo=timezone.utc)

    doc = DeductionRequestModel.new(
        requested_by_user_id=str(user["_id"]), requested_by_username=user["username"],
        requested_by_display_name=user["display_name"],
        employee_erp_id=employee_erp_id, employee_display_name=employee.get("employee_name", employee_erp_id),
        category_hint=category_hint, description=description,
        project_id=project_id, project_name=project_name, incident_date=incident_date,
        suggested_amount=body.get("suggested_amount"), suggested_hours=body.get("suggested_hours"),
    )
    db = get_db()
    result = db[DeductionRequestModel.COLLECTION].insert_one(doc)
    doc["_id"] = result.inserted_id

    notify_all_with_permission(
        "deductions.review", "deduction_requested", "New Deduction Request",
        f"{user['display_name']} flagged {employee.get('employee_name', employee_erp_id)}: {category_hint}.",
        link=f"/deductions/review?request={str(doc['_id'])}",
        related_id=str(doc["_id"]),
    )

    return jsonify({"request": DeductionRequestModel.to_public(doc)}), 201


@bp.route("/requests/mine", methods=["GET"])
@jwt_required_custom
def my_requests():
    db = get_db()
    user_id = str(g.current_user["_id"])
    reqs = db[DeductionRequestModel.COLLECTION].find({"requested_by_user_id": user_id}).sort("submitted_at", -1)
    return jsonify({"requests": [DeductionRequestModel.to_public(r) for r in reqs]}), 200


@bp.route("/requests/pending", methods=["GET"])
@require_permission("deductions.review")
def pending_requests():
    db = get_db()
    reqs = db[DeductionRequestModel.COLLECTION].find({"status": "pending"}).sort("submitted_at", -1)
    return jsonify({"requests": [DeductionRequestModel.to_public(r) for r in reqs]}), 200


def _get_request_or_404(request_id):
    db = get_db()
    return db[DeductionRequestModel.COLLECTION].find_one({"_id": ObjectId(request_id)})


@bp.route("/requests/<request_id>", methods=["GET"])
@jwt_required_custom
def get_request(request_id):
    user = g.current_user
    req = _get_request_or_404(request_id)
    if not req:
        return jsonify({"error": "Request not found."}), 404
    is_owner = req["requested_by_user_id"] == str(user["_id"])
    is_reviewer = "deductions.review" in user.get("permissions", []) or user.get("is_sysadmin")
    if not is_owner and not is_reviewer:
        return jsonify({"error": "You are neither the requester nor a reviewer."}), 403
    return jsonify({"request": DeductionRequestModel.to_public(req)}), 200


@bp.route("/requests/<request_id>/convert", methods=["POST"])
@require_permission("deductions.review")
def convert_request(request_id):
    """HR's decision: pick the real EGC Deduction Category, the final
    amount/hours (the supervisor's suggestion is never binding), and the
    date to attribute it to, then create the actual, submitted
    EGC Deduction. source_reference is this request's own id, so a
    retried call is idempotent against egc_hr (create() de-dupes on it)."""
    db = get_db()
    user = g.current_user
    body = request.get_json(silent=True) or {}

    category = body.get("category")
    deduction_date = body.get("deduction_date")
    if not category or not deduction_date:
        return jsonify({"error": "category and deduction_date are required."}), 400

    req = _get_request_or_404(request_id)
    if not req:
        return jsonify({"error": "Request not found."}), 404
    if req["status"] != "pending":
        return jsonify({"error": f"This request is already '{req['status']}'."}), 409

    payload = {
        "employee_reference": req["employee_erp_id"],
        "category": category,
        "deduction_date": deduction_date,
        "reason": f"{req['category_hint']}: {req['description']} (flagged by {req['requested_by_display_name']})",
        "reference": body.get("reference"),
        "source_reference": f"EGCAPP-DEDREQ-{req['_id']}",
    }
    if body.get("amount") is not None:
        payload["amount"] = body["amount"]
    if body.get("hours") is not None:
        payload["hours"] = body["hours"]
    if body.get("percentage") is not None:
        payload["percentage"] = body["percentage"]

    push_status, push_detail, egc_hr_deduction = "failed", None, None
    try:
        response = egc_hr_service.create_deduction(payload)
        egc_hr_deduction = response.get("deduction")
        push_status = "pushed"
    except EGCHRError as e:
        push_detail = str(e)

    now = datetime.now(timezone.utc)
    db[DeductionRequestModel.COLLECTION].update_one(
        {"_id": req["_id"]},
        {"$set": {
            "status": "converted",
            "resolved_by_user_id": str(user["_id"]), "resolved_by_name": user["display_name"],
            "resolved_at": now, "resolution_note": body.get("resolution_note"),
            "deduction_category_code": category, "final_amount": body.get("amount"),
            "final_hours": body.get("hours"), "deduction_date": deduction_date,
            "egc_hr_deduction": egc_hr_deduction, "push_status": push_status, "push_detail": push_detail,
        }},
    )

    if push_status == "pushed":
        notify_by_erp_employee_id(
            req["employee_erp_id"], "deduction_created", "A deduction was recorded against your pay",
            f"{req['category_hint']}: {req['description']}",
            link="/deductions/mine",
            related_id=egc_hr_deduction,
        )
    else:
        notify(
            str(user["_id"]), "deduction_push_failed", "Deduction approved but didn't reach payroll",
            f"{req['employee_display_name']}'s deduction was approved but egc_hr rejected it: {push_detail}",
            link=f"/deductions/review?request={request_id}",
            related_id=request_id,
        )

    updated = _get_request_or_404(request_id)
    return jsonify({"request": DeductionRequestModel.to_public(updated)}), 200


@bp.route("/requests/<request_id>/dismiss", methods=["POST"])
@require_permission("deductions.review")
def dismiss_request(request_id):
    db = get_db()
    user = g.current_user
    body = request.get_json(silent=True) or {}
    resolution_note = body.get("resolution_note")
    if not resolution_note:
        return jsonify({"error": "resolution_note is required when dismissing."}), 400

    req = _get_request_or_404(request_id)
    if not req:
        return jsonify({"error": "Request not found."}), 404
    if req["status"] != "pending":
        return jsonify({"error": f"This request is already '{req['status']}'."}), 409

    db[DeductionRequestModel.COLLECTION].update_one(
        {"_id": req["_id"]},
        {"$set": {
            "status": "dismissed",
            "resolved_by_user_id": str(user["_id"]), "resolved_by_name": user["display_name"],
            "resolved_at": datetime.now(timezone.utc), "resolution_note": resolution_note,
        }},
    )
    notify(
        req["requested_by_user_id"], "deduction_request_dismissed", "Deduction Request dismissed",
        f"{user['display_name']} dismissed your request for {req['employee_display_name']}: {resolution_note}",
        link="/deductions/new",
        related_id=request_id,
    )

    updated = _get_request_or_404(request_id)
    return jsonify({"request": DeductionRequestModel.to_public(updated)}), 200


@bp.route("/categories", methods=["GET"])
@require_permission("deductions.review")
def categories():
    try:
        return jsonify({"categories": egc_hr_service.list_deduction_categories()}), 200
    except EGCHRError as e:
        return jsonify({"error": str(e)}), e.status_code


@bp.route("/mine", methods=["GET"])
@jwt_required_custom
def my_deductions():
    user = g.current_user
    if not user.get("erp_employee_id"):
        return jsonify({"deductions": []}), 200
    try:
        deductions = egc_hr_service.list_deductions_for_employee(user["erp_employee_id"])
    except EGCHRError as e:
        return jsonify({"error": str(e)}), e.status_code
    return jsonify({"deductions": deductions}), 200


@bp.route("/<deduction_name>/appeal", methods=["POST"])
@jwt_required_custom
def appeal_deduction(deduction_name):
    user = g.current_user
    body = request.get_json(silent=True) or {}
    appeal_reason = body.get("appeal_reason")
    if not appeal_reason:
        return jsonify({"error": "appeal_reason is required."}), 400
    if not user.get("erp_employee_id"):
        return jsonify({"error": "Your account is not linked to an ERP employee record."}), 400

    try:
        response = egc_hr_service.appeal_deduction(deduction_name, user["erp_employee_id"], appeal_reason)
    except EGCHRError as e:
        return jsonify({"error": str(e)}), e.status_code

    notify_all_with_permission(
        "deductions.review", "deduction_appealed", "Deduction appealed",
        f"{user['display_name']} appealed a deduction: {appeal_reason}",
        link="/deductions/review?tab=appeals",
        related_id=deduction_name,
    )

    return jsonify({"deduction": response}), 200


@bp.route("/appeals/pending", methods=["GET"])
@require_permission("deductions.review")
def pending_appeals():
    try:
        return jsonify({"deductions": egc_hr_service.list_pending_deduction_appeals()}), 200
    except EGCHRError as e:
        return jsonify({"error": str(e)}), e.status_code


@bp.route("/<deduction_name>/resolve-appeal", methods=["POST"])
@require_permission("deductions.review")
def resolve_appeal(deduction_name):
    user = g.current_user
    body = request.get_json(silent=True) or {}
    outcome = body.get("outcome")
    if outcome not in ("Upheld", "Overturned"):
        return jsonify({"error": "outcome must be 'Upheld' or 'Overturned'."}), 400
    if not user.get("erp_employee_id"):
        return jsonify({"error": "Your account is not linked to an ERP employee record."}), 400

    try:
        response = egc_hr_service.resolve_deduction_appeal(
            deduction_name, user["erp_employee_id"], outcome, body.get("resolution_notes"),
        )
    except EGCHRError as e:
        return jsonify({"error": str(e)}), e.status_code

    # response["employee"] is an egc_hr Employee id, not an EGC App user_id.
    notify_by_erp_employee_id(
        response.get("employee"), "deduction_appeal_resolved", f"Your deduction appeal was {outcome.lower()}",
        body.get("resolution_notes") or f"{user['display_name']} {outcome.lower()} your appeal.",
        link="/deductions/mine",
        related_id=deduction_name,
    )

    return jsonify({"deduction": response}), 200
