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
GET    /export          — every category as an .xlsx (also doubles as the
                           "Update existing records" import template - same
                           columns, same ID column for matching on re-upload)
GET    /import-template — a blank .xlsx with just the column headers, for
                           adding new categories only
POST   /import          — bulk create/update from an uploaded .xlsx (see
                           import_categories() below for the exact rules)

Each category's `description` is not display copy - it's sent to Gemini
verbatim as the text that decides whether a given receipt belongs in that
category (see gemini_service.py), so validation here cares more about
"is this usable by the AI" than about UI polish.
"""

from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, request, jsonify, send_file

from app.utils.database import get_db
from app.models.expense_category import ExpenseCategoryModel
from app.middleware.auth_middleware import jwt_required_custom, require_permission
from app.services.erp_service import erp_service, ERPNextError
from app.services import xlsx_service

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


_EXPORT_HEADERS = ["ID", "Name", "Account", "Account Name", "Description"]
_TEMPLATE_HEADERS = ["Name", "Account", "Account Name", "Description"]


@bp.route("/export", methods=["GET"])
@require_permission("system.manage_settings")
def export_categories():
    db = get_db()
    categories = db[ExpenseCategoryModel.COLLECTION].find().sort("name", 1)
    rows = [
        [str(c["_id"]), c.get("name"), c.get("account"), c.get("account_name") or "", c.get("description") or ""]
        for c in categories
    ]
    buf = xlsx_service.build_workbook(_EXPORT_HEADERS, rows)
    return send_file(buf, as_attachment=True, download_name="expense_categories.xlsx", mimetype=xlsx_service.XLSX_MIMETYPE)


@bp.route("/import-template", methods=["GET"])
@require_permission("system.manage_settings")
def download_import_template():
    buf = xlsx_service.build_workbook(_TEMPLATE_HEADERS, [])
    return send_file(buf, as_attachment=True, download_name="expense_categories_template.xlsx", mimetype=xlsx_service.XLSX_MIMETYPE)


@bp.route("/import", methods=["POST"])
@require_permission("system.manage_settings")
def import_categories():
    file = request.files.get("file")
    update_existing = request.form.get("update_existing") == "true"
    if not file:
        return jsonify({"error": "An .xlsx file is required."}), 400

    try:
        headers, rows = xlsx_service.read_workbook(file.stream)
    except Exception:
        return jsonify({"error": "Could not read that file - make sure it's a valid .xlsx exported or downloaded from here."}), 400

    required = {"name", "account", "description"}
    got = {h.strip().lower() for h in headers}
    missing = required - got
    if missing:
        return jsonify({"error": f"Missing required column(s): {', '.join(sorted(missing))}"}), 400

    db = get_db()
    existing = list(db[ExpenseCategoryModel.COLLECTION].find())
    existing_by_id = {str(c["_id"]): c for c in existing}
    existing_by_name = {c["name"].strip().lower(): c for c in existing}

    created = updated = 0
    errors = []
    seen_names_this_batch = set()

    for i, row in enumerate(rows, start=2):  # row 1 is the header
        row_id = str(row.get("id") or "").strip()
        name = str(row.get("name") or "").strip()
        account = str(row.get("account") or "").strip()
        account_name = str(row.get("account name") or "").strip() or None
        description = str(row.get("description") or "").strip()

        if not (name or account or description or row_id):
            continue  # fully blank row

        if not name or not account or not description:
            errors.append({"row": i, "error": "Name, Account, and Description are all required."})
            continue

        name_key = name.lower()

        if row_id:
            target = existing_by_id.get(row_id)
            if not target:
                errors.append({"row": i, "error": f"No existing category with ID {row_id} - it may have been deleted since this file was downloaded."})
                continue
            if not update_existing:
                errors.append({"row": i, "error": "This row references an existing category, but 'Update existing records' wasn't enabled."})
                continue
            dup = existing_by_name.get(name_key)
            if dup and str(dup["_id"]) != row_id:
                errors.append({"row": i, "error": f"Another category is already named '{name}'."})
                continue
            db[ExpenseCategoryModel.COLLECTION].update_one(
                {"_id": target["_id"]},
                {"$set": {
                    "name": name, "account": account, "account_name": account_name,
                    "description": description, "updated_at": datetime.now(timezone.utc),
                }},
            )
            updated += 1
        else:
            if name_key in existing_by_name:
                errors.append({"row": i, "error": f"A category named '{name}' already exists."})
                continue
            if name_key in seen_names_this_batch:
                errors.append({"row": i, "error": f"Duplicate name '{name}' within this file."})
                continue
            doc = ExpenseCategoryModel.new(name, account, account_name, description)
            db[ExpenseCategoryModel.COLLECTION].insert_one(doc)
            created += 1
            seen_names_this_batch.add(name_key)

    return jsonify({"created": created, "updated": updated, "errors": errors}), 200


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
