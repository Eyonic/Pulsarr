import base64
import binascii
import requests
from urllib.parse import urlparse, parse_qs

from .config import settings


class DelugeClient:
    def __init__(self, runtime_settings: dict | None = None):
        cfg = runtime_settings or {}

        deluge_url = cfg.get("deluge_url") or settings.DELUGE_URL
        deluge_host = cfg.get("deluge_host") or settings.DELUGE_HOST
        deluge_port = cfg.get("deluge_port") or settings.DELUGE_PORT

        if deluge_url:
            base = str(deluge_url).rstrip("/")
            self.base_url = f"{base}/json"
        else:
            self.base_url = f"http://{deluge_host}:{deluge_port}/json"

        self.password = cfg.get("deluge_password") or settings.DELUGE_PASSWORD
        self.session = requests.Session()

    def _request(self, method: str, params: list):
        payload = {"method": method, "params": params, "id": 1}
        resp = self.session.post(self.base_url, json=payload, timeout=10)
        resp.raise_for_status()
        try:
            data = resp.json()
        except ValueError:
            snippet = resp.text[:200]
            raise RuntimeError(
                f"Deluge response was not JSON (status {resp.status_code}): {snippet}"
            ) from None
        if data.get("error"):
            raise RuntimeError(data["error"])
        return data.get("result")

    def login(self):
        return self._request("auth.login", [self.password])

    def add_magnet(self, magnet_url: str, options: dict | None = None):
        options = options or {}
        # Same as your original: just forwards to core.add_torrent_magnet
        return self._request("core.add_torrent_magnet", [magnet_url, options])


def _torrent_id_from_magnet(magnet_url: str) -> str | None:
    """
    Extract the torrent id (info hash) from a magnet URI.

    Handles:
    - Hex BTIH (40-char hex)
    - Base32 BTIH (32-char base32 -> converted to hex)
    """
    try:
        parsed = urlparse(magnet_url)
    except Exception:
        return None

    if parsed.scheme != "magnet":
        return None

    qs = parse_qs(parsed.query)
    xts = qs.get("xt") or []
    for xt in xts:
        if not xt.startswith("urn:btih:"):
            continue
        h = xt.split(":", 2)[-1]

        # Hex info-hash (40 hex chars)
        if len(h) == 40 and all(c in "0123456789abcdefABCDEF" for c in h):
            return h.lower()

        # Base32 info-hash (32 chars) -> convert to hex
        if len(h) == 32:
            try:
                raw = base64.b32decode(h.upper())
                return raw.hex()
            except binascii.Error:
                continue

    return None


def add_torrent(magnet_url: str, label: str | None = None, runtime_settings: dict | None = None):
    """
    Drop-in replacement:
    - Same signature
    - Same return value (always True)
    - Still calls core.add_torrent_magnet as before
    - Now correctly labels the torrent using the Label plugin
    """
    client = DelugeClient(runtime_settings=runtime_settings)
    client.login()

    # Figure out torrent_id from the magnet itself (doesn't depend on Deluge's return value)
    torrent_id = _torrent_id_from_magnet(magnet_url)

    opts = {}
    if label:
        # Keep old behavior (harmless, core ignores 'label' in options)
        opts["label"] = label

    # Add the torrent (same as before)
    client.add_magnet(magnet_url, opts)

    # Actually set the label via plugin
    if label and torrent_id:
        try:
            # Built-in Label plugin method name
            client._request("label.set_torrent", [torrent_id, label])
        except Exception:
            # Don’t break anything if plugin not enabled or method missing
            pass

    return True
