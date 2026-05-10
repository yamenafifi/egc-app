"""
Settings Routes — /api/settings
================================
GET  /api/settings   — get current system settings
PUT  /api/settings   — update system settings (requires system.manage_settings)
"""

from flask import Blueprint, request, jsonify, g
from app.middleware.auth_middleware import require_permission, jwt_required_custom
from app.utils.database import get_db

bp = Blueprint("settings", __name__, url_prefix="/api/settings")

DEFAULTS = {
    "qr_timesheet_enabled": True,
}

def get_settings_doc(db):
    doc = db.system_settings.find_one({"_id": "global"})
    if not doc:
        return dict(DEFAULTS)
    settings = dict(DEFAULTS)
    settings.update({k: v for k, v in doc.items() if k != "_id"})
    return settings

@bp.route("", methods=["GET"])
@jwt_required_custom
def get_settings():
    db = get_db()
    return jsonify({"settings": get_settings_doc(db)}), 200

@bp.route("", methods=["PUT"])
@require_permission("system.manage_settings")
def update_settings():
    data = request.get_json(silent=True) or {}
    db = get_db()
    allowed = set(DEFAULTS.keys())
    update = {k: v for k, v in data.items() if k in allowed}
    if not update:
        return jsonify({"error": "No valid settings provided."}), 400
    db.system_settings.update_one(
        {"_id": "global"},
        {"$set": update},
        upsert=True,
    )
    return jsonify({"settings": get_settings_doc(db), "message": "Settings updated."}), 200
