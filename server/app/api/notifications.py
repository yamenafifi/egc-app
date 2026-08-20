"""
Notification Routes  —  /api/notifications
=============================================
GET    /                     — list, paginated
GET    /unread-count         — for the bell icon badge
POST   /<id>/read            — mark one read
POST   /read-all             — mark all read
GET    /vapid-public-key     — public key only, safe to expose unauthenticated-adjacent
POST   /push-subscribe       — register a browser PushSubscription
DELETE /push-subscribe       — remove one (endpoint in body)
"""

from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, request, jsonify, g

from config.settings import Config
from app.utils.database import get_db
from app.models.notification import NotificationModel
from app.models.push_subscription import PushSubscriptionModel
from app.middleware.auth_middleware import jwt_required_custom

bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


@bp.route("", methods=["GET"])
@jwt_required_custom
def list_notifications():
    db = get_db()
    user_id = str(g.current_user["_id"])
    page = int(request.args.get("page", 1))
    page_length = min(int(request.args.get("page_length", 30)), 100)

    cursor = db[NotificationModel.COLLECTION].find({"user_id": user_id}) \
        .sort("created_at", -1) \
        .skip((page - 1) * page_length) \
        .limit(page_length)
    return jsonify({"notifications": [NotificationModel.to_public(n) for n in cursor]}), 200


@bp.route("/unread-count", methods=["GET"])
@jwt_required_custom
def unread_count():
    db = get_db()
    user_id = str(g.current_user["_id"])
    count = db[NotificationModel.COLLECTION].count_documents({"user_id": user_id, "is_read": False})
    return jsonify({"count": count}), 200


@bp.route("/<notification_id>/read", methods=["POST"])
@jwt_required_custom
def mark_read(notification_id):
    db = get_db()
    user_id = str(g.current_user["_id"])
    db[NotificationModel.COLLECTION].update_one(
        {"_id": ObjectId(notification_id), "user_id": user_id},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc)}},
    )
    return jsonify({"ok": True}), 200


@bp.route("/read-all", methods=["POST"])
@jwt_required_custom
def mark_all_read():
    db = get_db()
    user_id = str(g.current_user["_id"])
    db[NotificationModel.COLLECTION].update_many(
        {"user_id": user_id, "is_read": False},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc)}},
    )
    return jsonify({"ok": True}), 200


@bp.route("/vapid-public-key", methods=["GET"])
@jwt_required_custom
def vapid_public_key():
    return jsonify({"public_key": Config.VAPID_PUBLIC_KEY}), 200


@bp.route("/push-subscribe", methods=["POST"])
@jwt_required_custom
def push_subscribe():
    db = get_db()
    user = g.current_user
    body = request.get_json(silent=True) or {}

    endpoint = body.get("endpoint")
    keys = body.get("keys")
    if not endpoint or not keys:
        return jsonify({"error": "endpoint and keys are required."}), 400

    from flask_jwt_extended import get_jwt
    device_id = get_jwt().get("device_id")

    db[PushSubscriptionModel.COLLECTION].update_one(
        {"endpoint": endpoint},
        {"$set": {
            "user_id": str(user["_id"]),
            "device_id": device_id,
            "keys": keys,
            "user_agent": request.headers.get("User-Agent", ""),
            "last_used_at": datetime.now(timezone.utc),
        },
        "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return jsonify({"ok": True}), 200


@bp.route("/push-subscribe", methods=["DELETE"])
@jwt_required_custom
def push_unsubscribe():
    db = get_db()
    body = request.get_json(silent=True) or {}
    endpoint = body.get("endpoint")
    if not endpoint:
        return jsonify({"error": "endpoint is required."}), 400
    db[PushSubscriptionModel.COLLECTION].delete_one({"endpoint": endpoint, "user_id": str(g.current_user["_id"])})
    return jsonify({"ok": True}), 200
