from datetime import datetime, timezone


class ExpenseCategoryModel:
    """
    An admin-managed classification an expense receipt can be tagged
    with - e.g. "Fuel", "Site Materials", "Office Supplies" - each linked
    to a real ERPNext GL Account (for reporting) and carrying a
    description written for the AI, not for a human: it's sent to Gemini
    verbatim as the deciding text for which category (if any) best fits
    a given receipt (see gemini_service.py's category-classification
    prompt section), so it should describe *what kind of purchase*
    belongs here, not just restate the category's name.
    """

    COLLECTION = "expense_categories"

    @staticmethod
    def new(name: str, account: str, account_name: str | None, description: str) -> dict:
        now = datetime.now(timezone.utc)
        return {
            "name": name,
            "account": account,
            "account_name": account_name,
            "description": description,
            "created_at": now,
            "updated_at": now,
        }

    @staticmethod
    def to_public(doc: dict) -> dict:
        return {
            "id": str(doc["_id"]),
            "name": doc.get("name"),
            "account": doc.get("account"),
            "account_name": doc.get("account_name"),
            "description": doc.get("description", ""),
        }
