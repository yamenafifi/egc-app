"""
ERPNext V15 Integration Service
================================
All communication with stock ERPNext (Employee/Project/Designation/
Department/Account/Expense Claim/Company) is centralised here.

Base URL and credentials are read fresh from
app/services/settings_service.py on every request rather than baked into
a class attribute once at import time - Settings > General > EGC ERP API
Integration is the live, single source of truth (env vars are only the
fallback default before an admin ever touches that page), and a
credential rotation there must take effect immediately, with no server
restart, for every ERPNext-touching feature at once.
"""

import json
import requests

from app.services.settings_service import get_erp_credentials


class ERPNextError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


class ERPNextService:
    LINKED_FIELD = "custom_egc_portal"

    def __init__(self):
        self.session = requests.Session()

    def _base_url(self) -> str:
        return get_erp_credentials()["erp_base_url"].rstrip("/")

    def resolve_file_url(self, path: str | None) -> str | None:
        """ERPNext returns file/image fields (Employee.image,
        custom_iqamaid_image, etc.) as paths relative to ITS OWN site, not
        full URLs - the frontend has no business knowing the ERPNext base
        URL itself (that's exactly what Settings > EGC ERP API Integration
        centralizes), so every route hands back an already-resolved URL
        built from the live configured base, never a bare relative path
        for the frontend to guess at."""
        if not path:
            return None
        if path.startswith("http"):
            return path
        return f"{self._base_url()}{path}"

    def _headers(self) -> dict:
        creds = get_erp_credentials()
        return {
            "Authorization": f"token {creds['erp_api_key']}:{creds['erp_api_secret']}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _get(self, endpoint, params=None):
        url = f"{self._base_url()}/{endpoint.lstrip('/')}"
        try:
            resp = self.session.get(url, params=params, headers=self._headers(), timeout=15)
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.ConnectionError:
            raise ERPNextError("Cannot connect to ERPNext", 503)
        except requests.exceptions.Timeout:
            raise ERPNextError("ERPNext request timed out", 504)
        except requests.exceptions.HTTPError:
            raise ERPNextError(f"ERPNext returned {resp.status_code}: {resp.text}", resp.status_code)

    def _put(self, endpoint, data):
        url = f"{self._base_url()}/{endpoint.lstrip('/')}"
        try:
            resp = self.session.put(url, json=data, headers=self._headers(), timeout=15)
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.ConnectionError:
            raise ERPNextError("Cannot connect to ERPNext", 503)
        except requests.exceptions.Timeout:
            raise ERPNextError("ERPNext request timed out", 504)
        except requests.exceptions.HTTPError:
            raise ERPNextError(f"ERPNext returned {resp.status_code}: {resp.text}", resp.status_code)

    def _post(self, endpoint, data):
        url = f"{self._base_url()}/{endpoint.lstrip('/')}"
        try:
            resp = self.session.post(url, json=data, headers=self._headers(), timeout=15)
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.ConnectionError:
            raise ERPNextError("Cannot connect to ERPNext", 503)
        except requests.exceptions.Timeout:
            raise ERPNextError("ERPNext request timed out", 504)
        except requests.exceptions.HTTPError:
            raise ERPNextError(f"ERPNext returned {resp.status_code}: {resp.text}", resp.status_code)

    # ── Employee ──────────────────────────────────────────────────────────────

    def get_employee_list(self, page=1, page_length=50, search=None):
        # Standard fields only. Fetch custom fields individually to avoid 417 DataError in ERPNext V15
        fields = ["name", "employee_name", "department", "designation", "status"]

        # Treat blank string same as no search
        search = (search or "").strip() or None

        # `name` is the Employee ID (ERPNext's docname for this doctype,
        # e.g. "E00103") - matched alongside employee_name via or_filters
        # (Frappe's REST list API ANDs `filters` together but ORs
        # `or_filters` against each other) so a search box can find
        # someone by either. json.dumps() everywhere here (not the raw
        # string concatenation this used to be) so a search term
        # containing a quote or bracket can't break out of the filter
        # structure.
        base_filters = json.dumps([["status", "=", "Active"], ["custom_egc_portal", "=", 0]])
        or_filters = json.dumps([
            ["employee_name", "like", f"%{search}%"],
            ["name", "like", f"%{search}%"],
        ]) if search else None

        params = {
            "fields": json.dumps(fields),
            "limit_start": (page - 1) * page_length,
            "limit_page_length": page_length,
            "filters": base_filters,
            "order_by": "employee_name asc",
        }
        if or_filters:
            params["or_filters"] = or_filters

        data = self._get("api/resource/Employee", params)
        employees = data.get("data", [])

        # Count total safely — limit_page_length=0 is rejected by some ERPNext versions
        try:
            count_params = {
                "fields": '["name"]',
                "filters": base_filters,
                "limit_page_length": 500,
                "limit_start": 0,
            }
            if or_filters:
                count_params["or_filters"] = or_filters
            count_data = self._get("api/resource/Employee", count_params)
            total = len(count_data.get("data", []))
        except ERPNextError:
            total = len(employees)  # fallback to current page count
            
        # Fetch custom fields individually
        for emp in employees:
            doc = self.get_employee(emp["name"])
            emp["custom_iqamaid_number"] = doc.get("custom_iqamaid_number")
            emp[self.LINKED_FIELD] = doc.get(self.LINKED_FIELD)

        return {"employees": employees, "total": total, "page": page, "page_length": page_length}

    def search_employees_for_picker(self, search: str = None, limit: int = 20) -> list[dict]:
        """Active-employee search for an in-app picker (e.g. a supervisor
        flagging who a Deduction Request is about) - unlike
        get_employee_list(), this does NOT exclude employees who already
        have an EGC App account. That custom_egc_portal exclusion exists
        specifically for the "sync a new user from ERP" admin flow in
        UsersPage; a picker meant to find someone already using the app
        needs the opposite - most real employees ARE already onboarded."""
        fields = ["name", "employee_name", "department", "designation"]
        filters = [["status", "=", "Active"]]
        search = (search or "").strip()
        if search:
            filters.append(["employee_name", "like", f"%{search}%"])
        params = {
            "fields": json.dumps(fields),
            "filters": json.dumps(filters),
            "limit_page_length": limit,
            "order_by": "employee_name asc",
        }
        data = self._get("api/resource/Employee", params)
        return data.get("data", [])

    def get_employee(self, employee_id):
        return self._get(f"api/resource/Employee/{employee_id}").get("data", {})

    def get_employee_by_user_id(self, user_id: str) -> dict:
        """Resolves a Frappe User (e.g. a Leave Application's leave_approver,
        which is a Link to User, not Employee) back to the Employee record
        linked to that same User - EGC App only knows Employee identities,
        so this is the bridge whenever an ERPNext field speaks in Users."""
        if not user_id:
            return {}
        params = {
            "fields": '["name"]',
            "filters": f'[["user_id", "=", "{user_id}"]]',
            "limit_page_length": 1,
        }
        try:
            results = self._get("api/resource/Employee", params).get("data", [])
            if results:
                return self.get_employee(results[0]["name"])
        except ERPNextError:
            pass
        return {}

    def get_employee_by_iqama(self, iqama_number):
        # We cannot filter directly by custom_iqama_number due to ERPNext REST API restrictions.
        # We must fetch all Active employees and filter manually.
        params = {
            "fields": '["name"]',
            "filters": '[["status", "=", "Active"]]',
            "limit_page_length": 0, # Fetch all
        }
        try:
            results = self._get("api/resource/Employee", params).get("data", [])
            for res in results:
                doc = self.get_employee(res["name"])
                if doc.get("custom_iqamaid_number") == iqama_number:
                    return doc
        except ERPNextError:
            pass
        return None

    def get_employee_card(self, employee_id: str) -> dict:
        """
        Fetch all fields needed for the Employee Card and Legal Documents pages.
        Includes photo, documents, passport details, and personal info.
        """
        fields = [
            "name", "employee_name", "designation", "department",
            "date_of_joining", "date_of_birth", "status",
            "custom_iqama_number", "custom_portal_account_status",
            # Photo
            "image",
            # Legal documents
            "custom_iqamaid_image",
            "custom_passport_frontpage",
            # Passport details — add whichever custom fields you have
            "custom_passport_number",
            "custom_passport_nationality",
            "custom_passport_issue_date",
            "custom_passport_expiry_date",
            "custom_nationality",
            # Standard ERPNext fields that may exist
            "passport_number",
            "valid_upto",
        ]
        try:
            data = self._get(
                f"api/resource/Employee/{employee_id}",
            )
            employee = data.get("data", {})
        except ERPNextError:
            return {}

        for field in ("image", "custom_iqamaid_image", "custom_passport_frontpage"):
            if employee.get(field):
                employee[field] = self.resolve_file_url(employee[field])
        return employee

    def get_employee_sync_data(self, employee_id: str) -> dict | None:
        """
        Fetch employee sync data from ERPNext.
        
        Returns:
          - dict with employee fields  → employee exists, use the data
          - {"_deleted": True}         → employee was deleted from ERP entirely
          - None                       → ERP is unreachable, treat as non-fatal
        """
        try:
            emp = self.get_employee(employee_id)
            if not emp:
                # get_employee returned empty dict — record does not exist in ERP
                return {"_deleted": True}
            return emp
        except ERPNextError as e:
            if e.status_code == 404:
                # Explicit 404 — employee definitely deleted from ERP
                return {"_deleted": True}
            # Any other error (503, 504, etc.) — ERP unreachable, don't block
            return None

    def mark_account_linked(self, employee_id):
        try:
            self._put(f"api/resource/Employee/{employee_id}", {
                self.LINKED_FIELD: "Account Linked",  # existing field
                "custom_egc_portal": 1,               # ← ADD THIS
            })
            return True
        except ERPNextError:
            return False

    def mark_account_unlinked(self, employee_id):
        try:
            self._put(f"api/resource/Employee/{employee_id}", {
                self.LINKED_FIELD: "",
                "custom_egc_portal": 0,               # ← ADD THIS
            })
            return True
        except ERPNextError:
            return False

    def get_designation(self, designation_name: str) -> dict:
        """
        Fetch a Designation doctype record.
        Returns the data dict, or {} on any error.
        Useful for retrieving custom_english_designation.
        """
        if not designation_name:
            return {}
        try:
            return self._get(f"api/resource/Designation/{designation_name}").get("data", {})
        except ERPNextError:
            return {}

    def get_department(self, department_name: str) -> dict:
        """
        Fetch a Department doctype record.
        Returns the data dict, or {} on any error.
        Useful for retrieving custom_arabic_department_name.
        """
        if not department_name:
            return {}
        try:
            return self._get(f"api/resource/Department/{department_name}").get("data", {})
        except ERPNextError:
            return {}

    # ── Projects ──────────────────────────────────────────────────────────────

    def get_project_list(self, search=None, page_length=100):
        search = (search or "").strip() or None

        if search:
            filters = '[["project_name", "like", "%' + search + '%"], ["status", "not in", ["Cancelled", "Completed"]]]'
        else:
            filters = '[["status", "not in", ["Cancelled", "Completed"]]]'

        params = {
            "fields": '["name", "project_name", "status", "expected_end_date"]',
            "filters": filters,
            "limit_page_length": page_length,
            "order_by": "project_name asc",
        }
        return self._get("api/resource/Project", params).get("data", [])

    def get_project(self, project_id):
        return self._get(f"api/resource/Project/{project_id}").get("data", {})

    # ── Chart of Accounts ────────────────────────────────────────────────────

    def get_chart_of_accounts(self, company: str = None) -> list[dict]:
        """Leaf accounts only (is_group=0) - a group/header account (e.g.
        "Expenses" as a category header) can't actually be posted to, so
        it has no business appearing in an Expense Category's account
        picker. Unfiltered by company unless one is given: EGC's own COA
        is small enough (single company per docs/PAYROLL_OPERATIONS.md in
        egc-erp-hr) that a full unfiltered list is simplest and correct."""
        filters = [["is_group", "=", 0]]
        if company:
            filters.append(["company", "=", company])
        params = {
            "fields": '["name", "account_name", "account_number", "company"]',
            "filters": json.dumps(filters),
            "limit_page_length": 0,
            "order_by": "account_name asc",
        }
        return self._get("api/resource/Account", params).get("data", [])

    # ── Leave ─────────────────────────────────────────────────────────────────

    def get_leave_types(self):
        params = {
            "fields": '["name"]',
            "limit_page_length": 0,
            "order_by": "name asc",
        }
        data = self._get("api/resource/Leave Type", params)
        return [row["name"] for row in data.get("data", [])]

    # ── Timesheet push ────────────────────────────────────────────────────────

    def push_timesheet(self, submission, entries, employee_erp_id):
        """
        Creates a Timesheet doctype in ERPNext.
        Returns the created docname e.g. "TS-00001".
        """
        time_logs = []
        for entry in entries:
            if not entry.get("clock_in") or not entry.get("clock_out"):
                continue
            time_logs.append({
                "activity_type": "Execution",
                "from_time": entry["clock_in"].strftime("%Y-%m-%d %H:%M:%S"),
                "to_time": entry["clock_out"].strftime("%Y-%m-%d %H:%M:%S"),
                "hours": round(entry.get("duration_hours") or 0, 2),
                "project": entry["project_id"],
                "is_billable": 0,
            })

        if not time_logs:
            raise ERPNextError("No valid clock-in/out entries to push", 400)

        payload = {
            "doctype": "Timesheet",
            "employee": employee_erp_id,
            "start_date": submission["period_start"].strftime("%Y-%m-%d"),
            "end_date": submission["period_end"].strftime("%Y-%m-%d"),
            "time_logs": time_logs,
        }
        result = self._post("api/resource/Timesheet", payload)
        name = result.get("data", {}).get("name")
        if not name:
            raise ERPNextError("ERPNext did not return a Timesheet name", 500)
        return name

    # ── Expense Claim push ───────────────────────────────────────────────────
    #
    # Deliberately NOT going through egc_hr_service - unlike attendance/leave/
    # deductions, an Expense Claim isn't part of egc_hr's payroll rule engine
    # at all, so a direct stock-doctype POST (the same shape push_timesheet()
    # above already establishes, even though that one specific method is
    # unused) is the correct pattern here, not the versioned egc_hr API.

    # Must stay in sync with EXPENSE_CLAIM_TYPE in the egc-erp-hr repo's
    # egc_hr/setup/bootstrap_expense_claim_type.py - no shared constant
    # across the two codebases, only these two comments.
    EXPENSE_CLAIM_TYPE = "EGC Misc Expense"

    def get_company(self, name: str) -> dict:
        return self._get(f"api/resource/Company/{name}").get("data", {})

    def expense_claim_type_exists(self, name: str = None) -> bool:
        try:
            self._get(f"api/resource/Expense Claim Type/{name or self.EXPENSE_CLAIM_TYPE}")
            return True
        except ERPNextError as e:
            if e.status_code == 404:
                return False
            raise

    def push_expense_claim(self, application: dict, employee_erp_id: str) -> str:
        """Creates a real, submitted ERPNext Expense Claim from an approved
        Expense Claim Application. Every line posts under one generic
        Expense Claim Type ("just use any stupid item") - the AI-generated
        bilingual description is what carries the real detail, not the
        item classification. Raises ERPNextError on any failure; the
        caller is responsible for recording push_status/push_detail
        rather than losing the failure reason."""
        included = [r for r in application.get("receipts", []) if r.get("included")]
        if not included:
            raise ERPNextError("No included receipts to push.", 400)

        company = self.get_company(application["company"])
        payable_account = company.get("default_expense_claim_payable_account")
        cost_center = company.get("cost_center")
        if not payable_account or not cost_center:
            raise ERPNextError(
                "Company is missing default_expense_claim_payable_account or cost_center.", 400,
            )
        if not self.expense_claim_type_exists():
            raise ERPNextError(f"Expense Claim Type '{self.EXPENSE_CLAIM_TYPE}' does not exist.", 400)

        expenses = []
        for r in included:
            description = " / ".join(filter(None, [r.get("description_en"), r.get("description_ar")]))
            expenses.append({
                "expense_type": self.EXPENSE_CLAIM_TYPE,
                "expense_date": r.get("receipt_date") or application["submitted_at"].strftime("%Y-%m-%d"),
                "description": description,
                "amount": r.get("total_amount") or 0,
                "sanctioned_amount": r.get("total_amount") or 0,
                "cost_center": cost_center,
            })

        payload = {
            "doctype": "Expense Claim",
            "employee": employee_erp_id,
            "company": application["company"],
            "project": application.get("project_id"),
            "currency": "SAR",
            "exchange_rate": 1,
            "approval_status": "Approved",
            "payable_account": payable_account,
            "cost_center": cost_center,
            "expenses": expenses,
        }
        result = self._post("api/resource/Expense Claim", payload)
        name = result.get("data", {}).get("name")
        if not name:
            raise ERPNextError("ERPNext did not return an Expense Claim name", 500)
        return name

    # ── Health check ──────────────────────────────────────────────────────────

    def ping(self):
        try:
            self._get("api/method/frappe.auth.get_logged_user")
            return True
        except ERPNextError:
            return False


erp_service = ERPNextService()