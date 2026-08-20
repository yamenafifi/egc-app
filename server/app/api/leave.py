"""
Leave Routes  —  /api/leave
=============================
GET  /types                  — proxy of ERPNext's stock Leave Type list
POST /requests                — submit (calls egc_hr's submit_leave_request)
GET  /requests                — the caller's own leave requests
GET  /requests/team           — requests where the caller is leave_approver
GET  /requests/<id>            — detail (refreshes from egc_hr's get_status)
POST /requests/<id>/approve    — 403 unless caller is the assigned approver
POST /requests/<id>/reject
"""

from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, request, jsonify, g

from app.utils.database import get_db
from app.models.leave_request import LeaveRequestModel
from app.middleware.auth_middleware import jwt_required_custom
from app.services.erp_service import erp_service, ERPNextError
from app.services.egc_hr_service import egc_hr_service, EGCHRError
from app.services.notification_service import notify, notify_by_erp_employee_id

bp = Blueprint("leave", __name__, url_prefix="/api/leave")


@bp.route("/types", methods=["GET"])
@jwt_required_custom
def leave_types():
    try:
        return jsonify({"leave_types": erp_service.get_leave_types()}), 200
    except ERPNextError as e:
        return jsonify({"error": str(e)}), e.status_code


@bp.route("/requests", methods=["POST"])
@jwt_required_custom
def create_request():
    db = get_db()
    user = g.current_user
    body = request.get_json(silent=True) or {}

    leave_type = body.get("leave_type")
    from_date, to_date = body.get("from_date"), body.get("to_date")
    if not leave_type or not from_date or not to_date:
        return jsonify({"error": "leave_type, from_date, and to_date are required."}), 400
    if not user.get("erp_employee_id"):
        return jsonify({"error": "Your account is not linked to an ERP employee record."}), 400

    external_reference = f"EGCAPP-LV-{ObjectId()}"

    try:
        response = egc_hr_service.submit_leave_request({
            "external_reference": external_reference,
            "employee_reference": user["erp_employee_id"],
            "leave_type": leave_type,
            "from_date": from_date,
            "to_date": to_date,
            "reason": body.get("reason", ""),
        })
    except EGCHRError as e:
        return jsonify({"error": str(e)}), e.status_code

    # leave_approver is a User (see docs/EGC_APP_INTEGRATION.md) - resolve
    # to the Employee identity EGC App's own routing needs.
    leave_approver_erp_id = None
    if response.get("leave_approver"):
        approver_employee = erp_service.get_employee_by_user_id(response["leave_approver"])
        leave_approver_erp_id = approver_employee.get("name")

    doc = LeaveRequestModel.new(
        user_id=str(user["_id"]), username=user["username"], display_name=user["display_name"],
        erp_employee_id=user["erp_employee_id"],
        external_reference=external_reference,
        leave_type=leave_type, from_date=from_date, to_date=to_date, reason=body.get("reason", ""),
        leave_approver_erp_id=leave_approver_erp_id,
        leave_approver_name=response.get("leave_approver_name"),
    )
    doc["leave_application"] = response.get("leave_application")
    doc["status"] = response.get("status", "Open")
    doc["docstatus"] = response.get("docstatus", 0)
    result = db[LeaveRequestModel.COLLECTION].insert_one(doc)
    doc["_id"] = result.inserted_id

    if leave_approver_erp_id:
        notify_by_erp_employee_id(
            leave_approver_erp_id, "leave_submitted", "New leave request",
            f"{user['display_name']} requested {leave_type} ({from_date} to {to_date}).",
            link=f"/leaves?tab=team&leave={str(doc['_id'])}",
            related_id=str(doc["_id"]),
        )
    # If the approver has no EGC App account yet, this is silently skipped -
    # an onboarding-ordering gap, not an error (see notify_by_erp_employee_id).

    return jsonify({"request": LeaveRequestModel.to_public(doc)}), 201


@bp.route("/requests", methods=["GET"])
@jwt_required_custom
def my_requests():
    db = get_db()
    user_id = str(g.current_user["_id"])
    reqs = db[LeaveRequestModel.COLLECTION].find({"user_id": user_id}).sort("submitted_at", -1)
    return jsonify({"requests": [LeaveRequestModel.to_public(r) for r in reqs]}), 200


@bp.route("/requests/team", methods=["GET"])
@jwt_required_custom
def team_requests():
    db = get_db()
    erp_employee_id = g.current_user.get("erp_employee_id")
    if not erp_employee_id:
        return jsonify({"requests": []}), 200
    reqs = db[LeaveRequestModel.COLLECTION].find(
        {"leave_approver_erp_id": erp_employee_id, "status": "Open"}
    ).sort("submitted_at", -1)
    return jsonify({"requests": [LeaveRequestModel.to_public(r) for r in reqs]}), 200


def _get_request_or_404(request_id):
    db = get_db()
    return db[LeaveRequestModel.COLLECTION].find_one({"_id": ObjectId(request_id)})


@bp.route("/requests/<request_id>", methods=["GET"])
@jwt_required_custom
def get_request(request_id):
    db = get_db()
    req = _get_request_or_404(request_id)
    if not req:
        return jsonify({"error": "Request not found."}), 404

    # Opportunistically refresh - covers a supervisor who approved directly
    # from the ERPNext Desk instead of through EGC App.
    try:
        status = egc_hr_service.get_leave_status(req["external_reference"])
        if status.get("status") != req.get("status"):
            db[LeaveRequestModel.COLLECTION].update_one(
                {"_id": req["_id"]},
                {"$set": {
                    "status": status.get("status"), "docstatus": status.get("docstatus"),
                    "last_synced_at": datetime.now(timezone.utc),
                }},
            )
            req = _get_request_or_404(request_id)
    except EGCHRError:
        pass  # serve the last-known local state if egc_hr is unreachable

    return jsonify({"request": LeaveRequestModel.to_public(req)}), 200


def _action_request(request_id, action_fn, notification_type, notification_title):
    db = get_db()
    user = g.current_user
    body = request.get_json(silent=True) or {}

    req = _get_request_or_404(request_id)
    if not req:
        return jsonify({"error": "Request not found."}), 404

    if not user.get("is_sysadmin") and user.get("erp_employee_id") != req.get("leave_approver_erp_id"):
        return jsonify({"error": "You are not the assigned approver for this request."}), 403

    try:
        response = action_fn(req["external_reference"], user["erp_employee_id"], body.get("remarks"))
    except EGCHRError as e:
        return jsonify({"error": str(e)}), e.status_code

    if response.get("result") == "validation_error":
        return jsonify({"error": response.get("message")}), 422

    db[LeaveRequestModel.COLLECTION].update_one(
        {"_id": req["_id"]},
        {"$set": {
            "status": response.get("status"), "docstatus": response.get("docstatus"),
            "actioned_by_user_id": str(user["_id"]), "actioned_by_name": user["display_name"],
            "actioned_at": datetime.now(timezone.utc), "action_remarks": body.get("remarks"),
            "updated_at": datetime.now(timezone.utc),
        }},
    )

    notify(
        req["user_id"], notification_type, notification_title,
        f"{user['display_name']}: {body.get('remarks') or 'No remarks.'}",
        link="/leaves?tab=mine",
        related_id=str(req["_id"]),
    )

    updated = _get_request_or_404(request_id)
    return jsonify({"request": LeaveRequestModel.to_public(updated)}), 200


@bp.route("/requests/<request_id>/approve", methods=["POST"])
@jwt_required_custom
def approve_request(request_id):
    return _action_request(request_id, egc_hr_service.approve_leave, "leave_approved", "Leave request approved")


@bp.route("/requests/<request_id>/reject", methods=["POST"])
@jwt_required_custom
def reject_request(request_id):
    return _action_request(request_id, egc_hr_service.reject_leave, "leave_rejected", "Leave request rejected")
