"""
Project Site Cache
===================
Short-TTL process-local cache over egc_hr_service.list_active_sites() -
geofence data (for clock-in) and Supervisor membership (for routing
attendance approval / Team Requests) are both read on nearly every
attendance request, and neither changes often enough to justify hitting
egc_hr on every call.

On egc_hr being unreachable: serve stale cache if one exists (better to
let attendance keep working off slightly-stale site data than to block
it); if no cache has ever been populated, raise so the caller can return
a clear 503 rather than silently skipping geofence/supervisor validation.
"""

import threading
import time

from app.services.egc_hr_service import egc_hr_service, EGCHRError

_TTL_SECONDS = 300

_lock = threading.Lock()
_sites: list[dict] | None = None
_fetched_at: float = 0.0


class ProjectSiteCacheError(Exception):
    pass


def get_sites(force: bool = False) -> list[dict]:
    global _sites, _fetched_at
    with _lock:
        is_stale = (time.time() - _fetched_at) > _TTL_SECONDS
        if _sites is not None and not is_stale and not force:
            return _sites

        try:
            fresh = egc_hr_service.list_active_sites()
            _sites = fresh
            _fetched_at = time.time()
            return _sites
        except EGCHRError:
            if _sites is not None:
                return _sites  # serve stale rather than fail
            raise ProjectSiteCacheError(
                "egc_hr is unreachable and no project site data has ever been cached."
            )


def get_site(project_id: str) -> dict | None:
    for site in get_sites():
        if site["name"] == project_id:
            return site
    return None


def is_supervisor_of(erp_employee_id: str, project_id: str) -> bool:
    site = get_site(project_id)
    if not site:
        return False
    return erp_employee_id in (site.get("supervisors") or [])


def invalidate():
    global _sites, _fetched_at
    with _lock:
        _sites = None
        _fetched_at = 0.0
