"""
Authentication Service
======================
Core business logic for login, account creation, password management.
"""

import bcrypt
from datetime import datetime, timezone
from bson import ObjectId

from app.utils.database import get_db
from app.models.user import UserModel
from app.models.audit_log import AuditLogModel
from app.utils.permissions import SYSADMIN_NODES
from app.services.erp_service import erp_service


def _build_erp_url(path: str | None) -> str | None:
    """Convert an ERP relative file path to an absolute URL."""
    if not path:
        return None
    if path.startswith("http"):
        return path
    from config.settings import Config
    base = Config.ERP_BASE_URL.rstrip("/")
    return f"{base}{path}"


class AuthError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


class AuthService:

    # ── Password utilities ────────────────────────────────────────────────────

    @staticmethod
    def hash_password(plain: str) -> str:
        return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

    @staticmethod
    def verify_password(plain: str, hashed: str) -> bool:
        return bcrypt.checkpw(plain.encode(), hashed.encode())

    @staticmethod
    def validate_password_strength(password: str):
        """Enforce minimum password policy."""
        if len(password) < 8:
            raise AuthError("Password must be at least 8 characters long.")
        if not any(c.isupper() for c in password):
            raise AuthError("Password must contain at least one uppercase letter.")
        if not any(c.isdigit() for c in password):
            raise AuthError("Password must contain at least one number.")

    # ── Login ────────────────────────────────────────────────────────────────

    def login(self, username: str, password: str, ip: str = None, user_agent_str: str = None, device_info: dict = None) -> tuple[dict, str]:
        db = get_db()

        user = db[UserModel.COLLECTION].find_one({"username": username})

        if not user:
            self._audit("auth.failed_login", detail={"username": username, "reason": "not_found"}, ip=ip)
            raise AuthError("Invalid username or password.", 401)

        if not user.get("is_active", True):
            self._audit("auth.failed_login", user=user, detail={"reason": "account_inactive"}, ip=ip)
            raise AuthError("Your account has been deactivated. Please contact the office.", 403)

        if not self.verify_password(password, user["password_hash"]):
            self._audit("auth.failed_login", user=user, detail={"reason": "bad_password"}, ip=ip)
            raise AuthError("Invalid username or password.", 401)

        # Update last login
        db[UserModel.COLLECTION].update_one(
            {"_id": user["_id"]},
            {"$set": {"last_login": datetime.now(timezone.utc)}},
        )

        # Sync latest data from ERP (name, iqama, status)
        user = self.sync_from_erp(user)

        # User was deleted from ERP mid-session or between logins
        if user is None:
            raise AuthError(
                "Your account no longer exists. Please contact the office.",
                401,
            )

        # Re-check active status (ERP may have deactivated this account)
        if not user.get("is_active", True):
            raise AuthError(
                "Your account has been deactivated. Please contact the office.",
                403,
            )

        self._audit("auth.login", user=user, ip=ip)

        from app.models.user_device import UserDeviceModel

        device_name = "Unknown Device"
        if user_agent_str:
            ua = user_agent_str.lower()
            os = "Unknown OS"
            if "windows" in ua: os = "Windows"
            elif "mac os x" in ua: os = "Mac OS"
            elif "android" in ua: os = "Android"
            elif "iphone" in ua or "ipad" in ua: os = "iOS"
            elif "linux" in ua: os = "Linux"

            browser = "Unknown Browser"
            if "edg/" in ua or "edge/" in ua: browser = "Edge"
            elif "chrome/" in ua and "safari/" in ua: browser = "Chrome"
            elif "safari/" in ua and "chrome/" not in ua: browser = "Safari"
            elif "firefox/" in ua: browser = "Firefox"
            elif "opr/" in ua or "opera/" in ua: browser = "Opera"
            
            device_name = f"{os} - {browser}"

        extra_info = device_info or {}
        device_uuid = extra_info.get("device_uuid")

        if device_uuid:
            # Try to find an existing device for this user
            existing_device = db[UserDeviceModel.COLLECTION].find_one({
                "user_id": str(user["_id"]),
                "device_uuid": device_uuid
            })
            if existing_device:
                # Update existing device session
                db[UserDeviceModel.COLLECTION].update_one(
                    {"_id": existing_device["_id"]},
                    {"$set": {
                        "last_active": datetime.now(timezone.utc),
                        "ip_address": ip or "",
                        "device_name": device_name,
                        "extra_info": extra_info
                    }}
                )
                device_id = str(existing_device["_id"])
                return UserModel.to_public(user), device_id

        # If no device_uuid provided or no existing record found, create a new one
        import uuid
        if not device_uuid:
            device_uuid = str(uuid.uuid4())

        device_doc = UserDeviceModel.new(
            user_id=str(user["_id"]),
            device_uuid=device_uuid,
            device_name=device_name,
            ip_address=ip or "",
            extra_info=extra_info,
        )
        res = db[UserDeviceModel.COLLECTION].insert_one(device_doc)
        device_id = str(res.inserted_id)

        return UserModel.to_public(user), device_id

    # ── Account creation ─────────────────────────────────────────────────────

    def create_account_from_erp(
        self,
        erp_employee_id: str,
        initial_password: str,
        created_by_user: dict,
    ) -> dict:
        db = get_db()

        # Validate password
        self.validate_password_strength(initial_password)

        # Fetch employee from ERP
        employee = erp_service.get_employee(erp_employee_id)
        if not employee:
            raise AuthError("Employee not found in ERPNext.", 404)

        iqama = employee.get("custom_iqamaid_number", "").strip()
        if not iqama:
            raise AuthError("Employee has no IQAMA number set in ERPNext.", 400)

        # Check for duplicate
        existing = db[UserModel.COLLECTION].find_one({"iqama_number": iqama})
        if existing:
            raise AuthError(f"An account for IQAMA {iqama} already exists.", 409)

        # Fetch bilingual designation and department details
        designation_name = employee.get("designation", "")
        department_name  = employee.get("department", "")

        designation_doc = erp_service.get_designation(designation_name)
        department_doc  = erp_service.get_department(department_name)

        # Create user document
        user_doc = UserModel.new(
            username=iqama,
            password_hash=self.hash_password(initial_password),
            display_name=employee.get("employee_name", iqama),
            en_display_name=employee.get("custom_arabic_full_name") or None,
            department=department_name or None,
            department_ar=department_doc.get("custom_arabic_department_name") or None,
            designation=designation_name or None,
            designation_en=designation_doc.get("custom_english_designation") or None,
            iqama_number=iqama,
            erp_employee_id=erp_employee_id,
            created_by=str(created_by_user["_id"]),
        )

        result = db[UserModel.COLLECTION].insert_one(user_doc)
        user_doc["_id"] = result.inserted_id

        # Async-ish: update ERP to mark account as linked
        linked = erp_service.mark_account_linked(erp_employee_id)
        if linked:
            db[UserModel.COLLECTION].update_one(
                {"_id": result.inserted_id},
                {"$set": {"erp_linked": True}},
            )
            user_doc["erp_linked"] = True

        self._audit(
            "user.created",
            user=created_by_user,
            target_id=str(result.inserted_id),
            detail={"erp_employee_id": erp_employee_id, "iqama": iqama},
        )

        return UserModel.to_public(user_doc)

    # ── Password management ───────────────────────────────────────────────────

    def admin_reset_password(self, target_user_id: str, new_password: str, admin_user: dict) -> None:
        db = get_db()
        target = db[UserModel.COLLECTION].find_one({"_id": ObjectId(target_user_id)})
        if not target:
            raise AuthError("User not found.", 404)

        if target.get("is_sysadmin"):
            raise AuthError("Cannot reset system administrator password from here.", 403)

        self._audit("auth.admin_reset_pw", user=admin_user, detail={"target_user": target["username"]})

        db[UserModel.COLLECTION].update_one(
            {"_id": target["_id"]},
            {"$set": {
                "password_hash": self.hash_password(new_password),
                "must_change_password": True,
            }}
        )

    def set_initial_password(self, user_id: str, new_password: str, ip: str = None) -> None:
        db = get_db()
        user = db[UserModel.COLLECTION].find_one({"_id": ObjectId(user_id)})
        if not user:
            raise AuthError("User not found.", 404)

        if not user.get("must_change_password"):
            raise AuthError("Initial password already set. Use the standard change password flow.", 400)

        self._audit("auth.set_initial_pw", user=user, ip=ip)

        db[UserModel.COLLECTION].update_one(
            {"_id": user["_id"]},
            {"$set": {
                "password_hash": self.hash_password(new_password),
                "must_change_password": False,
                "updated_at": datetime.now(timezone.utc),
            }}
        )

    def change_password(self, user_id: str, current_password: str, new_password: str, ip: str = None) -> None:
        db = get_db()
        user = db[UserModel.COLLECTION].find_one({"_id": ObjectId(user_id)})
        if not user:
            raise AuthError("User not found.", 404)

        if not self.verify_password(current_password, user["password_hash"]):
            raise AuthError("Current password is incorrect.", 401)

        self.validate_password_strength(new_password)

        db[UserModel.COLLECTION].update_one(
            {"_id": ObjectId(user_id)},
            {
                "$set": {
                    "password_hash": self.hash_password(new_password),
                    "must_change_password": False,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        self._audit("auth.password_changed", user=user, ip=ip)

    def admin_reset_password(self, target_user_id: str, new_password: str, admin_user: dict) -> None:
        """Admin sets a new password for a user; forces change on next login."""
        db = get_db()
        self.validate_password_strength(new_password)

        result = db[UserModel.COLLECTION].update_one(
            {"_id": ObjectId(target_user_id)},
            {
                "$set": {
                    "password_hash": self.hash_password(new_password),
                    "must_change_password": True,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )

        if result.matched_count == 0:
            raise AuthError("User not found.", 404)

        self._audit(
            "user.password_reset_by_admin",
            user=admin_user,
            target_id=target_user_id,
        )

    # ── Account management ────────────────────────────────────────────────────

    def deactivate_account(self, target_user_id: str, admin_user: dict) -> None:
        db = get_db()
        user = db[UserModel.COLLECTION].find_one({"_id": ObjectId(target_user_id)})
        if not user:
            raise AuthError("User not found.", 404)
        if user.get("is_sysadmin"):
            raise AuthError("The system admin account cannot be deactivated.", 403)

        db[UserModel.COLLECTION].update_one(
            {"_id": ObjectId(target_user_id)},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
        )

        # Notify ERP
        if user.get("erp_employee_id"):
            erp_service.mark_account_unlinked(user["erp_employee_id"])

        self._audit("user.deactivated", user=admin_user, target_id=target_user_id)

    def reactivate_account(self, target_user_id: str, admin_user: dict) -> None:
        db = get_db()
        result = db[UserModel.COLLECTION].update_one(
            {"_id": ObjectId(target_user_id)},
            {"$set": {"is_active": True, "updated_at": datetime.now(timezone.utc)}},
        )
        if result.matched_count == 0:
            raise AuthError("User not found.", 404)
        self._audit("user.reactivated", user=admin_user, target_id=target_user_id)

    def sync_from_erp(self, user: dict) -> dict | None:
        """
        Pull fresh data from ERPNext for this user and update the MongoDB document.

        Syncs:
          - display_name  ← erp employee_name
          - username      ← custom_iqama_number (if changed in ERP)
          - iqama_number  ← custom_iqama_number
          - erp_linked    ← True
          - is_active     ← mirrors ERP status (Active ↔ anything else), both directions

        Enforces:
          - Employee deleted from ERP entirely → permanently DELETE from portal DB
            (account removed, timesheet records are kept — they reference user_id strings,
            not foreign keys, so history is preserved)

        If ERP is unreachable (None returned), returns user unchanged — non-fatal.
        Returns the updated user dict, or None if the user was deleted.
        """
        # Sysadmin has no ERP link — skip entirely
        if user.get("is_sysadmin") or not user.get("erp_employee_id"):
            return user

        db  = get_db()
        emp = erp_service.get_employee_sync_data(user["erp_employee_id"])

        # ERP unreachable — do nothing, don't block
        if emp is None:
            return user

        now = datetime.now(timezone.utc)

        # ── Employee deleted from ERP → permanently delete from portal ────────────
        if emp.get("_deleted"):
            db[UserModel.COLLECTION].delete_one({"_id": user["_id"]})
            self._audit(
                "user.deleted_erp_removed",
                user=None,
                target_id=str(user["_id"]),
                detail={
                    "username":     user.get("username"),
                    "display_name": user.get("display_name"),
                    "erp_employee": user.get("erp_employee_id"),
                    "reason":       "Employee record deleted from ERPNext",
                },
            )
            return None  # Signal to caller that the user no longer exists

        # ── Employee exists — sync all fields ─────────────────────────────────────
        erp_status       = emp.get("status", "Active")
        erp_name         = emp.get("employee_name", "").strip() or user.get("display_name")
        erp_iqama        = emp.get("custom_iqamaid_number", "").strip() or user.get("iqama_number", "")
        erp_is_active    = erp_status == "Active"
        portal_is_active = user.get("is_active", True)

        # Fetch bilingual designation / department (best-effort; falls back to stored values)
        designation_name = emp.get("designation", "") or user.get("designation", "")
        department_name  = emp.get("department", "")  or user.get("department", "")

        designation_doc = erp_service.get_designation(designation_name)
        department_doc  = erp_service.get_department(department_name)

        updates = {
            "display_name":    erp_name,
            "en_display_name": emp.get("custom_arabic_full_name") or user.get("en_display_name"),
            "department":      department_name or None,
            "department_ar":   department_doc.get("custom_arabic_department_name") or user.get("department_ar"),
            "designation":     designation_name or None,
            "designation_en":  designation_doc.get("custom_english_designation") or user.get("designation_en"),
            "iqama_number":    erp_iqama,
            "erp_linked":      True,
            "updated_at":      now,
            "erp_photo_url":   _build_erp_url(emp.get("image")),
        }

        # Sync iqama → username if it changed and there's no collision
        if erp_iqama and erp_iqama != user.get("iqama_number"):
            collision = db[UserModel.COLLECTION].find_one({
                "username": erp_iqama,
                "_id":      {"$ne": user["_id"]},
            })
            if not collision:
                updates["username"] = erp_iqama

        # ── Bidirectional active/inactive sync ────────────────────────────────────
        if portal_is_active and not erp_is_active:
            # ERP deactivated → deactivate portal account
            updates["is_active"] = False
            self._audit(
                "user.auto_deactivated_by_erp",
                user=None,
                target_id=str(user["_id"]),
                detail={
                    "username":   user.get("username"),
                    "erp_status": erp_status,
                },
            )

        elif not portal_is_active and erp_is_active:
            # ERP reactivated → reactivate portal account
            updates["is_active"] = True
            self._audit(
                "user.auto_reactivated_by_erp",
                user=None,
                target_id=str(user["_id"]),
                detail={
                    "username":   user.get("username"),
                    "erp_status": erp_status,
                },
            )

        db[UserModel.COLLECTION].update_one({"_id": user["_id"]}, {"$set": updates})
        return db[UserModel.COLLECTION].find_one({"_id": user["_id"]})


    # ── Account Delete ────────────────────────────────────────────────────────

    def delete_account(self, target_user_id: str, admin_user: dict) -> None:
        """Permanently delete a user account and clean up ERP link."""
        db = get_db()
        user = db[UserModel.COLLECTION].find_one({"_id": ObjectId(target_user_id)})
        if not user:
            raise AuthError("User not found.", 404)
        if user.get("is_sysadmin"):
            raise AuthError("The system administrator account cannot be deleted.", 403)

        # Clear ERP link before deleting
        if user.get("erp_employee_id"):
            erp_service.mark_account_unlinked(user["erp_employee_id"])

        db[UserModel.COLLECTION].delete_one({"_id": ObjectId(target_user_id)})

        self._audit(
            "user.deleted",
            user=admin_user,
            target_id=target_user_id,
            detail={"username": user.get("username"), "display_name": user.get("display_name")},
        )

    # ── Permissions ───────────────────────────────────────────────────────────

    def get_effective_permissions(self, user: dict) -> set:
        """Return the effective set of permission nodes for a user."""
        if user.get("is_sysadmin"):
            return SYSADMIN_NODES
        return set(user.get("permissions", []))

    def has_permission(self, user: dict, node: str) -> bool:
        return node in self.get_effective_permissions(user)

    def update_user_permissions(
        self, target_user_id: str, nodes: list, admin_user: dict, template_id: str = None
    ) -> None:
        db = get_db()
        user = db[UserModel.COLLECTION].find_one({"_id": ObjectId(target_user_id)})
        if not user:
            raise AuthError("User not found.", 404)
        if user.get("is_sysadmin"):
            raise AuthError("Sysadmin permissions cannot be modified.", 403)

        db[UserModel.COLLECTION].update_one(
            {"_id": ObjectId(target_user_id)},
            {
                "$set": {
                    "permissions": nodes,
                    "permission_template": template_id,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        self._audit(
            "user.permissions_updated",
            user=admin_user,
            target_id=target_user_id,
            detail={"nodes": nodes, "template_id": template_id},
        )

    # ── Bootstrap ─────────────────────────────────────────────────────────────

    def ensure_sysadmin(self, username: str, password: str) -> None:
        """
        Called on app startup. Creates the sysadmin account if it doesn't exist.
        The sysadmin password is only set from .env on first run; subsequent
        runs will NOT overwrite an existing sysadmin.
        """
        db = get_db()
        existing = db[UserModel.COLLECTION].find_one({"is_sysadmin": True})
        if existing:
            return  # already bootstrapped

        user_doc = UserModel.new(
            username=username,
            password_hash=self.hash_password(password),
            display_name="System Administrator",
            is_sysadmin=True,
        )
        user_doc["must_change_password"] = True  # Even sysadmin must change on first login
        db[UserModel.COLLECTION].insert_one(user_doc)
        print(f"[BOOTSTRAP] Sysadmin account '{username}' created.")

    # ── Private ───────────────────────────────────────────────────────────────

    def _audit(
        self,
        action: str,
        user: dict = None,
        target_id: str = None,
        detail: dict = None,
        ip: str = None,
    ):
        db = get_db()
        log = AuditLogModel.new(
            action=action,
            user_id=str(user["_id"]) if user else None,
            username=user.get("username") if user else None,
            target_id=target_id,
            detail=detail,
            ip=ip,
        )
        db[AuditLogModel.COLLECTION].insert_one(log)

    # ── Devices ───────────────────────────────────────────────────────────────

    def get_user_devices(self, user_id: str) -> list[dict]:
        db = get_db()
        from app.models.user_device import UserDeviceModel
        devices = db[UserDeviceModel.COLLECTION].find({"user_id": user_id}).sort("last_active", -1)
        return [UserDeviceModel.to_public(d) for d in devices]

    def revoke_device(self, user_id: str, device_id: str) -> None:
        db = get_db()
        from app.models.user_device import UserDeviceModel
        res = db[UserDeviceModel.COLLECTION].delete_one({"_id": ObjectId(device_id), "user_id": user_id})
        if res.deleted_count == 0:
            raise AuthError("Device not found or not owned by you.", 404)

auth_service = AuthService()
