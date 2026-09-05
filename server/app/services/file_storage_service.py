"""
File Storage Service
=====================
Thin wrapper over MongoDB GridFS - the only place in this codebase that
stores raw file bytes (confirmed via full-repo search: nothing else here
uploads or serves a file; every existing "document" reference, e.g.
erp_service.get_employee_card()'s photo/passport fields, is a pointer
into ERPNext's own file storage instead).

GridFS over local disk: nothing in this repo confirms persistent disk on
app.egc-me.com's host, whereas MongoDB is already this app's one,
presumably-backed-up datastore - one place, one backup story.

Used for Expense Claim receipt PDFs (the original upload plus each
AI-split single-receipt file) - always served back through a
permission-checked route (see app/api/expense_claims.py), never a public
static URL, since receipts carry real financial/PII data.
"""

from bson import ObjectId
from bson.errors import InvalidId
from gridfs import GridFS, NoFile

from app.utils.database import get_db

_fs: GridFS | None = None


def _get_fs() -> GridFS:
    global _fs
    if _fs is None:
        _fs = GridFS(get_db())
    return _fs


def store(data: bytes, filename: str, content_type: str = "application/pdf") -> str:
    file_id = _get_fs().put(data, filename=filename, content_type=content_type)
    return str(file_id)


def read(file_id: str) -> tuple[bytes, str, str] | None:
    """Returns (data, filename, content_type), or None if not found/invalid id."""
    try:
        oid = ObjectId(file_id)
    except (InvalidId, TypeError):
        return None
    try:
        grid_out = _get_fs().get(oid)
    except NoFile:
        return None
    return grid_out.read(), grid_out.filename, grid_out.content_type


def delete(file_id: str) -> None:
    try:
        oid = ObjectId(file_id)
    except (InvalidId, TypeError):
        return
    _get_fs().delete(oid)
