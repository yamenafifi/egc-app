from datetime import datetime, timezone


class DeductionRequestModel:
    """
    A supervisor's initial flag that an employee should be docked pay for
    something - equipment/tool damage, verified unproductive hours, etc.
    Traffic violations are deliberately NOT part of this flow: those are
    sent by the company head directly to HR and recorded manually in
    egc_hr, a separate process (see docs/HOW_IT_WORKS.md in egc-erp-hr).

    This is NOT yet a real payroll deduction - it only becomes one when
    HR reviews it, picks the actual EGC Deduction Category/amount/date,
    and converts it (see app/api/deductions.py::convert_request(), which
    calls egc_hr_service.create_deduction()). Kept as its own local
    record for the same reason TimesheetSubmissionModel is: egc_hr's own
    EGC Deduction only exists once someone has actually decided the
    amount/category, and a supervisor flagging an incident hasn't made
    that decision - they're reporting what they saw.

    status lifecycle:
      pending    → submitted, awaiting HR review
      converted  → HR approved it and created a real EGC Deduction
      dismissed  → HR reviewed it and declined to act on it

    push_status mirrors TimesheetSubmissionModel's separation of "HR's
    decision" from "did it actually land in egc_hr" - the conversion
    itself can succeed as a decision while the push to egc_hr fails
    (unreachable, validation error), and that distinction needs to stay
    visible rather than being collapsed into one status:
      None      → not yet converted
      "pushed"   → egc_hr created (or already had) the Deduction cleanly
      "failed"   → egc_hr was unreachable or rejected it - see push_detail
    """

    COLLECTION = "deduction_requests"

    CATEGORY_HINTS = ("Equipment / Tool Damage", "Unproductive Hours", "Other")

    @staticmethod
    def new(
        requested_by_user_id: str,
        requested_by_username: str,
        requested_by_display_name: str,
        employee_erp_id: str,
        employee_display_name: str,
        category_hint: str,
        description: str,
        project_id: str | None = None,
        project_name: str | None = None,
        incident_date=None,
        suggested_amount: float | None = None,
        suggested_hours: float | None = None,
    ) -> dict:
        now = datetime.now(timezone.utc)
        return {
            "requested_by_user_id": requested_by_user_id,
            "requested_by_username": requested_by_username,
            "requested_by_display_name": requested_by_display_name,
            "employee_erp_id": employee_erp_id,
            "employee_display_name": employee_display_name,
            "category_hint": category_hint,
            "description": description,
            "project_id": project_id,
            "project_name": project_name,
            "incident_date": incident_date or now,
            "suggested_amount": suggested_amount,
            "suggested_hours": suggested_hours,
            "status": "pending",
            "submitted_at": now,
            "resolved_by_user_id": None,
            "resolved_by_name": None,
            "resolved_at": None,
            "resolution_note": None,
            "deduction_category_code": None,
            "final_amount": None,
            "final_hours": None,
            "deduction_date": None,
            "egc_hr_deduction": None,
            "push_status": None,
            "push_detail": None,
        }

    @staticmethod
    def to_public(req: dict) -> dict:
        return {
            "id": str(req["_id"]),
            "requested_by_user_id": req.get("requested_by_user_id"),
            "requested_by_display_name": req.get("requested_by_display_name"),
            "employee_erp_id": req.get("employee_erp_id"),
            "employee_display_name": req.get("employee_display_name"),
            "category_hint": req.get("category_hint"),
            "description": req.get("description", ""),
            "project_id": req.get("project_id"),
            "project_name": req.get("project_name"),
            "incident_date": req["incident_date"].isoformat() if req.get("incident_date") else None,
            "suggested_amount": req.get("suggested_amount"),
            "suggested_hours": req.get("suggested_hours"),
            "status": req.get("status", "pending"),
            "submitted_at": req["submitted_at"].isoformat() if req.get("submitted_at") else None,
            "resolved_by_name": req.get("resolved_by_name"),
            "resolved_at": req["resolved_at"].isoformat() if req.get("resolved_at") else None,
            "resolution_note": req.get("resolution_note"),
            "deduction_category_code": req.get("deduction_category_code"),
            "final_amount": req.get("final_amount"),
            "final_hours": req.get("final_hours"),
            "deduction_date": str(req["deduction_date"]) if req.get("deduction_date") else None,
            "egc_hr_deduction": req.get("egc_hr_deduction"),
            "push_status": req.get("push_status"),
            "push_detail": req.get("push_detail"),
        }
