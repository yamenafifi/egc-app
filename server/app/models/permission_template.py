from datetime import datetime, timezone


class PermissionTemplateModel:
    """
    Schema reference for the `permission_templates` collection.

    _id        : ObjectId
    name       : str   — unique human-readable name (e.g. "Site Supervisor")
    description: str
    nodes      : list[str] — list of permission node strings
    created_by : str   — ObjectId of creating admin
    created_at : datetime
    updated_at : datetime
    """

    COLLECTION = "permission_templates"

    @staticmethod
    def new(name: str, description: str, nodes: list, created_by: str) -> dict:
        now = datetime.now(timezone.utc)
        return {
            "name": name,
            "description": description,
            "nodes": nodes,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
        }

    @staticmethod
    def to_public(template: dict) -> dict:
        return {
            "id": str(template["_id"]),
            "name": template["name"],
            "description": template.get("description", ""),
            "nodes": template.get("nodes", []),
            "created_at": template["created_at"].isoformat() if template.get("created_at") else None,
        }
