import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Flask
    SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "dev-secret-key")
    DEBUG = os.getenv("FLASK_ENV") == "development"

    # MongoDB
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/egc_portal")

    # JWT
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "jwt-dev-secret-key")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        hours=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_HOURS", 8))
    )
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(
        days=int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES_DAYS", 30))
    )

    # ERP - stock ERPNext REST API (Employee/Project/Designation/Department lookups)
    ERP_BASE_URL = os.getenv("ERP_BASE_URL", "https://erp.egc-me.com")
    ERP_API_KEY = os.getenv("ERP_API_KEY", "")
    ERP_API_SECRET = os.getenv("ERP_API_SECRET", "")

    # egc_hr - versioned API (Work Record import, Leave, Project Site/Supervisors).
    # Independently configurable from ERP_BASE_URL/etc above - egc_hr.egc_hr.api.v1.*
    # is a distinct API surface, usually the same physical site but not assumed to be.
    # A dedicated User (egc-app@egc.local, role "EGC Integration Agent" only) owns
    # this credential pair - see docs/EGC_APP_INTEGRATION.md in the egc-erp-hr repo.
    EGC_HR_BASE_URL = os.getenv("EGC_HR_BASE_URL", os.getenv("ERP_BASE_URL", "https://erp.egc-me.com"))
    EGC_HR_API_KEY = os.getenv("EGC_HR_API_KEY", "")
    EGC_HR_API_SECRET = os.getenv("EGC_HR_API_SECRET", "")

    # Gemini (Expense Claim receipt extraction) - see app/services/gemini_service.py.
    # Own credential, independent of ERP_API_KEY/EGC_HR_API_KEY above - this
    # talks to Google, not ERPNext/egc_hr.
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    GEMINI_ENABLED = os.getenv("GEMINI_ENABLED", "false").lower() == "true"

    # Web Push (VAPID) - see app/services/push_service.py
    VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
    VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
    VAPID_CLAIM_EMAIL = os.getenv("VAPID_CLAIM_EMAIL", "mailto:admin@egc-me.com")

    # System Admin bootstrap
    SYSADMIN_USERNAME = os.getenv("SYSADMIN_USERNAME", "Administrator")
    SYSADMIN_PASSWORD = os.getenv("SYSADMIN_PASSWORD", "Admin@123!")
