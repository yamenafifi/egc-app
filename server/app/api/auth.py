"""
Auth Routes  —  /api/auth
=========================
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
POST /api/auth/change-password
GET  /api/auth/me
"""

from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    get_jwt,
)
from bson import ObjectId

from app.services.auth_service import auth_service, AuthError
from app.middleware.auth_middleware import jwt_required_custom
from app.utils.database import get_db
from app.models.user import UserModel

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400

    try:
        user, device_id = auth_service.login(
            username=username,
            password=password,
            ip=request.remote_addr,
            user_agent_str=request.headers.get("User-Agent"),
            device_info=data.get("device_info", {}),
        )
    except AuthError as e:
        return jsonify({"error": str(e)}), e.status_code

    user_id = user["id"]
    access_token = create_access_token(identity=user_id, additional_claims={"device_id": device_id})
    refresh_token = create_refresh_token(identity=user_id, additional_claims={"device_id": device_id})

    return jsonify({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user,
    }), 200


@bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    user_id = get_jwt_identity()
    access_token = create_access_token(identity=user_id)
    return jsonify({"access_token": access_token}), 200


@bp.route("/logout", methods=["POST"])
@jwt_required_custom
def logout():
    # JWT is stateless; client deletes the token.
    # For future: add token to blocklist here if needed.
    return jsonify({"message": "Logged out successfully."}), 200


@bp.route("/me", methods=["GET"])
@jwt_required_custom
def me():
    user = g.current_user

    # Sync from ERP on every /me call (triggered on every page load by the frontend).
    # This is the "mid-session deactivation" catch — if HR fires someone while
    # they're logged in, their next page navigation will hit this and boot them.
    user = auth_service.sync_from_erp(user)

    # User was deleted from ERP and removed from portal
    if user is None:
        return jsonify({"error": "Your account no longer exists."}), 401

    # Re-check active status after sync
    if not user.get("is_active", True):
        return jsonify({"error": "Your account has been deactivated."}), 403

    public = UserModel.to_public(user)

    # Attach effective permissions (sysadmin gets all)
    from app.utils.permissions import SYSADMIN_NODES
    if user.get("is_sysadmin"):
        public["permissions"] = list(SYSADMIN_NODES)

    return jsonify({"user": public}), 200


@bp.route("/change-password", methods=["POST"])
@jwt_required_custom
def change_password():
    data = request.get_json(silent=True) or {}
    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")

    if not current_password or not new_password:
        return jsonify({"error": "current_password and new_password are required."}), 400

    try:
        auth_service.change_password(
            user_id=str(g.current_user["_id"]),
            current_password=current_password,
            new_password=new_password,
            ip=request.remote_addr,
        )
    except AuthError as e:
        return jsonify({"error": str(e)}), e.status_code

    return jsonify({"message": "Password changed successfully."}), 200


@bp.route("/set-initial-password", methods=["POST"])
@jwt_required_custom
def set_initial_password():
    data = request.get_json(silent=True) or {}
    new_password = data.get("new_password", "")

    if not new_password:
        return jsonify({"error": "new_password is required."}), 400

    try:
        auth_service.set_initial_password(
            user_id=str(g.current_user["_id"]),
            new_password=new_password,
            ip=request.remote_addr,
        )
    except AuthError as e:
        return jsonify({"error": str(e)}), e.status_code

    return jsonify({"message": "Initial password set successfully."}), 200


@bp.route("/devices", methods=["GET"])
@jwt_required_custom
def list_devices():
    user = g.current_user
    devices = auth_service.get_user_devices(str(user["_id"]))
    return jsonify({"devices": devices}), 200


@bp.route("/devices/<device_id>", methods=["DELETE"])
@jwt_required_custom
def remove_device(device_id):
    user = g.current_user
    try:
        auth_service.revoke_device(str(user["_id"]), device_id)
        # Check if the user just deleted the device they are currently using
        claims = get_jwt()
        if claims.get("device_id") == device_id:
            return jsonify({"message": "Current session revoked. You will be logged out.", "self_revoked": True}), 200
    except AuthError as e:
        return jsonify({"error": str(e)}), e.status_code

    return jsonify({"message": "Device removed successfully."}), 200
