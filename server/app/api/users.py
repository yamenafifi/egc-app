"""
Users Routes  —  /api/users
============================
GET    /api/users                        — list all users
POST   /api/users                        — create account from ERP employee
GET    /api/users/<id>                   — get single user
PATCH  /api/users/<id>/deactivate        — deactivate
PATCH  /api/users/<id>/reactivate        — reactivate
POST   /api/users/<id>/reset-password    — admin reset password
GET    /api/users/<id>/permissions       — get user permissions
PUT    /api/users/<id>/permissions       — replace user permissions
"""

from flask import Blueprint, request, jsonify, g
from bson import ObjectId

from app.services.auth_service import auth_service, AuthError
from app.services.permission_service import permission_service
from app.middleware.auth_middleware import require_permission, jwt_required_custom
from app.utils.database import get_db
from app.models.user import UserModel

bp = Blueprint("users", __name__, url_prefix="/api/users")


@bp.route("", methods=["GET"])
@require_permission("users.view_list")
def list_users():
    db = get_db()
    search     = request.args.get("search", "").strip()
    page       = int(request.args.get("page", 1))
    page_length = int(request.args.get("page_length", 25))

    # ── Sync all ERP-linked users before returning the list ──────────────────
    # This ensures the list is always current when an admin views it.
    # We only sync users that have an ERP link — sysadmin is skipped inside
    # sync_from_erp automatically.
    linked_users = list(db[UserModel.COLLECTION].find({
        "erp_employee_id": {"$exists": True, "$ne": None},
        "is_sysadmin":     {"$ne": True},
    }))
    for u in linked_users:
        auth_service.sync_from_erp(u)
    # ─────────────────────────────────────────────────────────────────────────

    # Now query the (freshly synced) DB
    query = {}
    if search:
        query["$or"] = [
            {"display_name": {"$regex": search, "$options": "i"}},
            {"username":     {"$regex": search, "$options": "i"}},
        ]

    skip   = (page - 1) * page_length
    cursor = db[UserModel.COLLECTION].find(query).sort("display_name", 1).skip(skip).limit(page_length)
    users  = [UserModel.to_public(u) for u in cursor]
    total  = db[UserModel.COLLECTION].count_documents(query)

    return jsonify({"users": users, "total": total, "page": page, "page_length": page_length}), 200


@bp.route("", methods=["POST"])
@require_permission("users.create")
def create_user():
    data = request.get_json(silent=True) or {}
    erp_employee_id = (data.get("erp_employee_id") or "").strip()
    initial_password = data.get("initial_password") or ""

    if not erp_employee_id or not initial_password:
        return jsonify({"error": "erp_employee_id and initial_password are required."}), 400

    try:
        user = auth_service.create_account_from_erp(
            erp_employee_id=erp_employee_id,
            initial_password=initial_password,
            created_by_user=g.current_user,
        )
    except AuthError as e:
        return jsonify({"error": str(e)}), e.status_code

    return jsonify({"user": user, "message": "Account created successfully."}), 201


@bp.route("/<user_id>", methods=["GET", "DELETE"])
@jwt_required_custom
def get_or_delete_user(user_id: str):
    db = get_db()
    try:
        user = db[UserModel.COLLECTION].find_one({"_id": ObjectId(user_id)})
    except Exception:
        return jsonify({"error": "Invalid user ID."}), 400

    if not user:
        return jsonify({"error": "User not found."}), 404

    if request.method == "GET":
        if not g.current_user.get("is_sysadmin") and "users.view_list" not in g.current_user.get("permissions", []):
            return jsonify({"error": "Access denied.", "required_permission": "users.view_list"}), 403

        # Sync from ERP before returning — ensures /users/<id> is always fresh
        user = auth_service.sync_from_erp(user)

        if user is None:
            return jsonify({"error": "User no longer exists."}), 404

        return jsonify({"user": UserModel.to_public(user)}), 200

    if request.method == "DELETE":
        if not g.current_user.get("is_sysadmin") and "users.deactivate" not in g.current_user.get("permissions", []):
            return jsonify({"error": "Access denied.", "required_permission": "users.deactivate"}), 403
        if user.get("is_sysadmin"):
            return jsonify({"error": "The system administrator account cannot be deleted."}), 403
        try:
            auth_service.delete_account(
                target_user_id=user_id,
                admin_user=g.current_user,
            )
        except AuthError as e:
            return jsonify({"error": str(e)}), e.status_code
        return jsonify({"message": "Account deleted."}), 200


@bp.route("/<user_id>/deactivate", methods=["PATCH"])
@require_permission("users.deactivate")
def deactivate_user(user_id: str):
    try:
        auth_service.deactivate_account(
            target_user_id=user_id,
            admin_user=g.current_user,
        )
    except AuthError as e:
        return jsonify({"error": str(e)}), e.status_code
    return jsonify({"message": "Account deactivated."}), 200


@bp.route("/<user_id>/reactivate", methods=["PATCH"])
@require_permission("users.deactivate")
def reactivate_user(user_id: str):
    try:
        auth_service.reactivate_account(
            target_user_id=user_id,
            admin_user=g.current_user,
        )
    except AuthError as e:
        return jsonify({"error": str(e)}), e.status_code
    return jsonify({"message": "Account reactivated."}), 200


@bp.route("/<user_id>/reset-password", methods=["POST"])
@require_permission("users.reset_password")
def reset_password(user_id: str):
    data = request.get_json(silent=True) or {}
    new_password = data.get("new_password") or ""
    if not new_password:
        return jsonify({"error": "new_password is required."}), 400

    try:
        auth_service.admin_reset_password(
            target_user_id=user_id,
            new_password=new_password,
            admin_user=g.current_user,
        )
    except AuthError as e:
        return jsonify({"error": str(e)}), e.status_code

    return jsonify({"message": "Password reset. User will be required to change it on next login."}), 200


@bp.route("/<user_id>/permissions", methods=["GET"])
@require_permission("users.view_permissions")
def get_permissions(user_id: str):
    db = get_db()
    try:
        user = db[UserModel.COLLECTION].find_one({"_id": ObjectId(user_id)})
    except Exception:
        return jsonify({"error": "Invalid user ID."}), 400

    if not user:
        return jsonify({"error": "User not found."}), 404

    from app.utils.permissions import SYSADMIN_NODES, ALL_NODES
    if user.get("is_sysadmin"):
        nodes = list(SYSADMIN_NODES)
    else:
        nodes = user.get("permissions", [])

    return jsonify({
        "user_id": user_id,
        "is_sysadmin": user.get("is_sysadmin", False),
        "permissions": nodes,
        "all_nodes": ALL_NODES,  # send catalogue so the frontend can render checkboxes
    }), 200


@bp.route("/<user_id>/permissions", methods=["PUT"])
@require_permission("users.edit_permissions")
def update_permissions(user_id: str):
    data = request.get_json(silent=True) or {}
    nodes = data.get("permissions")
    template_id = data.get("template_id")

    if not isinstance(nodes, list):
        return jsonify({"error": "'permissions' must be a list of node strings."}), 400

    from app.utils.permissions import ALL_NODES
    invalid = [n for n in nodes if n not in ALL_NODES]
    if invalid:
        return jsonify({"error": f"Unknown permission nodes: {invalid}"}), 400

    try:
        auth_service.update_user_permissions(
            target_user_id=user_id,
            nodes=nodes,
            admin_user=g.current_user,
            template_id=template_id,
        )
    except AuthError as e:
        return jsonify({"error": str(e)}), e.status_code

    return jsonify({"message": "Permissions updated."}), 200


@bp.route("/sync-from-erp", methods=["POST"])
@require_permission("system.manage_settings")
def bulk_sync_from_erp():
    """
    Trigger a full sync of all ERP-linked portal users.
    Useful to run nightly or after bulk changes in ERPNext.
    Returns counts of updated and deactivated accounts.
    """
    db = get_db()
    linked_users = list(db[UserModel.COLLECTION].find({
        "erp_employee_id": {"$exists": True, "$ne": None},
        "is_sysadmin": {"$ne": True},
    }))

    updated    = 0
    deactivated = 0

    for user in linked_users:
        before_active = user.get("is_active", True)
        synced = auth_service.sync_from_erp(user)
        updated += 1
        if before_active and not synced.get("is_active", True):
            deactivated += 1

    return jsonify({
        "message": f"Sync complete. {updated} users checked, {deactivated} deactivated.",
        "updated":     updated,
        "deactivated": deactivated,
    }), 200
