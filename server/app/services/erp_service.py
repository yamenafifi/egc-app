"""
ERPNext V15 Integration Service
================================
All communication with erp.egc-me.com is centralised here.
"""

import json
import requests
from config.settings import Config


class ERPNextError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


class ERPNextService:
    BASE_URL = Config.ERP_BASE_URL.rstrip("/")
    LINKED_FIELD = "custom_egc_portal"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"token {Config.ERP_API_KEY}:{Config.ERP_API_SECRET}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        })

    def _get(self, endpoint, params=None):
        url = f"{self.BASE_URL}/{endpoint.lstrip('/')}"
        try:
            resp = self.session.get(url, params=params, timeout=15)
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.ConnectionError:
            raise ERPNextError("Cannot connect to ERPNext", 503)
        except requests.exceptions.Timeout:
            raise ERPNextError("ERPNext request timed out", 504)
        except requests.exceptions.HTTPError:
            raise ERPNextError(f"ERPNext returned {resp.status_code}: {resp.text}", resp.status_code)

    def _put(self, endpoint, data):
        url = f"{self.BASE_URL}/{endpoint.lstrip('/')}"
        try:
            resp = self.session.put(url, json=data, timeout=15)
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.ConnectionError:
            raise ERPNextError("Cannot connect to ERPNext", 503)
        except requests.exceptions.Timeout:
            raise ERPNextError("ERPNext request timed out", 504)
        except requests.exceptions.HTTPError:
            raise ERPNextError(f"ERPNext returned {resp.status_code}: {resp.text}", resp.status_code)

    def _post(self, endpoint, data):
        url = f"{self.BASE_URL}/{endpoint.lstrip('/')}"
        try:
            resp = self.session.post(url, json=data, timeout=15)
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

        if search:
            filters = '[["employee_name", "like", "%' + search + '%"], ["status", "=", "Active"], ["custom_egc_portal", "=", 0]]'
        else:
            filters = '[["status", "=", "Active"], ["custom_egc_portal", "=", 0]]'

        params = {
            "fields": json.dumps(fields),
            "limit_start": (page - 1) * page_length,
            "limit_page_length": page_length,
            "filters": filters,
            "order_by": "employee_name asc",
        }

        data = self._get("api/resource/Employee", params)
        employees = data.get("data", [])

        # Count total safely — limit_page_length=0 is rejected by some ERPNext versions
        try:
            count_params = {
                "fields": '["name"]',
                "filters": filters,
                "limit_page_length": 500,
                "limit_start": 0,
            }
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

    def get_employee(self, employee_id):
        return self._get(f"api/resource/Employee/{employee_id}").get("data", {})

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
            return data.get("data", {})
        except ERPNextError:
            return {}

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

    # ── Health check ──────────────────────────────────────────────────────────

    def ping(self):
        try:
            self._get("api/method/frappe.auth.get_logged_user")
            return True
        except ERPNextError:
            return False


erp_service = ERPNextService()