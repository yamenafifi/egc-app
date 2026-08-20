from datetime import datetime, timezone


class ClockRecordModel:
    """
    A single clock-in / clock-out pair for one employee on one project.

    Employee self-service via GPS, checked against the project's geofence
    (see egc_hr's Project.custom_egc_latitude/longitude/geofence_radius_m) -
    not supervisor-scan. geofence_status is recorded but does NOT block
    clock-in (a soft check): GPS accuracy on an active job site is
    unreliable, and a hard block risks losing legitimate attendance data.
    A supervisor reviewing the bundled TimesheetSubmission sees the flag
    and can reject if it looks wrong.

    status lifecycle:
      open    → clocked in, session in progress (clock_out is None)
      closed  → clocked out, available to bundle into a submission
      bundled → included in a TimesheetSubmission (submission_id is set)
    """

    COLLECTION = "clock_records"

    GEOFENCE_STATUSES = ("inside", "outside", "no_geofence")

    @staticmethod
    def new(
        user_id: str,
        username: str,
        display_name: str,
        erp_employee_id: str,
        project_id: str,
        project_name: str,
        clock_in_location: dict,
        geofence_status: str,
        distance_from_site_m: float | None,
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
            "clock_in_location": clock_in_location,  # {"lat", "lon", "accuracy_m"}
            "clock_out_location": None,
            "geofence_status": geofence_status,
            "clock_out_geofence_status": None,
            "distance_from_site_m": distance_from_site_m,
            "overtime_hours_requested": 0,
            "overtime_hours_approved": None,
            "note": note,
            "status": "open",
            "submission_id": None,
            # Assigned once, at push time, and persisted - never regenerated
            # on retry, or a retry after a network failure stops being
            # idempotent against egc_hr's import_record.
            "external_work_record_id": None,
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
            "clock_in_location": rec.get("clock_in_location"),
            "clock_out_location": rec.get("clock_out_location"),
            "geofence_status": rec.get("geofence_status"),
            "clock_out_geofence_status": rec.get("clock_out_geofence_status"),
            "distance_from_site_m": rec.get("distance_from_site_m"),
            "overtime_hours_requested": rec.get("overtime_hours_requested", 0),
            "overtime_hours_approved": rec.get("overtime_hours_approved"),
            "note": rec.get("note", ""),
            "status": rec["status"],
            "submission_id": rec.get("submission_id"),
            "created_at": rec["created_at"].isoformat() if rec.get("created_at") else None,
        }


class TimesheetSubmissionModel:
    """
    A bundle of closed ClockRecords submitted by an employee for approval.

    status lifecycle - two approval tiers, not one:
      pending             → submitted, awaiting a project supervisor's decision
      supervisor_approved → the project supervisor signed off (this does NOT
                             push to egc_hr by itself - it's a "verified,
                             ready for final review" gate). Records here are
                             what an operations manager (attendance.final_approve)
                             reviews and can batch-approve.
      approved            → an operations manager gave final approval, which
                             pushes to egc_hr as the same action (see
                             attendance.py's final_approve_submissions)
      rejected            → rejected by either tier, bundled records return to "closed"

    The supervisor's own review is recorded in reviewed_by/reviewed_at/
    review_note as before; the operations manager's final review is
    recorded separately in final_reviewed_by/final_reviewed_at/
    final_review_note so both decisions stay independently visible.

    push_status is a SEPARATE fact from status, set only once an operations
    manager gives final approval - the push can fail with
    requires_payroll_amendment/conflict/validation_error/an unreachable
    site, per docs/EGC_APP_INTEGRATION.md's own instruction to surface that
    to a human rather than retry automatically:
      None                  → not yet attempted (not yet finally approved)
      "pushed"               → landed cleanly (imported/already_imported/amended)
      "requires_amendment"   → landed, but as a requires_payroll_amendment case
      "conflict"              → egc_hr rejected as a conflicting resend
      "failed"                → validation_error, or egc_hr was unreachable
    """

    COLLECTION = "timesheet_submissions"

    @staticmethod
    def new(
        user_id: str,
        username: str,
        display_name: str,
        erp_employee_id: str,
        record_ids: list,
        project_ids: list,
        total_hours: float,
        period_start: datetime,
        period_end: datetime,
    ) -> dict:
        now = datetime.now(timezone.utc)
        return {
            "user_id": user_id,
            "username": username,
            "display_name": display_name,
            "erp_employee_id": erp_employee_id,
            "record_ids": record_ids,
            "project_ids": project_ids,
            "total_hours": total_hours,
            "period_start": period_start,
            "period_end": period_end,
            "status": "pending",
            "submitted_at": now,
            "reviewed_by": None,
            "reviewed_by_name": None,
            "reviewed_at": None,
            "review_note": "",
            "final_reviewed_by": None,
            "final_reviewed_by_name": None,
            "final_reviewed_at": None,
            "final_review_note": "",
            "push_status": None,
            "erp_timesheet_id": None,
            "pushed_at": None,
            "pushed_by": None,
            "external_work_record_id": None,
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
            "project_ids": sub.get("project_ids", []),
            "total_hours": sub.get("total_hours", 0),
            "status": sub["status"],
            "submitted_at": sub["submitted_at"].isoformat() if sub.get("submitted_at") else None,
            "reviewed_by": sub.get("reviewed_by"),
            "reviewed_by_name": sub.get("reviewed_by_name"),
            "reviewed_at": sub["reviewed_at"].isoformat() if sub.get("reviewed_at") else None,
            "review_note": sub.get("review_note", ""),
            "final_reviewed_by_name": sub.get("final_reviewed_by_name"),
            "final_reviewed_at": sub["final_reviewed_at"].isoformat() if sub.get("final_reviewed_at") else None,
            "final_review_note": sub.get("final_review_note", ""),
            "push_status": sub.get("push_status"),
            "erp_timesheet_id": sub.get("erp_timesheet_id"),
            "pushed_at": sub["pushed_at"].isoformat() if sub.get("pushed_at") else None,
            "pushed_by": sub.get("pushed_by"),
            "period_start": sub["period_start"].isoformat() if sub.get("period_start") else None,
            "period_end": sub["period_end"].isoformat() if sub.get("period_end") else None,
        }
