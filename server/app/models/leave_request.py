from datetime import datetime, timezone


class LeaveRequestModel:
    """
    Local mirror of an egc_hr Leave Application, keyed by an EGC-App-
    generated `external_reference`.

    egc_hr exposes only a single-record lookup (get_status by
    external_reference) - there's no "list mine" / "list where I'm the
    approver" query. EGC App needs both (My Requests / Team Requests), so
    it keeps its own indexed copy rather than adding new egc_hr surface
    for something it can already assemble itself. egc_hr's Leave
    Application remains the system of record; `status`/`docstatus` here
    are refreshed from egc_hr's own responses (submit/approve/reject/
    get_status), never invented locally.

    status mirrors egc_hr's Leave Application.status verbatim: "Open"
    (pending), "Approved", "Rejected".
    """

    COLLECTION = "leave_requests"

    @staticmethod
    def new(
        user_id: str,
        username: str,
        display_name: str,
        erp_employee_id: str,
        external_reference: str,
        leave_type: str,
        from_date,
        to_date,
        reason: str,
        leave_approver_erp_id: str | None,
        leave_approver_name: str | None,
    ) -> dict:
        now = datetime.now(timezone.utc)
        return {
            "user_id": user_id,
            "username": username,
            "display_name": display_name,
            "erp_employee_id": erp_employee_id,
            "external_reference": external_reference,
            "leave_type": leave_type,
            "from_date": from_date,
            "to_date": to_date,
            "reason": reason,
            "leave_approver_erp_id": leave_approver_erp_id,
            "leave_approver_name": leave_approver_name,
            "leave_application": None,
            "status": "Open",
            "docstatus": 0,
            "actioned_by_user_id": None,
            "actioned_by_name": None,
            "actioned_at": None,
            "action_remarks": None,
            "submitted_at": now,
            "last_synced_at": now,
            "created_at": now,
            "updated_at": now,
        }

    @staticmethod
    def to_public(req: dict) -> dict:
        return {
            "id": str(req["_id"]),
            "user_id": req["user_id"],
            "username": req["username"],
            "display_name": req["display_name"],
            "erp_employee_id": req.get("erp_employee_id"),
            "external_reference": req["external_reference"],
            "leave_type": req.get("leave_type"),
            "from_date": str(req["from_date"]) if req.get("from_date") else None,
            "to_date": str(req["to_date"]) if req.get("to_date") else None,
            "reason": req.get("reason", ""),
            "leave_approver_erp_id": req.get("leave_approver_erp_id"),
            "leave_approver_name": req.get("leave_approver_name"),
            "leave_application": req.get("leave_application"),
            "status": req.get("status", "Open"),
            "docstatus": req.get("docstatus", 0),
            "actioned_by_name": req.get("actioned_by_name"),
            "actioned_at": req["actioned_at"].isoformat() if req.get("actioned_at") else None,
            "action_remarks": req.get("action_remarks"),
            "submitted_at": req["submitted_at"].isoformat() if req.get("submitted_at") else None,
        }
