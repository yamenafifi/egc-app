"""
Background Job Queue
======================
This app has no Redis/Celery/RQ - a single bounded thread pool is the
whole "queue". A job function is expected to persist its own progress/
outcome (see expense_claim_processor.py) since nothing here tracks job
state; this module only guarantees the function actually runs off the
request thread and that a bug in its own error handling can't vanish
silently (ThreadPoolExecutor swallows an exception unless something
calls .result() on the future, which nothing does for fire-and-forget
jobs like these).
"""

from concurrent.futures import ThreadPoolExecutor

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="egc-job")


def submit(fn, *args, **kwargs):
    def _run():
        try:
            fn(*args, **kwargs)
        except Exception as e:  # noqa: BLE001 - last-resort net, see module docstring
            print(f"[job_queue] {fn.__module__}.{fn.__name__} raised unhandled: {e}")

    return _executor.submit(_run)
