import logging
import threading
import time
from datetime import datetime
from typing import Optional, Dict, Any, List

from sqlalchemy.orm import Session

from .bookshelf import BookshelfClient
from .import_bookshelf import import_bookshelf_items
from .database import SessionLocal

logger = logging.getLogger(__name__)


# ============================================================
#  RUNTIME STATE (in-memory)
# ============================================================
AUTOSYNC_STATE = {
    "enabled": False,
    "interval_hours": 6,       # default
    "last_run": None,
    "last_result": None,
}

AUTOSYNC_THREAD = None
AUTOSYNC_STOP_EVENT = threading.Event()


# ============================================================
#  INTERNAL SYNC OPERATION
# ============================================================
def run_sync_now(base_url: str, api_key: str) -> Dict[str, Any]:
    """
    Runs a single sync pass (triggered manually or by scheduler)
    """
    logger.info("Running Audiobookshelf auto-sync...")

    db: Session = SessionLocal()

    try:
        client = BookshelfClient(base_url, api_key)
        raw_items = client.get_all_items()

        # Normalize for the importer
        normalized = [client.normalize_item(i) for i in raw_items]

        result = import_bookshelf_items(db, normalized, dry_run=False)

        AUTOSYNC_STATE["last_run"] = datetime.utcnow().isoformat()
        AUTOSYNC_STATE["last_result"] = {
            "imported_count": len(result),
            "timestamp": AUTOSYNC_STATE["last_run"],
        }

        logger.info("Auto-sync completed: %s items imported", len(result))
        return AUTOSYNC_STATE["last_result"]

    except Exception as exc:
        logger.error("Auto-sync failed: %s", exc)
        AUTOSYNC_STATE["last_result"] = {"error": str(exc)}
        return AUTOSYNC_STATE["last_result"]

    finally:
        db.close()


# ============================================================
#  BACKGROUND THREAD LOOP
# ============================================================
def autosync_loop(base_url: str, api_key: str):
    """
    Background thread that wakes up every X hours and performs a sync.
    """

    logger.info(
        "Starting auto-sync thread (interval=%s hours)", AUTOSYNC_STATE["interval_hours"]
    )

    while not AUTOSYNC_STOP_EVENT.is_set():
        if AUTOSYNC_STATE["enabled"]:
            run_sync_now(base_url, api_key)

        # Sleep until next cycle or stop
        sleep_seconds = AUTOSYNC_STATE["interval_hours"] * 3600
        woke = AUTOSYNC_STOP_EVENT.wait(timeout=sleep_seconds)
        if woke:  # received stop signal
            break


# ============================================================
#  API HELPERS
# ============================================================
def start_autosync_thread(base_url: str, api_key: str):
    global AUTOSYNC_THREAD

    if AUTOSYNC_THREAD and AUTOSYNC_THREAD.is_alive():
        logger.info("Auto-sync thread already running.")
        return

    AUTOSYNC_STOP_EVENT.clear()
    AUTOSYNC_THREAD = threading.Thread(
        target=autosync_loop, args=(base_url, api_key), daemon=True
    )
    AUTOSYNC_THREAD.start()

    logger.info("Auto-sync thread created.")


def stop_autosync_thread():
    AUTOSYNC_STOP_EVENT.set()


# ============================================================
#  API ENDPOINTS (called by main.py)
# ============================================================
def get_autosync_status() -> Dict[str, Any]:
    return {
        "enabled": AUTOSYNC_STATE["enabled"],
        "interval_hours": AUTOSYNC_STATE["interval_hours"],
        "last_run": AUTOSYNC_STATE["last_run"],
        "last_result": AUTOSYNC_STATE["last_result"],
    }


def configure_autosync(enabled: bool, interval_hours: int, base_url: str, api_key: str):
    AUTOSYNC_STATE["enabled"] = enabled
    AUTOSYNC_STATE["interval_hours"] = interval_hours

    if enabled:
        start_autosync_thread(base_url, api_key)
    else:
        stop_autosync_thread()

    return get_autosync_status()


def trigger_sync_now(base_url: str, api_key: str):
    """
    Called when user presses 'Sync Now' in frontend
    """
    return run_sync_now(base_url, api_key)
