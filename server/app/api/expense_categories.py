"""
Expense Category Routes  —  /api/expense-categories
=====================================================
GET    /                — every configured category (any authenticated user -
                           the accountant's receipt-correction dropdown and the
                           Settings page both need to read this list)
POST   /                — create a category (requires system.manage_settings)
PUT    /<id>            — update a category (requires system.manage_settings)
DELETE /<id>            — delete a category (requires system.manage_settings)
GET    /accounts        — proxy to ERPNext's Chart of Accounts, for the
                           Settings page's account picker (requires
                           system.manage_settings - nothing else needs it)

Each category's `description` is not display copy - it's sent to Gemini
verbatim as the text that decides whether a given receipt belongs in that
category (see gemini_service.py), so validation here cares more about
"is this usable by the AI" than about UI polish.
"""

from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, request, jsonify

from app.utils.database import get_db
from app.models.expense_category import ExpenseCategoryModel
from app.middleware.auth_middleware import jwt_required_custom, require_permission
from app.services.erp_service import erp_service, ERPNextError

bp = Blueprint("expense_categories", __name__, url_prefix="/api/expense-categories")


def _get_category_or_404(category_id):
    try:
        oid = ObjectId(category_id)
    except Exception:
        return None
    db = get_db()
    return db[ExpenseCategoryModel.COLLECTION].find_one({"_id": oid})


@bp.route("", methods=["GET"])
@jwt_required_custom
def list_categories():
    db = get_db()
    categories = db[ExpenseCategoryModel.COLLECTION].find().sort("name", 1)
    return jsonify({"categories": [ExpenseCategoryModel.to_public(c) for c in categories]}), 200


@bp.route("/accounts", methods=["GET"])
@require_permission("system.manage_settings")
def list_accounts():
    company = request.args.get("company") or None
    try:
        accounts = erp_service.get_chart_of_accounts(company)
    except ERPNextError as e:
        if e.status_code == 403:
            return jsonify({
                "error": "The ERP_API_KEY credential doesn't have permission to read Account "
                         "records. Grant the EGC Integration Agent (or whichever role this key "
                         "uses) read access on the Account doctype in ERPNext.",
            }), 403
        return jsonify({"error": str(e)}), e.status_code
    return jsonify({"accounts": accounts}), 200


@bp.route("", methods=["POST"])
@require_permission("system.manage_settings")
def create_category():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    account = (body.get("account") or "").strip()
    description = (body.get("description") or "").strip()
    if not name or not account or not description:
        return jsonify({"error": "name, account, and description are all required."}), 400

    db = get_db()
    if db[ExpenseCategoryModel.COLLECTION].find_one({"name": {"$regex": f"^{name}$", "$options": "i"}}):
        return jsonify({"error": f"A category named '{name}' already exists."}), 409

    doc = ExpenseCategoryModel.new(name, account, body.get("account_name"), description)
    result = db[ExpenseCategoryModel.COLLECTION].insert_one(doc)
    doc["_id"] = result.inserted_id
    return jsonify({"category": ExpenseCategoryModel.to_public(doc)}), 201


@bp.route("/<category_id>", methods=["PUT"])
@require_permission("system.manage_settings")
def update_category(category_id):
    existing = _get_category_or_404(category_id)
    if not existing:
        return jsonify({"error": "Category not found."}), 404

    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    account = (body.get("account") or "").strip()
    description = (body.get("description") or "").strip()
    if not name or not account or not description:
        return jsonify({"error": "name, account, and description are all required."}), 400

    db = get_db()
    dup = db[ExpenseCategoryModel.COLLECTION].find_one({
        "_id": {"$ne": existing["_id"]},
        "name": {"$regex": f"^{name}$", "$options": "i"},
    })
    if dup:
        return jsonify({"error": f"A category named '{name}' already exists."}), 409

    db[ExpenseCategoryModel.COLLECTION].update_one(
        {"_id": existing["_id"]},
        {"$set": {
            "name": name, "account": account, "account_name": body.get("account_name"),
            "description": description, "updated_at": datetime.now(timezone.utc),
        }},
    )
    updated = db[ExpenseCategoryModel.COLLECTION].find_one({"_id": existing["_id"]})
    return jsonify({"category": ExpenseCategoryModel.to_public(updated)}), 200


@bp.route("/<category_id>", methods=["DELETE"])
@require_permission("system.manage_settings")
def delete_category(category_id):
    existing = _get_category_or_404(category_id)
    if not existing:
        return jsonify({"error": "Category not found."}), 404
    db = get_db()
    db[ExpenseCategoryModel.COLLECTION].delete_one({"_id": existing["_id"]})
    return jsonify({"message": "Category deleted."}), 200
