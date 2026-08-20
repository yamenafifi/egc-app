from datetime import datetime, timezone
from bson import ObjectId

class UserDeviceModel:
    """
    Schema reference for the `user_devices` collection.

    _id          : ObjectId (auto)
    user_id      : str (ObjectId)
    device_uuid  : str (unique persistent identifier from client)
    device_name  : str
    ip_address   : str
    is_trusted   : bool
    last_active  : datetime
    created_at   : datetime
    """

    COLLECTION = "user_devices"

    @staticmethod
    def new(
        user_id: str,
        device_uuid: str,
        device_name: str,
        ip_address: str,
        is_trusted: bool = False,
        extra_info: dict = None,
    ) -> dict:
        now = datetime.now(timezone.utc)
        return {
            "user_id": user_id,
            "device_uuid": device_uuid,
            "device_name": device_name,
            "ip_address": ip_address,
            "is_trusted": is_trusted,
            "extra_info": extra_info or {},
            "last_active": now,
            "created_at": now,
        }

    @staticmethod
    def to_public(device: dict) -> dict:
        return {
            "id": str(device["_id"]),
            "device_name": device.get("device_name"),
            "ip_address": device.get("ip_address"),
            "extra_info": device.get("extra_info", {}),
            "is_trusted": device.get("is_trusted", False),
            "last_active": device["last_active"].isoformat() if device.get("last_active") else None,
            "created_at": device["created_at"].isoformat() if device.get("created_at") else None,
        }
