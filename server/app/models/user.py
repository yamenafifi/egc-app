from datetime import datetime, timezone
from bson import ObjectId
from app.utils.permissions import DEFAULT_USER_NODES


class UserModel:
    """
    Schema reference for the `users` collection.

    _id                 : ObjectId (auto)
    username            : str  — login handle (typically iqama number)
    password_hash       : str  — bcrypt hash
    display_name        : str  — full name from ERP
    is_sysadmin         : bool — built-in super-admin flag (cannot be toggled)
    is_active           : bool — account enabled/disabled
    must_change_password: bool — forces password change on next login
    iqama_number        : str  — links to ERP employee
    erp_employee_id     : str  — ERPNext `name` field of the Employee doctype
    erp_linked          : bool — whether the ERP custom field has been updated
    permissions         : list[str] — explicit list of allowed permission nodes
    permission_template : str | None — ObjectId of applied template (informational)
    created_by          : str  — ObjectId of admin who created the account
    created_at          : datetime
    updated_at          : datetime
    last_login          : datetime | None
    """

    COLLECTION = "users"

    @staticmethod
    def new(
        username: str,
        password_hash: str,
        display_name: str,
        iqama_number: str = None,
        erp_employee_id: str = None,
        created_by: str = None,
        is_sysadmin: bool = False,
    ) -> dict:
        now = datetime.now(timezone.utc)
        return {
            "username": username,
            "password_hash": password_hash,
            "display_name": display_name,
            "is_sysadmin": is_sysadmin,
            "is_active": True,
            "must_change_password": not is_sysadmin,  # sysadmin seed skips this
            "iqama_number": iqama_number,
            "erp_employee_id": erp_employee_id,
            "erp_linked": False,
            "permissions": list(DEFAULT_USER_NODES) if not is_sysadmin else [],
            "permission_template": None,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
            "last_login": None,
        }

    @staticmethod
    def to_public(user: dict) -> dict:
        """Strip sensitive fields before sending to client."""
        return {
            "id": str(user["_id"]),
            "username": user["username"],
            "display_name": user["display_name"],
            "is_sysadmin": user.get("is_sysadmin", False),
            "is_active": user.get("is_active", True),
            "must_change_password": user.get("must_change_password", False),
            "iqama_number": user.get("iqama_number"),
            "erp_employee_id": user.get("erp_employee_id"),
            "erp_linked": user.get("erp_linked", False),
            "erp_photo_url": user.get("erp_photo_url"),
            "permissions": user.get("permissions", []),
            "permission_template": user.get("permission_template"),
            "created_at": user["created_at"].isoformat() if user.get("created_at") else None,
            "last_login": user["last_login"].isoformat() if user.get("last_login") else None,
        }
