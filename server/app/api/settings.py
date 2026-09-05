"""
Settings Routes — /api/settings
================================
GET  /                    — general settings (any authenticated user)
PUT  /                    — update general settings (requires system.manage_settings)
GET  /erp-integration     — ERPNext/egc_hr connection config (requires
                             system.manage_settings - these are real API
                             secrets, never exposed through the general route)
PUT  /erp-integration     — update ERPNext/egc_hr connection config (same permission)
GET  /erp-integration/test — pings both ERPNext and egc_hr with the currently
                             saved credentials, so an admin can verify a change
                             before walking away from the page
GET  /modules              — which of the app's four subsystems are enabled
                             (any authenticated user - the frontend nav/dashboard
                             need this on every load)
PUT  /modules              — enable/disable a subsystem (requires system.manage_settings)
GET  /timesheet            — timesheet business-rule settings (workday/break hours)
PUT  /timesheet            — update them (requires system.manage_settings)

See app/services/settings_service.py for why the ERP/egc_hr credentials
live here now instead of only in .env: two separate credential pairs
existed for what is, from a user's perspective, "the ERP integration",
and updating one without the other silently broke half the app.
"""

from flask import Blueprint, request, jsonify

from app.middleware.auth_middleware import require_permission, jwt_required_custom
from app.utils.database import get_db
from app.services.settings_service import (
    GENERAL_DEFAULTS, ERP_INTEGRATION_DEFAULTS, MODULE_DEFAULTS, TIMESHEET_SETTINGS_DEFAULTS,
    get_settings_doc,
)

bp = Blueprint("settings", __name__, url_prefix="/api/settings")


@bp.route("", methods=["GET"])
@jwt_required_custom
def get_settings():
    db = get_db()
    doc = get_settings_doc(db)
    return jsonify({"settings": {k: doc[k] for k in GENERAL_DEFAULTS}}), 200


@bp.route("", methods=["PUT"])
@require_permission("system.manage_settings")
def update_settings():
    data = request.get_json(silent=True) or {}
    db = get_db()
    update = {k: v for k, v in data.items() if k in GENERAL_DEFAULTS}
    if not update:
        return jsonify({"error": "No valid settings provided."}), 400
    db.system_settings.update_one({"_id": "global"}, {"$set": update}, upsert=True)
    doc = get_settings_doc(db)
    return jsonify({"settings": {k: doc[k] for k in GENERAL_DEFAULTS}, "message": "Settings updated."}), 200


@bp.route("/erp-integration", methods=["GET"])
@require_permission("system.manage_settings")
def get_erp_integration_settings():
    db = get_db()
    doc = get_settings_doc(db)
    return jsonify({"settings": {k: doc[k] for k in ERP_INTEGRATION_DEFAULTS}}), 200


@bp.route("/erp-integration", methods=["PUT"])
@require_permission("system.manage_settings")
def update_erp_integration_settings():
    data = request.get_json(silent=True) or {}
    db = get_db()
    update = {k: v for k, v in data.items() if k in ERP_INTEGRATION_DEFAULTS}
    if not update:
        return jsonify({"error": "No valid settings provided."}), 400
    db.system_settings.update_one({"_id": "global"}, {"$set": update}, upsert=True)

    # project_site_cache.py holds egc_hr's site/geofence list in-process
    # for up to 5 minutes - without this, a credential/URL change here
    # would silently keep serving data fetched under the OLD connection
    # (wrong sites, wrong geofences) until that TTL happened to expire.
    from app.services.project_site_cache import invalidate as invalidate_project_site_cache
    invalidate_project_site_cache()

    doc = get_settings_doc(db)
    return jsonify({
        "settings": {k: doc[k] for k in ERP_INTEGRATION_DEFAULTS},
        "message": "ERP integration settings updated.",
    }), 200


@bp.route("/erp-integration/test", methods=["GET"])
@require_permission("system.manage_settings")
def test_erp_integration():
    # Imported lazily to avoid a module-load-order dependency between this
    # blueprint and the two service singletons - both are cheap imports,
    # this just keeps the import graph simple to reason about.
    from app.services.erp_service import erp_service
    from app.services.egc_hr_service import egc_hr_service
    return jsonify({
        "erp_connected": erp_service.ping(),
        "egc_hr_connected": egc_hr_service.ping(),
    }), 200


@bp.route("/modules", methods=["GET"])
@jwt_required_custom
def get_modules():
    db = get_db()
    doc = get_settings_doc(db)
    return jsonify({"settings": {k: doc[k] for k in MODULE_DEFAULTS}}), 200


@bp.route("/modules", methods=["PUT"])
@require_permission("system.manage_settings")
def update_modules():
    data = request.get_json(silent=True) or {}
    db = get_db()
    update = {k: v for k, v in data.items() if k in MODULE_DEFAULTS}
    if not update:
        return jsonify({"error": "No valid settings provided."}), 400
    db.system_settings.update_one({"_id": "global"}, {"$set": update}, upsert=True)
    doc = get_settings_doc(db)
    return jsonify({"settings": {k: doc[k] for k in MODULE_DEFAULTS}, "message": "Modules updated."}), 200


@bp.route("/timesheet", methods=["GET"])
@jwt_required_custom
def get_timesheet_settings_route():
    db = get_db()
    doc = get_settings_doc(db)
    return jsonify({"settings": {k: doc[k] for k in TIMESHEET_SETTINGS_DEFAULTS}}), 200


@bp.route("/timesheet", methods=["PUT"])
@require_permission("system.manage_settings")
def update_timesheet_settings():
    data = request.get_json(silent=True) or {}
    db = get_db()
    update = {}
    for k in TIMESHEET_SETTINGS_DEFAULTS:
        if k not in data:
            continue
        try:
            value = float(data[k])
        except (TypeError, ValueError):
            return jsonify({"error": f"{k} must be a number."}), 400
        if value < 0 or value > 24:
            return jsonify({"error": f"{k} must be between 0 and 24."}), 400
        update[k] = value
    if not update:
        return jsonify({"error": "No valid settings provided."}), 400
    db.system_settings.update_one({"_id": "global"}, {"$set": update}, upsert=True)
    doc = get_settings_doc(db)
    return jsonify({"settings": {k: doc[k] for k in TIMESHEET_SETTINGS_DEFAULTS}, "message": "Timesheet settings updated."}), 200
