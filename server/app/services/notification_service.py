"""
Notification Service
=====================
Single funnel every trigger point calls - see docs on NotificationModel.TYPES
for the full list and app/api/attendance.py / app/api/leave.py for where
each one fires. Inserts the in-app NotificationModel row, then best-effort
fans out a Web Push (app.services.push_service) - a push failure must
never fail the request that triggered the notification, so it's always
wrapped and logged, never re-raised.
"""

from app.models.notification import NotificationModel
from app.utils.database import get_db


def notify(user_id: str, type: str, title: str, body: str,
        link: str = None, related_id: str = None) -> str:
    if not user_id:
        return None

    db = get_db()
    doc = NotificationModel.new(user_id, type, title, body, link, related_id)
    result = db[NotificationModel.COLLECTION].insert_one(doc)
    notification_id = str(result.inserted_id)

    try:
        from app.services.push_service import send_to_user
        send_to_user(user_id, title, body, link)
    except Exception as e:  # noqa: BLE001 - a push failure must never fail the caller
        print(f"[push] failed to deliver to user {user_id}: {e}")

    return notification_id


def notify_by_erp_employee_id(erp_employee_id: str, type: str, title: str, body: str,
        link: str = None, related_id: str = None) -> str | None:
    """Resolves an EGC App user_id from an ERPNext Employee id first - used
    wherever the recipient is known only by their Employee identity (e.g. a
    Leave Application's leave_approver, or a Project's Supervisors list).
    Skips silently if that employee has no EGC App account yet - an
    onboarding-ordering gap, not an error worth failing the request over."""
    from app.models.user import UserModel
    db = get_db()
    user = db[UserModel.COLLECTION].find_one({"erp_employee_id": erp_employee_id})
    if not user:
        return None
    return notify(str(user["_id"]), type, title, body, link, related_id)
