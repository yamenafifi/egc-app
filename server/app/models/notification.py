from datetime import datetime, timezone


class NotificationModel:
    """
    Schema reference for the `notifications` collection - the in-app
    notification center. Every trigger point funnels through
    app.services.notification_service.notify(), which inserts one of
    these and then best-effort fans out a Web Push (see
    app.services.push_service) - the two are independent: a push
    delivery failure must never mean the in-app notification is lost.
    """

    COLLECTION = "notifications"

    TYPES = (
        "leave_submitted",
        "leave_approved",
        "leave_rejected",
        "timesheet_submitted",
        "timesheet_approved",
        "timesheet_rejected",
        "timesheet_push_failed",
    )

    @staticmethod
    def new(
        user_id: str,
        type: str,
        title: str,
        body: str,
        link: str | None = None,
        related_id: str | None = None,
    ) -> dict:
        now = datetime.now(timezone.utc)
        return {
            "user_id": user_id,
            "type": type,
            "title": title,
            "body": body,
            "link": link,
            "related_id": related_id,
            "is_read": False,
            "read_at": None,
            "created_at": now,
        }

    @staticmethod
    def to_public(n: dict) -> dict:
        return {
            "id": str(n["_id"]),
            "type": n["type"],
            "title": n["title"],
            "body": n["body"],
            "link": n.get("link"),
            "related_id": n.get("related_id"),
            "is_read": n.get("is_read", False),
            "read_at": n["read_at"].isoformat() if n.get("read_at") else None,
            "created_at": n["created_at"].isoformat() if n.get("created_at") else None,
        }
