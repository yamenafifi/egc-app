"""
ERP Routes  —  /api/erp
========================
GET  /api/erp/employees        — pull paginated employee list from ERPNext
GET  /api/erp/employees/<id>   — get single employee from ERPNext
GET  /api/erp/ping             — check ERPNext connectivity
"""

from flask import Blueprint, request, jsonify, g

from app.services.erp_service import erp_service, ERPNextError
from app.middleware.auth_middleware import require_permission, jwt_required_custom

bp = Blueprint("erp", __name__, url_prefix="/api/erp")


@bp.route("/ping", methods=["GET"])
@require_permission("erp.view_employee_list")
def ping():
    alive = erp_service.ping()
    return jsonify({"connected": alive}), 200 if alive else 503


@bp.route("/employees", methods=["GET"])
@require_permission("erp.view_employee_list")
def list_employees():
    page = int(request.args.get("page", 1))
    page_length = min(int(request.args.get("page_length", 50)), 100)
    search = request.args.get("search", "").strip() or None

    try:
        result = erp_service.get_employee_list(
            page=page,
            page_length=page_length,
            search=search,
        )
    except ERPNextError as e:
        return jsonify({"error": str(e)}), e.status_code

    return jsonify(result), 200


@bp.route("/employees/<employee_id>", methods=["GET"])
@require_permission("erp.view_employee_list")
def get_employee(employee_id: str):
    try:
        employee = erp_service.get_employee(employee_id)
    except ERPNextError as e:
        return jsonify({"error": str(e)}), e.status_code

    if not employee:
        return jsonify({"error": "Employee not found."}), 404

    return jsonify({"employee": employee}), 200


@bp.route("/projects", methods=["GET"])
@require_permission("erp.view_employee_list")
def list_projects():
    search = request.args.get("search", "").strip() or None
    try:
        projects = erp_service.get_project_list(search=search)
    except ERPNextError as e:
        return jsonify({"error": str(e)}), e.status_code
    return jsonify({"projects": projects}), 200


@bp.route("/employees/<employee_id>/card", methods=["GET"])
@jwt_required_custom
def get_employee_card(employee_id: str):
    """
    Returns all fields needed for the Employee Card and Legal Documents pages.
    Any authenticated user can fetch their own card.
    Admins with erp.view_employee_list can fetch any card.
    """
    # Allow access only to own card, or admins
    user = g.current_user
    is_own = user.get("erp_employee_id") == employee_id
    is_admin = user.get("is_sysadmin") or "erp.view_employee_list" in user.get("permissions", [])

    if not is_own and not is_admin:
        return jsonify({"error": "Access denied."}), 403

    try:
        employee = erp_service.get_employee_card(employee_id)
        if not employee:
            return jsonify({"error": "Employee not found in ERPNext."}), 404
        return jsonify({"employee": employee}), 200
    except Exception as e:
        return jsonify({"error": f"Could not load employee data: {str(e)}"}), 502
