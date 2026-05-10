from datetime import datetime, timezone


class ClockRecordModel:
    """
    A single clock-in / clock-out pair for one employee on one project.

    status lifecycle:
      open    → clocked in, session in progress (clock_out is None)
      closed  → clocked out, available to bundle into a submission
      bundled → included in a TimesheetSubmission (submission_id is set)
    """

    COLLECTION = "clock_records"

    @staticmethod
    def new(
        user_id: str,
        username: str,
        display_name: str,
        erp_employee_id: str,
        project_id: str,
        project_name: str,
        scanned_by: str,
        scanned_by_name: str,
        note: str = "",
    ) -> dict:
        now = datetime.now(timezone.utc)
        return {
            "user_id": user_id,
            "username": username,
            "display_name": display_name,
            "erp_employee_id": erp_employee_id,
            "project_id": project_id,
            "project_name": project_name,
            "clock_in": now,
            "clock_out": None,
            "hours": None,
            "scanned_by": scanned_by,
            "scanned_by_name": scanned_by_name,
            "note": note,
            "status": "open",
            "submission_id": None,
            "created_at": now,
        }

    @staticmethod
    def to_public(rec: dict) -> dict:
        return {
            "id": str(rec["_id"]),
            "user_id": rec["user_id"],
            "username": rec["username"],
            "display_name": rec["display_name"],
            "erp_employee_id": rec.get("erp_employee_id"),
            "project_id": rec["project_id"],
            "project_name": rec["project_name"],
            "clock_in": rec["clock_in"].isoformat() if rec.get("clock_in") else None,
            "clock_out": rec["clock_out"].isoformat() if rec.get("clock_out") else None,
            "hours": rec.get("hours"),
            "scanned_by": rec.get("scanned_by"),
            "scanned_by_name": rec.get("scanned_by_name"),
            "note": rec.get("note", ""),
            "status": rec["status"],
            "submission_id": rec.get("submission_id"),
            "created_at": rec["created_at"].isoformat() if rec.get("created_at") else None,
        }


class TimesheetSubmissionModel:
    """
    A bundle of closed ClockRecords submitted by an employee for approval.

    status lifecycle:
      pending  → submitted, awaiting approval
      approved → approved, ready to push to ERPNext
      rejected → rejected, records returned to "closed" state
      pushed   → successfully pushed to ERPNext (erp_timesheet_id is set)
    """

    COLLECTION = "timesheet_submissions"

    @staticmethod
    def new(
        user_id: str,
        username: str,
        display_name: str,
        erp_employee_id: str,
        record_ids: list,
        total_hours: float,
    ) -> dict:
        now = datetime.now(timezone.utc)
        return {
            "user_id": user_id,
            "username": username,
            "display_name": display_name,
            "erp_employee_id": erp_employee_id,
            "record_ids": record_ids,
            "total_hours": total_hours,
            "status": "pending",
            "submitted_at": now,
            "reviewed_by": None,
            "reviewed_by_name": None,
            "reviewed_at": None,
            "review_note": "",
            "erp_timesheet_id": None,
            "pushed_at": None,
            "pushed_by": None,
        }

    @staticmethod
    def to_public(sub: dict) -> dict:
        return {
            "id": str(sub["_id"]),
            "user_id": sub["user_id"],
            "username": sub["username"],
            "display_name": sub["display_name"],
            "erp_employee_id": sub.get("erp_employee_id"),
            "record_ids": sub.get("record_ids", []),
            "total_hours": sub.get("total_hours", 0),
            "status": sub["status"],
            "submitted_at": sub["submitted_at"].isoformat() if sub.get("submitted_at") else None,
            "reviewed_by": sub.get("reviewed_by"),
            "reviewed_by_name": sub.get("reviewed_by_name"),
            "reviewed_at": sub["reviewed_at"].isoformat() if sub.get("reviewed_at") else None,
            "review_note": sub.get("review_note", ""),
            "erp_timesheet_id": sub.get("erp_timesheet_id"),
            "pushed_at": sub["pushed_at"].isoformat() if sub.get("pushed_at") else None,
            "pushed_by": sub.get("pushed_by"),
            "period_start": sub["period_start"].isoformat() if sub.get("period_start") else None,
            "period_end": sub["period_end"].isoformat() if sub.get("period_end") else None,
        }
