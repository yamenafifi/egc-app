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

    # ERPNext
    ERP_BASE_URL = os.getenv("ERP_BASE_URL", "https://erp.egc-me.com")
    ERP_API_KEY = os.getenv("ERP_API_KEY", "88446f9afed2123")
    ERP_API_SECRET = os.getenv("ERP_API_SECRET", "d9ca412fab34da6")

    # System Admin bootstrap
    SYSADMIN_USERNAME = os.getenv("SYSADMIN_USERNAME", "sysadmin")
    SYSADMIN_PASSWORD = os.getenv("SYSADMIN_PASSWORD", "Admin@123!")
