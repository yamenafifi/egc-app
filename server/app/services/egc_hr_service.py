"""
egc_hr Integration Service
===========================
All communication with egc_hr's versioned API
(api/method/egc_hr.egc_hr.api.v1.*) is centralised here - a distinct
surface from erp_service.py's stock ERPNext REST calls, even though both
usually point at the same physical Frappe site (see
config.settings.Config.EGC_HR_BASE_URL). This is the ONLY correct way to
feed approved attendance into payroll and to create/action Leave
Applications - never build a raw ERPNext Timesheet/Leave Application
directly (see the now-dead ERPNextService.push_timesheet() for what NOT
to do: it bypasses egc_hr's entire Work Record/payroll pipeline).

See docs/EGC_APP_INTEGRATION.md in the egc-erp-hr repo for the full
contract every method here wraps.
"""

import requests
from config.settings import Config


class EGCHRError(Exception):
    def __init__(self, message: str, status_code: int = 500, result: str = None):
        super().__init__(message)
        self.status_code = status_code
        self.result = result


class EGCHRService:
    BASE_URL = Config.EGC_HR_BASE_URL.rstrip("/")
    METHOD_PREFIX = "api/method/egc_hr.egc_hr.api.v1"  # dotted - joined with "." below, not "/"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"token {Config.EGC_HR_API_KEY}:{Config.EGC_HR_API_SECRET}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        })

    def _url(self, method_path: str) -> str:
        return f"{self.BASE_URL}/{self.METHOD_PREFIX}.{method_path.lstrip('/')}"

    def _get(self, method_path, params=None):
        url = self._url(method_path)
        try:
            resp = self.session.get(url, params=params, timeout=15)
            resp.raise_for_status()
            return resp.json().get("message", {})
        except requests.exceptions.ConnectionError:
            raise EGCHRError("Cannot connect to egc_hr", 503)
        except requests.exceptions.Timeout:
            raise EGCHRError("egc_hr request timed out", 504)
        except requests.exceptions.HTTPError:
            raise EGCHRError(f"egc_hr returned {resp.status_code}: {resp.text}", resp.status_code)

    def _post(self, method_path, data):
        url = self._url(method_path)
        try:
            resp = self.session.post(url, json=data, timeout=20)
            resp.raise_for_status()
            return resp.json().get("message", {})
        except requests.exceptions.ConnectionError:
            raise EGCHRError("Cannot connect to egc_hr", 503)
        except requests.exceptions.Timeout:
            raise EGCHRError("egc_hr request timed out", 504)
        except requests.exceptions.HTTPError:
            raise EGCHRError(f"egc_hr returned {resp.status_code}: {resp.text}", resp.status_code)

    # ── Work Record (attendance) ────────────────────────────────────────────
    #
    # Frappe whitelisted methods expect their arguments as named top-level
    # JSON keys matching the Python function's own parameter names - e.g.
    # import_record(payload=None) is called with {"payload": {...}}, NOT
    # the inner dict sent directly as the request body. Every POST here
    # wraps its argument(s) accordingly.

    def import_work_record(self, payload: dict) -> dict:
        return self._post("work_record.import_record", {"payload": payload})

    def import_work_record_batch(self, payloads: list) -> dict:
        return self._post("work_record.import_batch", {"payloads": payloads})

    def get_work_record_status(self, external_work_record_id: str) -> dict:
        return self._get("work_record.get_status", {"external_work_record_id": external_work_record_id})

    # ── Leave ────────────────────────────────────────────────────────────────

    def submit_leave_request(self, payload: dict) -> dict:
        return self._post("leave.submit_leave_request", {"payload": payload})

    def get_leave_status(self, external_reference: str) -> dict:
        return self._get("leave.get_status", {"external_reference": external_reference})

    def approve_leave(self, external_reference: str, approver_reference: str, remarks: str = None) -> dict:
        return self._post("leave.approve", {"payload": {
            "external_reference": external_reference,
            "approver_reference": approver_reference,
            "remarks": remarks,
        }})

    def reject_leave(self, external_reference: str, approver_reference: str, remarks: str = None) -> dict:
        return self._post("leave.reject", {"payload": {
            "external_reference": external_reference,
            "approver_reference": approver_reference,
            "remarks": remarks,
        }})

    # ── Project Site ─────────────────────────────────────────────────────────

    def list_active_sites(self) -> list[dict]:
        result = self._get("project_site.list_active")
        return result if isinstance(result, list) else []

    # ── Deduction ────────────────────────────────────────────────────────────

    def create_deduction(self, payload: dict) -> dict:
        return self._post("deduction.create", {"payload": payload})

    def list_deductions_for_employee(
        self, employee_reference: str, period_start: str = None, period_end: str = None,
    ) -> list[dict]:
        params = {"employee_reference": employee_reference}
        if period_start and period_end:
            params["period_start"] = period_start
            params["period_end"] = period_end
        result = self._get("deduction.list_for_employee", params)
        return result if isinstance(result, list) else []

    def list_deduction_categories(self) -> list[dict]:
        result = self._get("deduction.list_categories")
        return result if isinstance(result, list) else []

    def appeal_deduction(self, deduction: str, employee_reference: str, appeal_reason: str) -> dict:
        return self._post("deduction.appeal", {"payload": {
            "deduction": deduction,
            "employee_reference": employee_reference,
            "appeal_reason": appeal_reason,
        }})

    def list_pending_deduction_appeals(self) -> list[dict]:
        result = self._get("deduction.list_pending_appeals")
        return result if isinstance(result, list) else []

    def resolve_deduction_appeal(
        self, deduction: str, resolved_by_reference: str, outcome: str, resolution_notes: str = None,
    ) -> dict:
        return self._post("deduction.resolve_appeal", {"payload": {
            "deduction": deduction,
            "resolved_by_reference": resolved_by_reference,
            "outcome": outcome,
            "resolution_notes": resolution_notes,
        }})


egc_hr_service = EGCHRService()
