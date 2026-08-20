"""egc_hr treats every datetime it receives as naive local Saudi wall-clock
time with zero conversion (see docs/EGC_APP_INTEGRATION.md's "Timezone
handling" section in the egc-erp-hr repo). EGC App stores everything in
Mongo as timezone-aware UTC (datetime.now(timezone.utc)) - anything sent
to egc_hr MUST be converted through here first, or every payroll record
would silently shift by 3 hours (and work_date could land on the wrong
calendar day near midnight UTC / 9pm-midnight Saudi time)."""

from datetime import datetime, timedelta, timezone

SAUDI_OFFSET = timedelta(hours=3)  # UTC+3, no DST


def to_saudi_naive(dt: datetime) -> datetime:
    """Converts an aware (or assumed-UTC naive) datetime to naive Saudi
    local time, suitable for egc_hr's YYYY-MM-DD HH:MM:SS string format."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (dt.astimezone(timezone.utc) + SAUDI_OFFSET).replace(tzinfo=None)


def to_egc_hr_datetime_string(dt: datetime) -> str:
    return to_saudi_naive(dt).strftime("%Y-%m-%d %H:%M:%S")


def to_egc_hr_date_string(dt: datetime) -> str:
    return to_saudi_naive(dt).strftime("%Y-%m-%d")
