from typing import Any, Dict, Tuple

from sqlalchemy.orm import Session

from .config import settings as env_settings
from .database import SessionLocal
from . import models

DEFAULT_SETTINGS: Dict[str, Any] = {
    "deluge_host": env_settings.DELUGE_HOST,
    "deluge_port": env_settings.DELUGE_PORT,
    "deluge_password": env_settings.DELUGE_PASSWORD,
    "deluge_url": env_settings.DELUGE_URL or "",
    "deluge_label": env_settings.DELUGE_LABEL or "",
    "indexer_url": env_settings.INDEXER_URL or "",
    "indexer_api_key": env_settings.INDEXER_API_KEY or "",
    "abs_base_url": "",
    "abs_api_key": "",
}

SENSITIVE_KEYS = {"deluge_password", "indexer_api_key", "abs_api_key"}
ALLOWED_KEYS = set(DEFAULT_SETTINGS.keys())


def _coerce_value(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def _get_session(db: Session | None) -> Tuple[Session, bool]:
    if db is not None:
        return db, False
    session = SessionLocal()
    return session, True


def ensure_defaults(db: Session | None = None) -> None:
    """
    Make sure every setting key exists in the database with at least a default value.
    """
    session, should_close = _get_session(db)
    try:
        existing_keys = {row.key for row in session.query(models.AppSetting).all()}
        changed = False
        for key, default in DEFAULT_SETTINGS.items():
            if key not in existing_keys:
                session.add(models.AppSetting(key=key, value=_coerce_value(default)))
                changed = True
        if changed:
            session.commit()
    finally:
        if should_close:
            session.close()


def _collect_settings(db: Session | None, mask_sensitive: bool) -> Dict[str, Any]:
    session, should_close = _get_session(db)
    try:
        ensure_defaults(session)
        rows = session.query(models.AppSetting).all()
        data = {row.key: row.value or "" for row in rows}

        # Fill any missing keys with defaults
        for key, default in DEFAULT_SETTINGS.items():
            data.setdefault(key, _coerce_value(default))

        if mask_sensitive:
            for key in SENSITIVE_KEYS:
                if data.get(key):
                    data[key] = "***"

        return data
    finally:
        if should_close:
            session.close()


def get_settings_snapshot(db: Session | None = None) -> Dict[str, Any]:
    """
    Returns settings with sensitive values masked (suitable for API responses).
    """
    return _collect_settings(db, mask_sensitive=True)


def get_settings_values(db: Session | None = None) -> Dict[str, Any]:
    """
    Returns raw settings values (unmasked). Use carefully.
    """
    return _collect_settings(db, mask_sensitive=False)


def update_settings(partial: Dict[str, Any], db: Session | None = None) -> Dict[str, Any]:
    """
    Persist incoming settings and return a masked snapshot for API consumption.
    """
    session, should_close = _get_session(db)
    try:
        ensure_defaults(session)
        changed = False

        for key, value in partial.items():
            if key not in ALLOWED_KEYS:
                continue
            if key in SENSITIVE_KEYS and (value is None or value == ""):
                # Don't clobber stored secrets unless a new value is provided
                continue
            record = session.get(models.AppSetting, key)
            if record is None:
                record = models.AppSetting(key=key, value=_coerce_value(value))
                session.add(record)
            else:
                record.value = _coerce_value(value)
            changed = True

        if changed:
            session.commit()

        return get_settings_snapshot(session)
    finally:
        if should_close:
            session.close()


def get_abs_config(db: Session | None = None) -> Tuple[str, str]:
    """
    Convenience helper for Audiobookshelf integration.
    """
    values = get_settings_values(db)
    return values.get("abs_base_url", "").strip(), values.get("abs_api_key", "").strip()
