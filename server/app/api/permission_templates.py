"""
Permission Template Routes  —  /api/permission-templates
=========================================================
GET    /api/permission-templates
POST   /api/permission-templates
GET    /api/permission-templates/<id>
PUT    /api/permission-templates/<id>
DELETE /api/permission-templates/<id>
POST   /api/permission-templates/<id>/apply/<user_id>
"""

from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g
from bson import ObjectId

from app.middleware.auth_middleware import require_permission
from app.models.permission_template import PermissionTemplateModel
from app.utils.database import get_db
from app.utils.permissions import ALL_NODES

bp = Blueprint("permission_templates", __name__, url_prefix="/api/permission-templates")


@bp.route("", methods=["GET"])
@require_permission("permission_templates.view")
def list_templates():
    db = get_db()
    templates = list(db[PermissionTemplateModel.COLLECTION].find().sort("name", 1))
    return jsonify({"templates": [PermissionTemplateModel.to_public(t) for t in templates]}), 200


@bp.route("", methods=["POST"])
@require_permission("permission_templates.create")
def create_template():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    description = (data.get("description") or "").strip()
    nodes = data.get("nodes", [])

    if not name:
        return jsonify({"error": "Template name is required."}), 400
    if not isinstance(nodes, list):
        return jsonify({"error": "'nodes' must be a list."}), 400

    invalid = [n for n in nodes if n not in ALL_NODES]
    if invalid:
        return jsonify({"error": f"Unknown permission nodes: {invalid}"}), 400

    db = get_db()
    existing = db[PermissionTemplateModel.COLLECTION].find_one({"name": name})
    if existing:
        return jsonify({"error": f"A template named '{name}' already exists."}), 409

    doc = PermissionTemplateModel.new(
        name=name,
        description=description,
        nodes=nodes,
        created_by=str(g.current_user["_id"]),
    )
    result = db[PermissionTemplateModel.COLLECTION].insert_one(doc)
    doc["_id"] = result.inserted_id

    return jsonify({"template": PermissionTemplateModel.to_public(doc)}), 201


@bp.route("/<template_id>", methods=["GET"])
@require_permission("permission_templates.view")
def get_template(template_id: str):
    db = get_db()
    try:
        template = db[PermissionTemplateModel.COLLECTION].find_one({"_id": ObjectId(template_id)})
    except Exception:
        return jsonify({"error": "Invalid template ID."}), 400

    if not template:
        return jsonify({"error": "Template not found."}), 404

    return jsonify({"template": PermissionTemplateModel.to_public(template)}), 200


@bp.route("/<template_id>", methods=["PUT"])
@require_permission("permission_templates.edit")
def update_template(template_id: str):
    data = request.get_json(silent=True) or {}
    db = get_db()

    update = {"updated_at": datetime.now(timezone.utc)}
    if "name" in data:
        update["name"] = data["name"].strip()
    if "description" in data:
        update["description"] = data["description"].strip()
    if "nodes" in data:
        nodes = data["nodes"]
        if not isinstance(nodes, list):
            return jsonify({"error": "'nodes' must be a list."}), 400
        invalid = [n for n in nodes if n not in ALL_NODES]
        if invalid:
            return jsonify({"error": f"Unknown permission nodes: {invalid}"}), 400
        update["nodes"] = nodes

    try:
        result = db[PermissionTemplateModel.COLLECTION].update_one(
            {"_id": ObjectId(template_id)}, {"$set": update}
        )
    except Exception:
        return jsonify({"error": "Invalid template ID."}), 400

    if result.matched_count == 0:
        return jsonify({"error": "Template not found."}), 404

    return jsonify({"message": "Template updated."}), 200


@bp.route("/<template_id>", methods=["DELETE"])
@require_permission("permission_templates.delete")
def delete_template(template_id: str):
    db = get_db()
    try:
        result = db[PermissionTemplateModel.COLLECTION].delete_one({"_id": ObjectId(template_id)})
    except Exception:
        return jsonify({"error": "Invalid template ID."}), 400

    if result.deleted_count == 0:
        return jsonify({"error": "Template not found."}), 404

    return jsonify({"message": "Template deleted."}), 200


@bp.route("/<template_id>/apply/<user_id>", methods=["POST"])
@require_permission("users.assign_template")
def apply_template_to_user(template_id: str, user_id: str):
    from app.services.auth_service import auth_service, AuthError
    db = get_db()

    try:
        template = db[PermissionTemplateModel.COLLECTION].find_one({"_id": ObjectId(template_id)})
    except Exception:
        return jsonify({"error": "Invalid template ID."}), 400

    if not template:
        return jsonify({"error": "Template not found."}), 404

    try:
        auth_service.update_user_permissions(
            target_user_id=user_id,
            nodes=template["nodes"],
            admin_user=g.current_user,
            template_id=template_id,
        )
    except AuthError as e:
        return jsonify({"error": str(e)}), e.status_code

    return jsonify({
        "message": f"Template '{template['name']}' applied to user.",
        "permissions": template["nodes"],
    }), 200
