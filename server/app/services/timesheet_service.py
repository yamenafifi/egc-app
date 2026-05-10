"""
Timesheet Service
=================
Business logic for QR-based clock in/out, submissions, approvals, and ERP push.
"""

from datetime import datetime, timezone
from bson import ObjectId

from app.utils.database import get_db
from app.models.timesheet import ClockRecordModel, TimesheetSubmissionModel
from app.models.audit_log import AuditLogModel
from app.services.erp_service import erp_service, ERPNextError


class TimesheetError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


class TimesheetService:

    # ── QR / Clock helpers ────────────────────────────────────────────────────

    def get_user_qr_info(self, target_user_id: str) -> dict:
        """Return the data needed to build a QR code for an employee."""
        db = get_db()
        user = db["users"].find_one({"_id": ObjectId(target_user_id)})
        if not user:
            raise TimesheetError("User not found.", 404)
        return {
            "user_id": str(user["_id"]),
            "username": user["username"],
            "display_name": user["display_name"],
            "erp_employee_id": user.get("erp_employee_id"),
        }

    def get_clock_status(self, target_user_id: str) -> dict:
        """Check if an employee currently has an open clock-in session."""
        db = get_db()
        open_record = db[ClockRecordModel.COLLECTION].find_one({
            "user_id": target_user_id,
            "status": "open",
        })
        return {
            "is_clocked_in": open_record is not None,
            "open_record": ClockRecordModel.to_public(open_record) if open_record else None,
        }

    def clock_in(self, target_user_id: str, project_id: str, scanner: dict, note: str = "") -> dict:
        """
        Clock an employee in to a project.
        scanner = the current_user dict from g (the supervisor doing the scan).
        """
        db = get_db()

        # Load the target employee
        target = db["users"].find_one({"_id": ObjectId(target_user_id)})
        if not target:
            raise TimesheetError("Employee not found.", 404)
        if not target.get("is_active"):
            raise TimesheetError("Employee account is inactive.", 403)

        # Block double clock-in
        existing_open = db[ClockRecordModel.COLLECTION].find_one({
            "user_id": target_user_id,
            "status": "open",
        })
        if existing_open:
            raise TimesheetError(
                f"This employee is already clocked in to project '{existing_open['project_name']}'. "
                "Clock them out first.",
                409,
            )

        # Validate project from ERP
        try:
            project = erp_service.get_project(project_id)
        except ERPNextError as e:
            raise TimesheetError(f"Could not verify project: {str(e)}", 502)
        if not project:
            raise TimesheetError("Project not found in ERPNext.", 404)
        project_name = project.get("project_name") or project_id

        record = ClockRecordModel.new(
            user_id=target_user_id,
            username=target["username"],
            display_name=target["display_name"],
            erp_employee_id=target.get("erp_employee_id"),
            project_id=project_id,
            project_name=project_name,
            scanned_by=str(scanner["_id"]),
            scanned_by_name=scanner["display_name"],
            note=note,
        )
        result = db[ClockRecordModel.COLLECTION].insert_one(record)
        record["_id"] = result.inserted_id

        self._audit("timesheet.clock_in", user=scanner,
                    target_id=str(result.inserted_id),
                    detail={"employee": target["display_name"], "project": project_name})

        return ClockRecordModel.to_public(record)

    def clock_out(self, target_user_id: str, scanner: dict, note: str = "") -> dict:
        """Clock out an employee from their active session."""
        db = get_db()

        open_record = db[ClockRecordModel.COLLECTION].find_one({
            "user_id": target_user_id,
            "status": "open",
        })
        if not open_record:
            raise TimesheetError("This employee is not currently clocked in.", 404)

        now = datetime.now(timezone.utc)
        clock_in_dt = open_record["clock_in"]
        if clock_in_dt.tzinfo is None:
            clock_in_dt = clock_in_dt.replace(tzinfo=timezone.utc)

        duration_seconds = (now - clock_in_dt).total_seconds()
        hours = round(duration_seconds / 3600, 2)

        db[ClockRecordModel.COLLECTION].update_one(
            {"_id": open_record["_id"]},
            {"$set": {
                "clock_out": now,
                "hours": hours,
                "status": "closed",
                "note": note or open_record.get("note", ""),
            }},
        )
        open_record["clock_out"] = now
        open_record["hours"] = hours
        open_record["status"] = "closed"

        self._audit("timesheet.clock_out", user=scanner,
                    target_id=str(open_record["_id"]),
                    detail={
                        "employee": open_record["display_name"],
                        "project": open_record["project_name"],
                        "hours": hours,
                    })

        return ClockRecordModel.to_public(open_record)

    # ── Entries (clock records) ───────────────────────────────────────────────

    def list_entries(self, requesting_user: dict, filters: dict) -> dict:
        """
        List clock records.
        - Regular users: only own records
        - Users with timesheet.view_all: can filter by user_id
        """
        db = get_db()
        is_sysadmin = requesting_user.get("is_sysadmin", False)
        has_view_all = is_sysadmin or "timesheet.view_all" in requesting_user.get("permissions", [])

        query = {}
        if not has_view_all:
            query["user_id"] = str(requesting_user["_id"])
        elif filters.get("user_id"):
            query["user_id"] = filters["user_id"]

        if filters.get("status"):
            query["status"] = filters["status"]
        if filters.get("project_id"):
            query["project_id"] = filters["project_id"]
        if filters.get("date_from"):
            query.setdefault("clock_in", {})["$gte"] = datetime.fromisoformat(filters["date_from"])
        if filters.get("date_to"):
            query.setdefault("clock_in", {})["$lte"] = datetime.fromisoformat(filters["date_to"])

        page = int(filters.get("page", 1))
        page_length = int(filters.get("page_length", 50))
        skip = (page - 1) * page_length

        cursor = db[ClockRecordModel.COLLECTION].find(query).sort("clock_in", -1).skip(skip).limit(page_length)
        records = [ClockRecordModel.to_public(r) for r in cursor]
        total = db[ClockRecordModel.COLLECTION].count_documents(query)

        return {"entries": records, "total": total, "page": page, "page_length": page_length}

    def delete_entry(self, entry_id: str, requesting_user: dict) -> None:
        """Delete a clock record — only if it's closed (not bundled)."""
        db = get_db()
        record = db[ClockRecordModel.COLLECTION].find_one({"_id": ObjectId(entry_id)})
        if not record:
            raise TimesheetError("Entry not found.", 404)

        is_sysadmin = requesting_user.get("is_sysadmin", False)
        is_own = record["user_id"] == str(requesting_user["_id"])
        has_delete_all = "timesheet.delete_all" in requesting_user.get("permissions", [])

        if not is_sysadmin and not has_delete_all and not is_own:
            raise TimesheetError("Access denied.", 403)
        if record["status"] == "open":
            raise TimesheetError("Cannot delete an open clock-in session. Clock out first.", 400)
        if record["status"] == "bundled":
            raise TimesheetError("Cannot delete a record that is part of a submission.", 400)

        db[ClockRecordModel.COLLECTION].delete_one({"_id": ObjectId(entry_id)})

    # ── Submissions ───────────────────────────────────────────────────────────

    def create_submission(self, entry_ids: list, requesting_user: dict) -> dict:
        """Bundle closed clock records into a submission for approval."""
        db = get_db()

        if not entry_ids:
            raise TimesheetError("Select at least one entry.", 400)

        object_ids = [ObjectId(eid) for eid in entry_ids]
        records = list(db[ClockRecordModel.COLLECTION].find({"_id": {"$in": object_ids}}))

        if len(records) != len(entry_ids):
            raise TimesheetError("One or more entries not found.", 404)

        user_id = str(requesting_user["_id"])
        is_sysadmin = requesting_user.get("is_sysadmin", False)

        for rec in records:
            if not is_sysadmin and rec["user_id"] != user_id:
                raise TimesheetError("Cannot submit entries belonging to another employee.", 403)
            if rec["status"] != "closed":
                raise TimesheetError(
                    f"Entry from {rec.get('clock_in', '')} is not available (status: {rec['status']}).", 400
                )

        total_hours = round(sum(r.get("hours") or 0 for r in records), 2)

        # Derive period start/end from records
        clock_in_times = [r["clock_in"] for r in records if r.get("clock_in")]
        clock_out_times = [r["clock_out"] for r in records if r.get("clock_out")]
        period_start = min(clock_in_times) if clock_in_times else datetime.now(timezone.utc)
        period_end = max(clock_out_times) if clock_out_times else datetime.now(timezone.utc)

        submission = TimesheetSubmissionModel.new(
            user_id=user_id,
            username=requesting_user["username"],
            display_name=requesting_user["display_name"],
            erp_employee_id=requesting_user.get("erp_employee_id"),
            record_ids=[str(eid) for eid in object_ids],
            total_hours=total_hours,
        )
        submission["period_start"] = period_start
        submission["period_end"] = period_end

        result = db[TimesheetSubmissionModel.COLLECTION].insert_one(submission)
        submission_id = str(result.inserted_id)

        # Mark records as bundled
        db[ClockRecordModel.COLLECTION].update_many(
            {"_id": {"$in": object_ids}},
            {"$set": {"status": "bundled", "submission_id": submission_id}},
        )

        submission["_id"] = result.inserted_id
        self._audit("timesheet.submitted", user=requesting_user,
                    target_id=submission_id,
                    detail={"total_hours": total_hours, "entries": len(records)})

        return TimesheetSubmissionModel.to_public(submission)

    def list_submissions(self, requesting_user: dict, filters: dict) -> dict:
        db = get_db()
        is_sysadmin = requesting_user.get("is_sysadmin", False)
        has_view_all = is_sysadmin or "timesheet.view_all" in requesting_user.get("permissions", [])

        query = {}
        if not has_view_all:
            query["user_id"] = str(requesting_user["_id"])
        elif filters.get("user_id"):
            query["user_id"] = filters["user_id"]

        if filters.get("status"):
            query["status"] = filters["status"]

        page = int(filters.get("page", 1))
        page_length = int(filters.get("page_length", 25))
        skip = (page - 1) * page_length

        cursor = db[TimesheetSubmissionModel.COLLECTION].find(query).sort("submitted_at", -1).skip(skip).limit(page_length)
        raw_subs = list(cursor)
        total = db[TimesheetSubmissionModel.COLLECTION].count_documents(query)

        # Hydrate employee_count for each submission
        submissions = []
        for s in raw_subs:
            pub = TimesheetSubmissionModel.to_public(s)
            record_ids = [ObjectId(rid) for rid in s.get("record_ids", [])]
            if record_ids:
                pipeline = [
                    {"$match": {"_id": {"$in": record_ids}}},
                    {"$group": {"_id": "$user_id"}},
                    {"$count": "count"},
                ]
                result = list(db[ClockRecordModel.COLLECTION].aggregate(pipeline))
                pub["employee_count"] = result[0]["count"] if result else 0
            else:
                pub["employee_count"] = 0
            submissions.append(pub)

        return {"submissions": submissions, "total": total, "page": page, "page_length": page_length}

    def get_submission(self, submission_id: str, requesting_user: dict) -> dict:
        db = get_db()
        sub = db[TimesheetSubmissionModel.COLLECTION].find_one({"_id": ObjectId(submission_id)})
        if not sub:
            raise TimesheetError("Submission not found.", 404)

        is_sysadmin = requesting_user.get("is_sysadmin", False)
        has_view_all = is_sysadmin or "timesheet.view_all" in requesting_user.get("permissions", [])
        if not has_view_all and sub["user_id"] != str(requesting_user["_id"]):
            raise TimesheetError("Access denied.", 403)

        # Also hydrate the individual records
        record_ids = [ObjectId(rid) for rid in sub.get("record_ids", [])]
        records = list(db[ClockRecordModel.COLLECTION].find({"_id": {"$in": record_ids}}))
        records_public = [ClockRecordModel.to_public(r) for r in records]

        result = TimesheetSubmissionModel.to_public(sub)
        result["records"] = records_public
        return result

    def approve_submission(self, submission_id: str, reviewer: dict) -> dict:
        db = get_db()
        sub = db[TimesheetSubmissionModel.COLLECTION].find_one({"_id": ObjectId(submission_id)})
        if not sub:
            raise TimesheetError("Submission not found.", 404)
        if sub["status"] != "pending":
            raise TimesheetError(f"Submission is already '{sub['status']}'.", 400)

        now = datetime.now(timezone.utc)
        db[TimesheetSubmissionModel.COLLECTION].update_one(
            {"_id": ObjectId(submission_id)},
            {"$set": {
                "status": "approved",
                "reviewed_by": str(reviewer["_id"]),
                "reviewed_by_name": reviewer["display_name"],
                "reviewed_at": now,
            }},
        )
        sub["status"] = "approved"
        self._audit("timesheet.approved", user=reviewer, target_id=submission_id,
                    detail={"employee": sub["display_name"], "hours": sub["total_hours"]})
        return TimesheetSubmissionModel.to_public(sub)

    def reject_submission(self, submission_id: str, reviewer: dict, note: str) -> dict:
        db = get_db()
        sub = db[TimesheetSubmissionModel.COLLECTION].find_one({"_id": ObjectId(submission_id)})
        if not sub:
            raise TimesheetError("Submission not found.", 404)
        if sub["status"] not in ("pending",):
            raise TimesheetError(f"Submission is '{sub['status']}' and cannot be rejected.", 400)

        now = datetime.now(timezone.utc)
        db[TimesheetSubmissionModel.COLLECTION].update_one(
            {"_id": ObjectId(submission_id)},
            {"$set": {
                "status": "rejected",
                "reviewed_by": str(reviewer["_id"]),
                "reviewed_by_name": reviewer["display_name"],
                "reviewed_at": now,
                "review_note": note,
            }},
        )

        # Return records to "closed" so employee can re-submit
        record_ids = [ObjectId(rid) for rid in sub.get("record_ids", [])]
        db[ClockRecordModel.COLLECTION].update_many(
            {"_id": {"$in": record_ids}},
            {"$set": {"status": "closed", "submission_id": None}},
        )

        sub["status"] = "rejected"
        self._audit("timesheet.rejected", user=reviewer, target_id=submission_id,
                    detail={"employee": sub["display_name"], "note": note})
        return TimesheetSubmissionModel.to_public(sub)

    def delete_submission(self, submission_id: str, requesting_user: dict) -> None:
        """
        Delete a timesheet bundle. Only allowed if status is pending, approved, or rejected.
        Records are returned to 'closed' so they can be re-bundled.
        """
        db = get_db()
        sub = db[TimesheetSubmissionModel.COLLECTION].find_one({"_id": ObjectId(submission_id)})
        if not sub:
            raise TimesheetError("Submission not found.", 404)
        if sub["status"] == "pushed":
            raise TimesheetError(
                "Cannot delete a submission that has already been pushed to ERPNext.", 400
            )

        is_sysadmin = requesting_user.get("is_sysadmin", False)
        has_approve = "timesheet.approve" in requesting_user.get("permissions", [])
        if not is_sysadmin and not has_approve:
            raise TimesheetError("Access denied.", 403)

        # Return all bundled records back to 'closed'
        record_ids = [ObjectId(rid) for rid in sub.get("record_ids", [])]
        if record_ids:
            db[ClockRecordModel.COLLECTION].update_many(
                {"_id": {"$in": record_ids}},
                {"$set": {"status": "closed", "submission_id": None}},
            )

        db[TimesheetSubmissionModel.COLLECTION].delete_one({"_id": ObjectId(submission_id)})
        self._audit(
            "timesheet.submission_deleted",
            user=requesting_user,
            target_id=submission_id,
            detail={"display_name": sub.get("display_name"), "total_hours": sub.get("total_hours")},
        )

    def manual_entry(
        self,
        employee_id: str,
        project_id: str,
        clock_in: "datetime",
        clock_out: "datetime",
        supervisor: dict,
        note: str = "",
    ) -> dict:
        """
        Supervisor manually records a completed clock-in/out on behalf of an employee.
        Used when QR mode is disabled or for corrections.
        """
        db = get_db()

        target = db["users"].find_one({"_id": ObjectId(employee_id)})
        if not target:
            raise TimesheetError("Employee not found.", 404)
        if not target.get("is_active"):
            raise TimesheetError("Employee account is inactive.", 403)

        if clock_out <= clock_in:
            raise TimesheetError("clock_out must be after clock_in.", 400)

        try:
            project = erp_service.get_project(project_id)
        except ERPNextError as e:
            raise TimesheetError(f"Could not verify project: {str(e)}", 502)
        if not project:
            raise TimesheetError("Project not found in ERPNext.", 404)

        hours = round((clock_out - clock_in).total_seconds() / 3600, 2)
        project_name = project.get("project_name") or project_id

        record = ClockRecordModel.new(
            user_id=str(target["_id"]),
            username=target["username"],
            display_name=target["display_name"],
            erp_employee_id=target.get("erp_employee_id"),
            project_id=project_id,
            project_name=project_name,
            scanned_by=str(supervisor["_id"]),
            scanned_by_name=supervisor["display_name"],
            note=note,
        )
        record["clock_in"] = clock_in
        record["clock_out"] = clock_out
        record["hours"] = hours
        record["status"] = "closed"

        result = db[ClockRecordModel.COLLECTION].insert_one(record)
        record["_id"] = result.inserted_id

        self._audit(
            "timesheet.manual_entry",
            user=supervisor,
            target_id=str(result.inserted_id),
            detail={"employee": target["display_name"], "project": project_name, "hours": hours},
        )
        return ClockRecordModel.to_public(record)


    def push_to_erp(self, submission_id: str, pusher: dict) -> dict:
        db = get_db()
        sub = db[TimesheetSubmissionModel.COLLECTION].find_one({"_id": ObjectId(submission_id)})
        if not sub:
            raise TimesheetError("Submission not found.", 404)
        if sub["status"] != "approved":
            raise TimesheetError("Only approved submissions can be pushed to ERPNext.", 400)
        if sub.get("erp_timesheet_id"):
            raise TimesheetError("This submission has already been pushed to ERPNext.", 400)

        employee_erp_id = sub.get("erp_employee_id")
        if not employee_erp_id:
            raise TimesheetError("Employee has no ERPNext ID. Cannot push timesheet.", 400)

        # Load raw records (need datetime objects, not strings)
        record_ids = [ObjectId(rid) for rid in sub.get("record_ids", [])]
        records = list(db[ClockRecordModel.COLLECTION].find({"_id": {"$in": record_ids}}))

        # Build entries list with raw datetime objects
        entries = []
        for r in records:
            if r.get("clock_in") and r.get("clock_out"):
                clock_in = r["clock_in"]
                clock_out = r["clock_out"]
                if clock_in.tzinfo is None:
                    clock_in = clock_in.replace(tzinfo=timezone.utc)
                if clock_out.tzinfo is None:
                    clock_out = clock_out.replace(tzinfo=timezone.utc)
                duration = (clock_out - clock_in).total_seconds() / 3600
                entries.append({
                    "clock_in": clock_in,
                    "clock_out": clock_out,
                    "project_id": r["project_id"],
                    "project_name": r["project_name"],
                    "duration_hours": round(duration, 2),
                })

        try:
            erp_name = erp_service.push_timesheet(sub, entries, employee_erp_id)
        except ERPNextError as e:
            raise TimesheetError(f"ERPNext push failed: {str(e)}", 502)

        now = datetime.now(timezone.utc)
        db[TimesheetSubmissionModel.COLLECTION].update_one(
            {"_id": ObjectId(submission_id)},
            {"$set": {
                "status": "pushed",
                "erp_timesheet_id": erp_name,
                "pushed_at": now,
                "pushed_by": str(pusher["_id"]),
            }},
        )
        sub["status"] = "pushed"
        sub["erp_timesheet_id"] = erp_name

        self._audit("timesheet.pushed_to_erp", user=pusher, target_id=submission_id,
                    detail={"erp_timesheet_id": erp_name, "employee": sub["display_name"]})

        return TimesheetSubmissionModel.to_public(sub)

    # ── Internal helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _audit(action, user=None, target_id=None, detail=None, ip=None):
        db = get_db()
        log = AuditLogModel.new(
            action=action,
            user_id=str(user["_id"]) if user else None,
            username=user.get("username", "system") if user else "system",
            target_id=target_id,
            detail=detail or {},
            ip=ip,
        )
        db[AuditLogModel.COLLECTION].insert_one(log)


timesheet_service = TimesheetService()
