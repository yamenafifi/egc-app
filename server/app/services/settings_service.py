"""
Centralized System Settings
=============================
The single source of truth for every DB-backed system setting, stored as
one document (system_settings/global). Two default groups, exposed
through different routes in app/api/settings.py with different
permission requirements:

  GENERAL_DEFAULTS         - non-sensitive, readable by any authenticated
                              user via GET /api/settings (e.g.
                              company_vat_number).
  ERP_INTEGRATION_DEFAULTS - ERPNext/egc_hr connection credentials,
                              readable/writable only by
                              system.manage_settings via
                              GET/PUT /api/settings/erp-integration -
                              these are real API secrets and must never
                              flow through the general endpoint.

Defaulting the integration fields to the existing Config.* (env-sourced)
values means nothing breaks on first deploy of this feature - an admin's
.env-configured credentials keep working exactly as before until they
explicitly override one via the Settings UI, at which point the DB value
wins. This is also what makes credential rotation take effect immediately:
app/services/erp_service.py and app/services/egc_hr_service.py both read
get_settings_doc() fresh on every request rather than baking Config.*
into a class attribute once at import time - the whole reason this
module exists is that a single ERPNext credential pair was previously
wired in twice (ERP_API_KEY/SECRET for stock ERPNext calls, a separate
EGC_HR_API_KEY/SECRET for egc_hr's own API), and updating one without the
other silently broke half the app's ERPNext-touching features while the
other half kept working - see docs/EGC_APP_INTEGRATION.md in egc-erp-hr.
"""

from config.settings import Config
from app.utils.database import get_db

GENERAL_DEFAULTS = {
    # Our own company's VAT registration number - see gemini_service.py.
    "company_vat_number": "313056833700003",
}

ERP_INTEGRATION_DEFAULTS = {
    "erp_base_url": Config.ERP_BASE_URL,
    "erp_api_key": Config.ERP_API_KEY,
    "erp_api_secret": Config.ERP_API_SECRET,
    "egc_hr_base_url": Config.EGC_HR_BASE_URL,
    "egc_hr_api_key": Config.EGC_HR_API_KEY,
    "egc_hr_api_secret": Config.EGC_HR_API_SECRET,
}

# Each of the app's four subsystems can be switched off entirely - the
# blueprint for each (attendance.py/leave.py/deductions.py/
# expense_claims.py) gates every one of its own routes on this via a
# before_request hook (see is_module_enabled() below), and the frontend
# hides the corresponding nav/dashboard sections - see AuthContext.jsx's
# isModuleEnabled().
MODULE_DEFAULTS = {
    "module_timesheet_enabled": True,
    "module_leaves_enabled": True,
    "module_deductions_enabled": True,
    "module_expense_claims_enabled": True,
}

# Timesheet-specific business rules - previously hardcoded constants in
# attendance.py (STANDARD_WORKDAY_HOURS/BREAK_HOURS), used to auto-compute
# overtime at clock-out (anything worked past standard_workday_hours +
# break_hours becomes overtime, with no employee data entry).
TIMESHEET_SETTINGS_DEFAULTS = {
    "timesheet_standard_workday_hours": 8,
    "timesheet_break_hours": 1,
}

ALL_DEFAULTS = {**GENERAL_DEFAULTS, **ERP_INTEGRATION_DEFAULTS, **MODULE_DEFAULTS, **TIMESHEET_SETTINGS_DEFAULTS}


def get_settings_doc(db=None) -> dict:
    # `db or get_db()` looks tempting but a pymongo Database object
    # explicitly forbids truth-value testing (bool(db) raises) - has to
    # be an actual None check.
    if db is None:
        db = get_db()
    doc = db.system_settings.find_one({"_id": "global"})
    settings = dict(ALL_DEFAULTS)
    if doc:
        settings.update({k: v for k, v in doc.items() if k != "_id"})
    return settings


def get_erp_credentials(db=None) -> dict:
    """Just the ERPNext/egc_hr connection fields, for erp_service.py and
    egc_hr_service.py to read fresh on every outbound call."""
    doc = get_settings_doc(db)
    return {k: doc[k] for k in ERP_INTEGRATION_DEFAULTS}


def is_module_enabled(module_key: str, db=None) -> bool:
    """module_key is the short name (e.g. "timesheet"), not the full
    settings key - called from each gated blueprint's before_request."""
    doc = get_settings_doc(db)
    return bool(doc.get(f"module_{module_key}_enabled", True))


def get_timesheet_settings(db=None) -> dict:
    doc = get_settings_doc(db)
    return {k: doc[k] for k in TIMESHEET_SETTINGS_DEFAULTS}
