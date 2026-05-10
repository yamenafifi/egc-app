from datetime import datetime, timezone


class AuditLogModel:
    """
    Append-only log for all significant actions in the system.

    _id       : ObjectId
    user_id   : str   — who performed the action
    username  : str   — denormalised for readability
    action    : str   — e.g. "user.created", "auth.login", "auth.failed_login"
    target_id : str | None — resource affected
    detail    : dict  — any extra context
    ip        : str
    timestamp : datetime
    """

    COLLECTION = "audit_log"

    @staticmethod
    def new(
        action: str,
        user_id: str = None,
        username: str = None,
        target_id: str = None,
        detail: dict = None,
        ip: str = None,
    ) -> dict:
        return {
            "user_id": user_id,
            "username": username or "system",
            "action": action,
            "target_id": target_id,
            "detail": detail or {},
            "ip": ip,
            "timestamp": datetime.now(timezone.utc),
        }
