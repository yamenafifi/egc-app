"""
Attendance Routes  —  /api/attendance
=======================================
GET  /sites                              — active project sites (geofence data)
GET  /my-open-record                     — the caller's current open clock record, or null
POST /clock-in                           — GPS self clock-in, soft geofence check
POST /clock-out                          — closes the caller's open record, auto-computes overtime
GET  /my-records                         — the caller's own closed/bundled records + submissions
POST /submissions                        — bundle closed records into a submission
GET  /team-submissions                    — pending submissions the caller supervises
POST /submissions/<id>/approve           — supervisor sign-off (does NOT push to egc_hr)
POST /submissions/<id>/reject            — supervisor reject, records return to "closed"
GET  /submissions/pending-final-approval — supervisor-approved submissions awaiting an
                                            operations manager's final approval
POST /submissions/final-approve          — bulk final approval + push to egc_hr
POST /submissions/final-reject           — bulk final rejection, records return to "closed"

Two approval tiers, not one: a project supervisor's approve/reject only
verifies the submission is legitimate - it does not touch egc_hr. Only an
operations manager's final approval (attendance.final_approve) actually
pushes to egc_hr's payroll pipeline, and that manager reviews everything
supervisor-approved across every employee/project in one queue, not scoped
to their own team.
"""

from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, request, jsonify, g

from app.utils.database import get_db
from app.utils.geo import geofence_status
from app.utils.time_utils import to_egc_hr_datetime_string, to_egc_hr_date_string
from app.models.timesheet import ClockRecordModel, TimesheetSubmissionModel
from app.middleware.auth_middleware import jwt_required_custom, require_permission
from app.services.project_site_cache import get_site, is_supervisor_of, ProjectSiteCacheError
from app.services.egc_hr_service import egc_hr_service, EGCHRError
from app.services.notification_service import notify, notify_by_erp_employee_id, notify_all_with_permission

bp = Blueprint("attendance", __name__, url_prefix="/api/attendance")


@bp.before_request
def _require_timesheet_module_enabled():
    from app.services.settings_service import is_module_enabled
    if not is_module_enabled("timesheet"):
        return jsonify({"error": "The Timesheet module is currently disabled."}), 403

ACTIVITY_TYPE = "Execution"  # must exist as an ERPNext Activity Type - see import_record's contract

# A standard day is 9 hours clock-in to clock-out (8 worked + 1 break).
# Anything past that, at clock-out, becomes overtime automatically - the
# employee never enters a number themselves.
# Configurable via Settings > Timesheet (see settings_service.py's
# TIMESHEET_SETTINGS_DEFAULTS) - these were hardcoded constants; a
# standard workday length is a company policy decision, not a code
# constant.


@bp.route("/sites", methods=["GET"])
@jwt_required_custom
def sites():
    try:
        from app.services.project_site_cache import get_sites
        return jsonify({"sites": get_sites()}), 200
    except ProjectSiteCacheError as e:
        return jsonify({"error": str(e)}), 503


@bp.route("/my-open-record", methods=["GET"])
@jwt_required_custom
def my_open_record():
    db = get_db()
    user_id = str(g.current_user["_id"])
    rec = db[ClockRecordModel.COLLECTION].find_one({"user_id": user_id, "status": "open"})
    return jsonify({"record": ClockRecordModel.to_public(rec) if rec else None}), 200


@bp.route("/clock-in", methods=["POST"])
@jwt_required_custom
def clock_in():
    db = get_db()
    user = g.current_user
    user_id = str(user["_id"])
    body = request.get_json(silent=True) or {}

    project_id = body.get("project_id")
    lat, lon = body.get("lat"), body.get("lon")
    accuracy_m = body.get("accuracy_m")
    if not project_id or lat is None or lon is None:
        return jsonify({"error": "project_id, lat, and lon are required."}), 400
    if not user.get("erp_employee_id"):
        return jsonify({"error": "Your account is not linked to an ERP employee record."}), 400

    if db[ClockRecordModel.COLLECTION].find_one({"user_id": user_id, "status": "open"}):
        return jsonify({"error": "You already have an open clock-in. Clock out first."}), 409

    site = get_site(project_id)
    if not site:
        return jsonify({"error": "Unknown or inactive project site."}), 404

    status, distance_m = geofence_status(lat, lon, site)
    # Soft check only - GPS accuracy on a job site is unreliable, and a hard
    # block risks losing legitimate attendance data. The reviewing
    # supervisor sees geofence_status and can reject if it looks wrong.

    doc = ClockRecordModel.new(
        user_id=user_id,
        username=user["username"],
        display_name=user["display_name"],
        erp_employee_id=user["erp_employee_id"],
        project_id=project_id,
        project_name=site.get("project_name", project_id),
        clock_in_location={"lat": lat, "lon": lon, "accuracy_m": accuracy_m},
        geofence_status=status,
        distance_from_site_m=distance_m,
        note=body.get("note", ""),
    )
    result = db[ClockRecordModel.COLLECTION].insert_one(doc)
    doc["_id"] = result.inserted_id
    return jsonify({"record": ClockRecordModel.to_public(doc)}), 201


@bp.route("/clock-out", methods=["POST"])
@jwt_required_custom
def clock_out():
    db = get_db()
    user_id = str(g.current_user["_id"])
    body = request.get_json(silent=True) or {}

    record_id = body.get("record_id")
    lat, lon = body.get("lat"), body.get("lon")
    if not record_id or lat is None or lon is None:
        return jsonify({"error": "record_id, lat, and lon are required."}), 400

    rec = db[ClockRecordModel.COLLECTION].find_one({"_id": ObjectId(record_id), "user_id": user_id})
    if not rec:
        return jsonify({"error": "Clock record not found."}), 404
    if rec["status"] != "open":
        return jsonify({"error": f"This record is already '{rec['status']}'."}), 409

    site = get_site(rec["project_id"])
    status, distance_m = (None, None)
    if site:
        status, distance_m = geofence_status(lat, lon, site)

    from app.services.settings_service import get_timesheet_settings
    ts_settings = get_timesheet_settings()

    now = datetime.now(timezone.utc)
    hours = round((now - rec["clock_in"]).total_seconds() / 3600, 2)
    overtime_requested = max(0, round(
        hours - ts_settings["timesheet_break_hours"] - ts_settings["timesheet_standard_workday_hours"], 2
    ))

    db[ClockRecordModel.COLLECTION].update_one(
        {"_id": rec["_id"]},
        {"$set": {
            "clock_out": now,
            "clock_out_location": {"lat": lat, "lon": lon, "accuracy_m": body.get("accuracy_m")},
            "clock_out_geofence_status": status,
            "hours": hours,
            "overtime_hours_requested": overtime_requested,
            "status": "closed",
        }},
    )
    rec = db[ClockRecordModel.COLLECTION].find_one({"_id": rec["_id"]})
    return jsonify({"record": ClockRecordModel.to_public(rec)}), 200


@bp.route("/my-records", methods=["GET"])
@jwt_required_custom
def my_records():
    db = get_db()
    user_id = str(g.current_user["_id"])
    records = db[ClockRecordModel.COLLECTION].find(
        {"user_id": user_id, "status": {"$in": ["closed", "bundled"]}}
    ).sort("clock_in", -1).limit(100)
    submissions = db[TimesheetSubmissionModel.COLLECTION].find(
        {"user_id": user_id}
    ).sort("submitted_at", -1).limit(50)
    return jsonify({
        "records": [ClockRecordModel.to_public(r) for r in records],
        "submissions": [TimesheetSubmissionModel.to_public(s) for s in submissions],
    }), 200


@bp.route("/submissions", methods=["POST"])
@jwt_required_custom
def create_submission():
    db = get_db()
    user = g.current_user
    user_id = str(user["_id"])
    body = request.get_json(silent=True) or {}

    record_ids = body.get("record_ids") or []
    if not record_ids:
        return jsonify({"error": "record_ids is required and must be non-empty."}), 400

    object_ids = [ObjectId(r) for r in record_ids]
    records = list(db[ClockRecordModel.COLLECTION].find({
        "_id": {"$in": object_ids}, "user_id": user_id, "status": "closed",
    }))
    if len(records) != len(record_ids):
        return jsonify({"error": "One or more records were not found, not yours, or not closed."}), 400

    total_hours = sum(r.get("hours") or 0 for r in records)
    total_overtime_hours = sum(r.get("overtime_hours_requested") or 0 for r in records)
    project_ids = sorted({r["project_id"] for r in records})
    period_start = min(r["clock_in"] for r in records)
    period_end = max(r["clock_out"] for r in records)

    doc = TimesheetSubmissionModel.new(
        user_id=user_id, username=user["username"], display_name=user["display_name"],
        erp_employee_id=user.get("erp_employee_id"),
        record_ids=record_ids, project_ids=project_ids,
        total_hours=round(total_hours, 2), period_start=period_start, period_end=period_end,
        total_overtime_hours=round(total_overtime_hours, 2),
    )
    result = db[TimesheetSubmissionModel.COLLECTION].insert_one(doc)
    submission_id = str(result.inserted_id)

    db[ClockRecordModel.COLLECTION].update_many(
        {"_id": {"$in": object_ids}}, {"$set": {"status": "bundled", "submission_id": submission_id}}
    )

    for project_id in project_ids:
        site = get_site(project_id)
        for supervisor_erp_id in (site.get("supervisors") if site else []) or []:
            notify_by_erp_employee_id(
                supervisor_erp_id, "timesheet_submitted",
                "New attendance submission",
                f"{user['display_name']} submitted {round(total_hours, 2)}h for review.",
                link=f"/attendance?tab=team&submission={submission_id}",
                related_id=submission_id,
            )

    doc["_id"] = result.inserted_id
    return jsonify({"submission": TimesheetSubmissionModel.to_public(doc)}), 201


def _caller_supervises_all_projects(project_ids: list) -> bool:
    erp_employee_id = g.current_user.get("erp_employee_id")
    if g.current_user.get("is_sysadmin"):
        return True
    if not erp_employee_id:
        return False
    return all(is_supervisor_of(erp_employee_id, pid) for pid in project_ids)


@bp.route("/team-submissions", methods=["GET"])
@jwt_required_custom
def team_submissions():
    db = get_db()
    user = g.current_user
    pending = list(db[TimesheetSubmissionModel.COLLECTION].find({"status": "pending"}).sort("submitted_at", -1))

    if user.get("is_sysadmin"):
        visible = pending
    else:
        erp_employee_id = user.get("erp_employee_id")
        visible = [
            s for s in pending
            if erp_employee_id and any(is_supervisor_of(erp_employee_id, pid) for pid in s.get("project_ids", []))
        ]

    return jsonify({"submissions": [TimesheetSubmissionModel.to_public(s) for s in visible]}), 200


@bp.route("/submissions/<submission_id>", methods=["GET"])
@jwt_required_custom
def get_submission(submission_id):
    """Expanded view of one submission incl. its underlying clock records -
    the owner sees their own; a supervisor or sysadmin reviewing it needs
    per-record geofence_status/hours/note, not just the submission's
    aggregate totals, to actually judge it (see ClockRecordModel's own
    docstring: "the reviewing supervisor sees the flag and can reject if
    it looks wrong" - that requires the records, not just the total)."""
    db = get_db()
    user = g.current_user
    submission = db[TimesheetSubmissionModel.COLLECTION].find_one({"_id": ObjectId(submission_id)})
    if not submission:
        return jsonify({"error": "Submission not found."}), 404

    is_owner = submission["user_id"] == str(user["_id"])
    is_final_approver = "attendance.final_approve" in user.get("permissions", []) or user.get("is_sysadmin")
    if not is_owner and not is_final_approver and not _caller_supervises_all_projects(submission.get("project_ids", [])):
        return jsonify({"error": "You are not the owner, a supervisor, or a final approver of this submission."}), 403

    records = db[ClockRecordModel.COLLECTION].find(
        {"_id": {"$in": [ObjectId(r) for r in submission.get("record_ids", [])]}}
    ).sort("clock_in", 1)

    return jsonify({
        "submission": TimesheetSubmissionModel.to_public(submission),
        "records": [ClockRecordModel.to_public(r) for r in records],
    }), 200


@bp.route("/submissions/<submission_id>/approve", methods=["POST"])
@jwt_required_custom
def approve_submission(submission_id):
    """The project supervisor's sign-off. Does NOT push to egc_hr - it only
    verifies the submission is legitimate and moves it into the operations
    manager's final-approval queue. overtime_hours_approved is finalized
    here (from the auto-computed overtime_hours_requested, or the
    supervisor's override) since this is where a human with per-record
    detail last touches each record before it's pushed."""
    db = get_db()
    user = g.current_user
    body = request.get_json(silent=True) or {}
    overtime_overrides = {r["record_id"]: r["overtime_hours_approved"] for r in body.get("overtime_overrides", [])}

    submission = db[TimesheetSubmissionModel.COLLECTION].find_one({"_id": ObjectId(submission_id)})
    if not submission:
        return jsonify({"error": "Submission not found."}), 404
    if submission["status"] != "pending":
        return jsonify({"error": f"This submission is already '{submission['status']}'."}), 409

    if not _caller_supervises_all_projects(submission.get("project_ids", [])):
        return jsonify({"error": "You are not a supervisor for one or more projects on this submission."}), 403

    records = list(db[ClockRecordModel.COLLECTION].find(
        {"_id": {"$in": [ObjectId(r) for r in submission["record_ids"]]}}
    ))
    for rec in records:
        overtime_approved = overtime_overrides.get(str(rec["_id"]), rec.get("overtime_hours_requested") or 0)
        db[ClockRecordModel.COLLECTION].update_one(
            {"_id": rec["_id"]}, {"$set": {"overtime_hours_approved": overtime_approved}}
        )

    now = datetime.now(timezone.utc)
    db[TimesheetSubmissionModel.COLLECTION].update_one(
        {"_id": submission["_id"]},
        {"$set": {
            "status": "supervisor_approved",
            "reviewed_by": str(user["_id"]), "reviewed_by_name": user["display_name"],
            "reviewed_at": now, "review_note": body.get("review_note", ""),
        }},
    )

    notify(
        submission["user_id"], "timesheet_supervisor_approved", "Attendance submission approved by supervisor",
        f"{user['display_name']} approved your {submission.get('total_hours', 0)}h submission - pending final review.",
        link="/attendance?tab=mine",
        related_id=submission_id,
    )
    notify_all_with_permission(
        "attendance.final_approve", "timesheet_ready_for_final_approval", "Submission ready for final approval",
        f"{submission['display_name']}'s {submission.get('total_hours', 0)}h submission was approved by "
        f"{user['display_name']} and is ready for final review.",
        link="/attendance/final-approval",
        related_id=submission_id,
    )

    updated = db[TimesheetSubmissionModel.COLLECTION].find_one({"_id": submission["_id"]})
    return jsonify({"submission": TimesheetSubmissionModel.to_public(updated)}), 200


@bp.route("/submissions/<submission_id>/reject", methods=["POST"])
@jwt_required_custom
def reject_submission(submission_id):
    db = get_db()
    user = g.current_user
    body = request.get_json(silent=True) or {}
    review_note = body.get("review_note")
    if not review_note:
        return jsonify({"error": "review_note is required when rejecting."}), 400

    submission = db[TimesheetSubmissionModel.COLLECTION].find_one({"_id": ObjectId(submission_id)})
    if not submission:
        return jsonify({"error": "Submission not found."}), 404
    if submission["status"] != "pending":
        return jsonify({"error": f"This submission is already '{submission['status']}'."}), 409

    if not _caller_supervises_all_projects(submission.get("project_ids", [])):
        return jsonify({"error": "You are not a supervisor for one or more projects on this submission."}), 403

    db[TimesheetSubmissionModel.COLLECTION].update_one(
        {"_id": submission["_id"]},
        {"$set": {
            "status": "rejected",
            "reviewed_by": str(user["_id"]), "reviewed_by_name": user["display_name"],
            "reviewed_at": datetime.now(timezone.utc), "review_note": review_note,
        }},
    )
    db[ClockRecordModel.COLLECTION].update_many(
        {"_id": {"$in": [ObjectId(r) for r in submission["record_ids"]]}},
        {"$set": {"status": "closed", "submission_id": None}},
    )

    notify(
        submission["user_id"], "timesheet_rejected", "Attendance submission rejected",
        f"{user['display_name']} rejected your submission: {review_note}",
        link="/attendance?tab=mine",
        related_id=submission_id,
    )

    updated = db[TimesheetSubmissionModel.COLLECTION].find_one({"_id": submission["_id"]})
    return jsonify({"submission": TimesheetSubmissionModel.to_public(updated)}), 200


def _push_submission_to_egc_hr(db, submission: dict, actioning_user: dict) -> tuple[str, str | None]:
    """Builds one import_record/import_batch payload per clock record and
    pushes it to egc_hr. Reads overtime_hours_approved as already finalized
    by the supervisor's own approval step - final approval doesn't
    re-negotiate hours, it decides whether the submission is ready to
    actually land in payroll."""
    records = list(db[ClockRecordModel.COLLECTION].find(
        {"_id": {"$in": [ObjectId(r) for r in submission["record_ids"]]}}
    ))

    payloads = []
    for rec in records:
        external_work_record_id = rec.get("external_work_record_id") or f"EGCAPP-WR-{rec['_id']}"
        payload = {
            "external_work_record_id": external_work_record_id,
            "revision": 1,
            "employee_reference": rec["erp_employee_id"],
            "work_date": to_egc_hr_date_string(rec["clock_in"]),
            "payroll_status": "P",
            "approved_overtime_hours": rec.get("overtime_hours_approved") or 0,
            "clock_in": to_egc_hr_datetime_string(rec["clock_in"]),
            "clock_out": to_egc_hr_datetime_string(rec["clock_out"]) if rec.get("clock_out") else None,
            "clock_in_location": rec.get("clock_in_location"),
            "clock_out_location": rec.get("clock_out_location"),
            "accounting_project": rec["project_id"],
            "project_segments": [{
                "project": rec["project_id"],
                "activity": ACTIVITY_TYPE,
                "from": to_egc_hr_datetime_string(rec["clock_in"]),
                "to": to_egc_hr_datetime_string(rec["clock_out"]),
            }] if rec.get("clock_out") else [],
            "approval": {
                "status": "HR_APPROVED",
                "approved_by": actioning_user["username"],
                "approved_at": to_egc_hr_datetime_string(datetime.now(timezone.utc)),
            },
        }
        payloads.append((rec["_id"], external_work_record_id, payload))

    push_status, push_detail = "pushed", None
    try:
        if len(payloads) == 1:
            result = egc_hr_service.import_work_record(payloads[0][2])
            results = [result]
        else:
            batch = egc_hr_service.import_work_record_batch([p[2] for p in payloads])
            results = batch.get("results", [])

        for (_id, ext_id, _payload), result in zip(payloads, results):
            db[ClockRecordModel.COLLECTION].update_one(
                {"_id": _id}, {"$set": {"external_work_record_id": ext_id}}
            )
            r = result.get("result")
            if r not in ("imported", "already_imported", "amended"):
                push_status = r if r else "failed"
                push_detail = result.get("message")
    except EGCHRError as e:
        push_status, push_detail = "failed", str(e)

    return push_status, push_detail


@bp.route("/submissions/pending-final-approval", methods=["GET"])
@require_permission("attendance.final_approve")
def pending_final_approval():
    db = get_db()
    subs = db[TimesheetSubmissionModel.COLLECTION].find({"status": "supervisor_approved"}).sort("reviewed_at", -1)
    return jsonify({"submissions": [TimesheetSubmissionModel.to_public(s) for s in subs]}), 200


@bp.route("/submissions/final-approve", methods=["POST"])
@require_permission("attendance.final_approve")
def final_approve_submissions():
    """Bulk: the operations manager selects any number of
    supervisor_approved submissions and approves them together. Each one
    pushes to egc_hr independently, so one bad submission in the batch
    doesn't block the rest - results report per-submission outcome."""
    db = get_db()
    user = g.current_user
    body = request.get_json(silent=True) or {}
    submission_ids = body.get("submission_ids") or []
    if not submission_ids:
        return jsonify({"error": "submission_ids is required and must be non-empty."}), 400

    results = []
    for submission_id in submission_ids:
        submission = db[TimesheetSubmissionModel.COLLECTION].find_one({"_id": ObjectId(submission_id)})
        if not submission or submission["status"] != "supervisor_approved":
            results.append({"submission_id": submission_id, "ok": False, "error": "Not awaiting final approval."})
            continue

        push_status, push_detail = _push_submission_to_egc_hr(db, submission, user)
        now = datetime.now(timezone.utc)
        db[TimesheetSubmissionModel.COLLECTION].update_one(
            {"_id": submission["_id"]},
            {"$set": {
                "status": "approved",
                "final_reviewed_by": str(user["_id"]), "final_reviewed_by_name": user["display_name"],
                "final_reviewed_at": now, "final_review_note": body.get("review_note", ""),
                "push_status": push_status,
                "pushed_at": now if push_status == "pushed" else None,
                "pushed_by": str(user["_id"]) if push_status == "pushed" else None,
            }},
        )

        notify(
            submission["user_id"], "timesheet_approved", "Attendance submission fully approved",
            f"Your {submission.get('total_hours', 0)}h submission has been fully approved.",
            link="/attendance?tab=mine",
            related_id=submission_id,
        )
        if push_status != "pushed":
            notify(
                str(user["_id"]), "timesheet_push_failed", "Attendance push to payroll failed",
                f"Submission for {submission['display_name']} was approved but didn't fully reach payroll "
                f"({push_status}). {push_detail or ''}".strip(),
                link="/attendance/final-approval",
                related_id=submission_id,
            )
        results.append({"submission_id": submission_id, "ok": True, "push_status": push_status})

    return jsonify({"results": results}), 200


@bp.route("/submissions/final-reject", methods=["POST"])
@require_permission("attendance.final_approve")
def final_reject_submissions():
    db = get_db()
    user = g.current_user
    body = request.get_json(silent=True) or {}
    submission_ids = body.get("submission_ids") or []
    review_note = body.get("review_note")
    if not submission_ids:
        return jsonify({"error": "submission_ids is required and must be non-empty."}), 400
    if not review_note:
        return jsonify({"error": "review_note is required when rejecting."}), 400

    results = []
    for submission_id in submission_ids:
        submission = db[TimesheetSubmissionModel.COLLECTION].find_one({"_id": ObjectId(submission_id)})
        if not submission or submission["status"] != "supervisor_approved":
            results.append({"submission_id": submission_id, "ok": False, "error": "Not awaiting final approval."})
            continue

        db[TimesheetSubmissionModel.COLLECTION].update_one(
            {"_id": submission["_id"]},
            {"$set": {
                "status": "rejected",
                "final_reviewed_by": str(user["_id"]), "final_reviewed_by_name": user["display_name"],
                "final_reviewed_at": datetime.now(timezone.utc), "final_review_note": review_note,
            }},
        )
        db[ClockRecordModel.COLLECTION].update_many(
            {"_id": {"$in": [ObjectId(r) for r in submission["record_ids"]]}},
            {"$set": {"status": "closed", "submission_id": None}},
        )
        notify(
            submission["user_id"], "timesheet_rejected", "Attendance submission rejected",
            f"{user['display_name']} rejected your submission at final review: {review_note}",
            link="/attendance?tab=mine",
            related_id=submission_id,
        )
        results.append({"submission_id": submission_id, "ok": True})

    return jsonify({"results": results}), 200
