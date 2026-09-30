"""
Runtime health state for catalog entries. NOT git-tracked.

Static dataset descriptions live in entries/*.yaml (reviewed via PR).
Anything that changes on every API call (status, last_checked, last error)
lives here, in a small JSON file, so it never creates git noise.

Recording is best-effort: a failure to write state must never break a request.

Limits to know about:
- The lock only covers threads in one process. With several uvicorn/gunicorn
  workers, concurrent writes are last-write-wins. Fine for now; move to
  Postgres if you need exact counts.
- Error text is truncated, but make sure services never put API keys in
  exception messages, since they end up in this file and the API response.
"""

import json
import logging
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional, Union

from pydantic import BaseModel

logger = logging.getLogger(__name__)

RUNTIME_PATH = Path(os.getenv("CATALOG_RUNTIME_PATH", "data/catalog_runtime.json"))
DEGRADED_AFTER = 1       # consecutive failures before status becomes "degraded"
UNAVAILABLE_AFTER = 3    # consecutive failures before status becomes "unavailable"
MAX_ERROR_LEN = 300

_lock = threading.Lock()


class RuntimeStatus(BaseModel):
    status: Literal["unknown", "active", "degraded", "unavailable"] = "unknown"
    last_checked: Optional[datetime] = None
    last_success: Optional[datetime] = None
    consecutive_failures: int = 0
    last_error: Optional[str] = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _load() -> dict:
    try:
        return json.loads(RUNTIME_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError:
        # Runtime state is disposable; a corrupt file just resets it.
        logger.warning("Catalog runtime file is corrupt; resetting state")
        return {}


def _save(data: dict) -> None:
    RUNTIME_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=RUNTIME_PATH.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh)
        os.replace(tmp, RUNTIME_PATH)  # atomic swap, no half-written file
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def _status_for(failures: int) -> str:
    if failures >= UNAVAILABLE_AFTER:
        return "unavailable"
    if failures >= DEGRADED_AFTER:
        return "degraded"
    return "active"


def record_success(entry_id: str) -> None:
    try:
        with _lock:
            data = _load()
            now = _now()
            data[entry_id] = RuntimeStatus(
                status="active", last_checked=now, last_success=now
            ).model_dump(mode="json")
            _save(data)
    except OSError:
        logger.warning("Could not record catalog success for %s", entry_id, exc_info=True)


def record_failure(entry_id: str, error: Union[str, Exception]) -> None:
    try:
        with _lock:
            data = _load()
            prev = RuntimeStatus(**data.get(entry_id, {}))
            failures = prev.consecutive_failures + 1
            data[entry_id] = RuntimeStatus(
                status=_status_for(failures),
                last_checked=_now(),
                last_success=prev.last_success,
                consecutive_failures=failures,
                last_error=str(error)[:MAX_ERROR_LEN],
            ).model_dump(mode="json")
            _save(data)
    except OSError:
        logger.warning("Could not record catalog failure for %s", entry_id, exc_info=True)


def get_status(entry_id: str) -> RuntimeStatus:
    with _lock:
        return RuntimeStatus(**_load().get(entry_id, {}))


def all_statuses() -> dict[str, RuntimeStatus]:
    with _lock:
        return {k: RuntimeStatus(**v) for k, v in _load().items()}