"""
Timesheet API
=============
All timesheet endpoints: QR clock-in/out, entries, submissions, approval, ERP push.
"""

from flask import Blueprint, request, jsonify, g
from app.middleware.auth_middleware import require_permission, jwt_required_custom
from app.services.timesheet_service import timesheet_service, TimesheetError
from app.services.erp_service import erp_service, ERPNextError

bp = Blueprint("timesheets", __name__, url_prefix="/api/timesheets")


def _ts_error(e: TimesheetError):
    return jsonify({"error": str(e)}), e.status_code


# ── QR / Clock ────────────────────────────────────────────────────────────────

@bp.route("/qr/<employee_id>", methods=["GET"])
@jwt_required_custom
def get_qr_info(employee_id):
    """Return employee info needed to render a QR code."""
    try:
        data = timesheet_service.get_user_qr_info(employee_id)
        return jsonify(data), 200
    except TimesheetError as e:
        return _ts_error(e)


@bp.route("/clock-status/<employee_id>", methods=["GET"])
@require_permission("timesheet.view_own")
def clock_status(employee_id):
    """Check if an employee is currently clocked in."""
    user = g.current_user
    is_sysadmin = user.get("is_sysadmin", False)
    has_view_all = is_sysadmin or "timesheet.view_all" in user.get("permissions", [])

    # Non-privileged users can only check their own status
    if not has_view_all and str(user["_id"]) != employee_id:
        return jsonify({"error": "Access denied."}), 403

    try:
        return jsonify(timesheet_service.get_clock_status(employee_id)), 200
    except TimesheetError as e:
        return _ts_error(e)


@bp.route("/clock-in", methods=["POST"])
@require_permission("timesheet.add_record")
def clock_in():
    """Clock an employee in to a project. Called by the supervisor after scanning QR."""
    data = request.get_json() or {}
    employee_id = data.get("employee_id", "").strip()
    project_id = data.get("project_id", "").strip()
    note = data.get("note", "").strip()

    if not employee_id:
        return jsonify({"error": "employee_id is required."}), 400
    if not project_id:
        return jsonify({"error": "project_id is required."}), 400

    try:
        record = timesheet_service.clock_in(
            target_user_id=employee_id,
            project_id=project_id,
            scanner=g.current_user,
            note=note,
        )
        return jsonify({"record": record}), 201
    except TimesheetError as e:
        return _ts_error(e)


@bp.route("/clock-out", methods=["POST"])
@require_permission("timesheet.add_record")
def clock_out():
    """Clock an employee out of their active session."""
    data = request.get_json() or {}
    employee_id = data.get("employee_id", "").strip()
    note = data.get("note", "").strip()

    if not employee_id:
        return jsonify({"error": "employee_id is required."}), 400

    try:
        record = timesheet_service.clock_out(
            target_user_id=employee_id,
            scanner=g.current_user,
            note=note,
        )
        return jsonify({"record": record}), 200
    except TimesheetError as e:
        return _ts_error(e)


# ── Projects (proxied from ERP) ───────────────────────────────────────────────

@bp.route("/projects", methods=["GET"])
@require_permission("timesheet.add_record")
def list_projects():
    """Fetch active projects from ERPNext for the clock-in selector."""
    search = request.args.get("search", "").strip()
    try:
        projects = erp_service.get_project_list(search=search or None)
        return jsonify({"projects": projects}), 200
    except ERPNextError as e:
        return jsonify({"error": str(e)}), e.status_code


# ── Entries ───────────────────────────────────────────────────────────────────

@bp.route("/entries", methods=["GET"])
@require_permission("timesheet.view_own")
def list_entries():
    filters = {
        "user_id": request.args.get("user_id"),
        "status": request.args.get("status"),
        "project_id": request.args.get("project_id"),
        "date_from": request.args.get("date_from"),
        "date_to": request.args.get("date_to"),
        "page": request.args.get("page", 1),
        "page_length": request.args.get("page_length", 50),
    }
    try:
        result = timesheet_service.list_entries(g.current_user, filters)
        return jsonify(result), 200
    except TimesheetError as e:
        return _ts_error(e)


@bp.route("/entries/<entry_id>", methods=["DELETE"])
@require_permission("timesheet.delete_own")
def delete_entry(entry_id):
    try:
        timesheet_service.delete_entry(entry_id, g.current_user)
        return jsonify({"message": "Entry deleted."}), 200
    except TimesheetError as e:
        return _ts_error(e)


# ── Submissions ───────────────────────────────────────────────────────────────

@bp.route("/submissions", methods=["GET"])
@require_permission("timesheet.view_own")
def list_submissions():
    filters = {
        "user_id": request.args.get("user_id"),
        "status": request.args.get("status"),
        "page": request.args.get("page", 1),
        "page_length": request.args.get("page_length", 25),
    }
    try:
        result = timesheet_service.list_submissions(g.current_user, filters)
        return jsonify(result), 200
    except TimesheetError as e:
        return _ts_error(e)


@bp.route("/submissions", methods=["POST"])
@require_permission("timesheet.add_record")
def create_submission():
    data = request.get_json() or {}
    entry_ids = data.get("entry_ids", [])
    if not entry_ids or not isinstance(entry_ids, list):
        return jsonify({"error": "entry_ids must be a non-empty list."}), 400

    try:
        submission = timesheet_service.create_submission(entry_ids, g.current_user)
        return jsonify({"submission": submission}), 201
    except TimesheetError as e:
        return _ts_error(e)


@bp.route("/submissions/<submission_id>", methods=["GET"])
@require_permission("timesheet.view_own")
def get_submission(submission_id):
    try:
        result = timesheet_service.get_submission(submission_id, g.current_user)
        return jsonify({"submission": result}), 200
    except TimesheetError as e:
        return _ts_error(e)


@bp.route("/submissions/<submission_id>/approve", methods=["POST"])
@require_permission("timesheet.approve")
def approve_submission(submission_id):
    try:
        result = timesheet_service.approve_submission(submission_id, g.current_user)
        return jsonify({"submission": result, "message": "Submission approved."}), 200
    except TimesheetError as e:
        return _ts_error(e)


@bp.route("/submissions/<submission_id>/reject", methods=["POST"])
@require_permission("timesheet.approve")
def reject_submission(submission_id):
    data = request.get_json() or {}
    note = data.get("note", "").strip()
    if not note:
        return jsonify({"error": "A rejection note is required."}), 400

    try:
        result = timesheet_service.reject_submission(submission_id, g.current_user, note)
        return jsonify({"submission": result, "message": "Submission rejected."}), 200
    except TimesheetError as e:
        return _ts_error(e)


@bp.route("/submissions/<submission_id>/push", methods=["POST"])
@require_permission("timesheet.submit_to_erp")
def push_to_erp(submission_id):
    try:
        result = timesheet_service.push_to_erp(submission_id, g.current_user)
        return jsonify({
            "submission": result,
            "message": f"Successfully pushed to ERPNext as {result['erp_timesheet_id']}.",
        }), 200
    except TimesheetError as e:
        return _ts_error(e)


@bp.route("/submissions/<submission_id>", methods=["DELETE"])
@require_permission("timesheet.approve")
def delete_submission(submission_id):
    """Delete a timesheet bundle. Records are returned to closed state."""
    try:
        timesheet_service.delete_submission(submission_id, g.current_user)
        return jsonify({"message": "Submission deleted."}), 200
    except TimesheetError as e:
        return _ts_error(e)


@bp.route("/manual-entry", methods=["POST"])
@require_permission("timesheet.add_record")
def manual_entry():
    """Supervisor manually records a completed shift on behalf of an employee."""
    from datetime import datetime, timezone
    data = request.get_json() or {}

    employee_id = (data.get("employee_id") or "").strip()
    project_id  = (data.get("project_id")  or "").strip()
    clock_in_s  = (data.get("clock_in")    or "").strip()
    clock_out_s = (data.get("clock_out")   or "").strip()
    note        = (data.get("note")        or "").strip()

    if not employee_id:  return jsonify({"error": "employee_id is required."}), 400
    if not project_id:   return jsonify({"error": "project_id is required."}), 400
    if not clock_in_s:   return jsonify({"error": "clock_in is required."}), 400
    if not clock_out_s:  return jsonify({"error": "clock_out is required."}), 400

    try:
        clock_in  = datetime.fromisoformat(clock_in_s.replace("Z",  "+00:00"))
        clock_out = datetime.fromisoformat(clock_out_s.replace("Z", "+00:00"))
    except ValueError:
        return jsonify({"error": "Invalid datetime format. Use ISO 8601."}), 400

    try:
        record = timesheet_service.manual_entry(
            employee_id=employee_id,
            project_id=project_id,
            clock_in=clock_in,
            clock_out=clock_out,
            supervisor=g.current_user,
            note=note,
        )
        return jsonify({"record": record}), 201
    except TimesheetError as e:
        return _ts_error(e)
