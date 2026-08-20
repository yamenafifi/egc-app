from datetime import datetime, timezone


class PushSubscriptionModel:
    """
    Schema reference for the `push_subscriptions` collection.

    Deliberately a separate collection from UserDeviceModel (login/
    session records) rather than a field on it: a browser PushSubscription
    (`endpoint` + `keys.p256dh`/`keys.auth`) has its own independent
    lifecycle - it can go stale or rotate (browser reinstall, storage
    clear, permission reset) with no login event involved, and
    pywebpush's webpush() needs to look up / prune by `endpoint` directly,
    matching what the browser's PushManager.subscribe() actually returns.

    _id          : ObjectId (auto)
    user_id      : str (ObjectId)
    device_id    : str (ObjectId) | None - the UserDevice this subscription
                   was registered from, if known; informational only
    endpoint     : str (unique) - the push service URL
    keys         : dict {"p256dh": str, "auth": str}
    user_agent   : str
    last_used_at : datetime
    created_at   : datetime
    """

    COLLECTION = "push_subscriptions"

    @staticmethod
    def new(
        user_id: str,
        endpoint: str,
        keys: dict,
        device_id: str | None = None,
        user_agent: str = "",
    ) -> dict:
        now = datetime.now(timezone.utc)
        return {
            "user_id": user_id,
            "device_id": device_id,
            "endpoint": endpoint,
            "keys": keys,
            "user_agent": user_agent,
            "created_at": now,
            "last_used_at": now,
        }
