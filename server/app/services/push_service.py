"""
Web Push Service
=================
Sends one Web Push notification to every registered PushSubscription for a
user, via pywebpush. Called only from notification_service.notify() - a
delivery failure here must never bubble up to whatever triggered the
notification.

vapid_private_key is the raw 32-byte EC private key, base64url-encoded with
no padding (see .env.example) - py_vapid.Vapid02.from_string() auto-detects
this "RAW" form vs. DER when given a plain str, no PEM wrapping needed.
"""

import json

from pywebpush import webpush, WebPushException

from config.settings import Config
from app.models.push_subscription import PushSubscriptionModel
from app.utils.database import get_db


def send_to_user(user_id: str, title: str, body: str, link: str = None) -> None:
    if not Config.VAPID_PRIVATE_KEY or not Config.VAPID_PUBLIC_KEY:
        return  # Web Push not configured - the in-app notification already landed

    db = get_db()
    subscriptions = list(db[PushSubscriptionModel.COLLECTION].find({"user_id": user_id}))
    payload = json.dumps({"title": title, "body": body, "link": link})

    for sub in subscriptions:
        _send_one(db, sub, payload)


def _send_one(db, sub: dict, payload: str) -> None:
    try:
        webpush(
            subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
            data=payload,
            vapid_private_key=Config.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": Config.VAPID_CLAIM_EMAIL},
        )
    except WebPushException as e:
        status = e.response.status_code if e.response is not None else None
        if status in (404, 410):
            # Gone - uninstalled, permission revoked, or storage cleared.
            # The user re-subscribes next time they open the notification
            # center; nothing to recover here.
            db[PushSubscriptionModel.COLLECTION].delete_one({"_id": sub["_id"]})
        else:
            print(f"[push] delivery failed for endpoint {sub['endpoint'][:60]}...: {e}")
