"""
Auth Middleware
===============
JWT verification and permission checking decorators for all routes.
"""

from functools import wraps
from flask import request, jsonify, g
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from bson import ObjectId

from app.utils.database import get_db
from app.utils.permissions import SYSADMIN_NODES
from app.models.user import UserModel


def _load_current_user() -> dict | None:
    db = get_db()
    user_id = get_jwt_identity()
    return db[UserModel.COLLECTION].find_one({"_id": ObjectId(user_id)})


def jwt_required_custom(fn):
    """Validates JWT and loads the full user object into flask.g.current_user."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            verify_jwt_in_request()
        except Exception as e:
            return jsonify({"error": "Authentication required.", "detail": str(e)}), 401

        from flask_jwt_extended import get_jwt
        claims = get_jwt()
        device_id = claims.get("device_id")

        db = get_db()
        if device_id:
            from app.models.user_device import UserDeviceModel
            device = db[UserDeviceModel.COLLECTION].find_one({"_id": ObjectId(device_id)})
            if not device:
                return jsonify({"error": "Session revoked. Please log in again."}), 401

        user = _load_current_user()
        if not user:
            return jsonify({"error": "User account not found."}), 401
        if not user.get("is_active", True):
            return jsonify({"error": "Your account has been deactivated."}), 403

        g.current_user = user
        return fn(*args, **kwargs)
    return wrapper


def require_permission(node: str):
    """
    Route decorator that ensures the current user has the given permission node.
    Always implies jwt_required_custom — no need to stack both decorators.

    Usage:
        @bp.route("/some-route")
        @require_permission("users.create")
        def some_route():
            ...
    """
    def decorator(fn):
        @wraps(fn)
        @jwt_required_custom
        def wrapper(*args, **kwargs):
            user = g.current_user
            if user.get("is_sysadmin"):
                return fn(*args, **kwargs)

            permitted_nodes = set(user.get("permissions", []))
            if node not in permitted_nodes:
                return jsonify({
                    "error": "Access denied.",
                    "required_permission": node,
                }), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator


def require_password_changed(fn):
    """
    Blocks access to any route if the user still has must_change_password=True.
    Apply this on all non-auth routes so users are always forced to the
    change-password screen first.
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = getattr(g, "current_user", None)
        if user and user.get("must_change_password"):
            return jsonify({
                "error": "Password change required.",
                "must_change_password": True,
            }), 403
        return fn(*args, **kwargs)
    return wrapper
