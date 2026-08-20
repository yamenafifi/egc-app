from pymongo import MongoClient
from pymongo.database import Database
from config.settings import Config

_client: MongoClient = None
_db: Database = None


def get_db() -> Database:
    global _client, _db
    if _db is None:
        # tz_aware=True: every datetime written across this codebase is
        # timezone-aware UTC (datetime.now(timezone.utc)) - without this,
        # pymongo reads them back naive, and arithmetic against a freshly
        # created datetime.now(timezone.utc) raises TypeError. Keep reads
        # and writes symmetric rather than patching each call site.
        _client = MongoClient(Config.MONGO_URI, tz_aware=True)
        _db = _client.get_default_database()
    return _db


def init_indexes(db: Database):
    """Create all necessary indexes on startup. Idempotent."""
    # Users
    db.users.create_index("username", unique=True)
    db.users.create_index("iqama_number", sparse=True)
    db.users.create_index("erp_employee_id", sparse=True)

    # Permission templates
    db.permission_templates.create_index("name", unique=True)

    # Audit log
    db.audit_log.create_index([("user_id", 1), ("timestamp", -1)])
    db.audit_log.create_index("timestamp")

    # ERP Employee cache (reserved)
    db.erp_employee_cache.create_index("employee_id", unique=True)
    db.erp_employee_cache.create_index("iqama_number")

    # Clock records
    db.clock_records.create_index([("user_id", 1), ("clock_in", -1)])
    db.clock_records.create_index([("user_id", 1), ("status", 1)])
    db.clock_records.create_index("submission_id", sparse=True)
    db.clock_records.create_index("status")
    db.clock_records.create_index("external_work_record_id", sparse=True)

    # Timesheet submissions
    db.timesheet_submissions.create_index([("user_id", 1), ("submitted_at", -1)])
    db.timesheet_submissions.create_index("status")
    db.timesheet_submissions.create_index("erp_timesheet_id", sparse=True)
    db.timesheet_submissions.create_index("project_ids")
    db.timesheet_submissions.create_index("push_status")

    # Leave requests
    db.leave_requests.create_index("external_reference", unique=True)
    db.leave_requests.create_index([("user_id", 1), ("submitted_at", -1)])
    db.leave_requests.create_index([("leave_approver_erp_id", 1), ("status", 1)])

    # Notifications
    db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    db.notifications.create_index([("user_id", 1), ("is_read", 1)])

    # Push subscriptions
    db.push_subscriptions.create_index("endpoint", unique=True)
    db.push_subscriptions.create_index("user_id")


def init_timesheet_indexes(db: Database):
    """Alias kept for backward-compat — all indexes now live in init_indexes()."""
    pass
