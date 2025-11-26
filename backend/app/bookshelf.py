import logging
import requests
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class BookshelfClient:
    """
    Audiobookshelf API client.

    Fixes included:
    - Case-insensitive library name matching
    - Support for libraries with mediaType = "book" or "audiobook"
    - Extract authors/narrators from media.metadata (REAL ABS fields)
    - Fallback to folder names if metadata missing
    - Normalizes all metadata consistently
    """

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json"
        }
        self._library_id_cache: Optional[str] = None

    # ----------------------------------------------------------------------
    # INTERNAL REQUEST WRAPPER
    # ----------------------------------------------------------------------
    def _get(self, path: str) -> Any:
        url = f"{self.base_url}{path}"
        logger.info("ABS GET %s", url)

        resp = requests.get(url, headers=self.headers, timeout=20)

        if resp.status_code == 401:
            raise RuntimeError("Audiobookshelf unauthorized (check API key)")
        if resp.status_code == 404:
            raise RuntimeError(f"Audiobookshelf resource not found: {url}")

        resp.raise_for_status()
        return resp.json()

    # ----------------------------------------------------------------------
    # LIBRARY HELPERS
    # ----------------------------------------------------------------------
    def _get_library_id(self, name: str = "audiobooks") -> str:
        """Returns the library ID for a given name (case-insensitive)."""
        if self._library_id_cache:
            return self._library_id_cache

        data = self._get("/api/libraries")
        name = name.lower()

        for lib in data.get("libraries", []):
            if lib.get("name", "").lower() == name:
                self._library_id_cache = lib["id"]
                return self._library_id_cache

        raise RuntimeError(f"Audiobookshelf library not found: {name}")

    # ----------------------------------------------------------------------
    # PUBLIC API
    # ----------------------------------------------------------------------
    def get_all_items(self) -> List[Dict]:
        """Fetch all items of type book/audiobook."""
        lib_id = self._get_library_id()
        data = self._get(f"/api/libraries/{lib_id}/items")
        items = data.get("results", [])

        out = []
        for item in items:
            media_type = item.get("mediaType") or item.get("type")
            if media_type in ("book", "audiobook", None):
                out.append(item)

        return out

    def get_item(self, item_id: str) -> Dict:
        return self._get(f"/api/items/{item_id}")

    def get_series(self, library_id: Optional[str] = None) -> List[Dict]:
        lib_id = library_id or self._get_library_id()
        data = self._get(f"/api/libraries/{lib_id}/series")
        if isinstance(data, dict) and "series" in data:
            return data.get("series") or []
        if isinstance(data, dict) and "results" in data:
            return data.get("results") or []
        return data if isinstance(data, list) else []

    # ----------------------------------------------------------------------
    # UTILITY HELPERS
    # ----------------------------------------------------------------------
    def extract_cover_url(self, item: Dict) -> Optional[str]:
        item_id = item.get("id")
        if not item_id:
            return None
        return f"{self.base_url}/api/items/{item_id}/cover"

    # ----------------------------------------------------------------------
    # NORMALIZATION
    # ----------------------------------------------------------------------
    def normalize_item(self, item: Dict) -> Dict:
        """
        Normalizes ABS item metadata so the importer can use it.

        Returns:
        {
            "title": str,
            "authors": [str],
            "narrators": [str],
            "abs_cover_url": str | None,
        }
        """

        media = item.get("media", {})
        meta = media.get("metadata", {})

        # ---- TITLE ----
        title = (
            meta.get("title")
            or item.get("title")
            or item.get("name")
        )

        # ---- AUTHORS ----
        authors: List[str] = []

        # 1. Structured ABS authors (rare in your library)
        raw_authors = item.get("authors") or []
        for a in raw_authors:
            name = a.get("name")
            if name:
                authors.append(name.strip())

        # 2. Use media.metadata.authorName if present
        if not authors:
            author_field = meta.get("authorName")
            if author_field:
                authors = [x.strip() for x in author_field.split(",") if x.strip()]

        # 3. Folder fallback: "Author - Book Title"
        if not authors:
            rel = item.get("relPath", "")
            if " - " in rel:
                possible_author = rel.split(" - ")[0].strip()
                if possible_author:
                    authors.append(possible_author)

        # ---- NARRATORS ----
        narrators: List[str] = []

        narrator_field = meta.get("narratorName")
        if narrator_field:
            narrators = [x.strip() for x in narrator_field.split(",") if x.strip()]

        # ---- COVER ----
        cover_url = self.extract_cover_url(item)

        return {
            "title": title,
            "authors": authors,
            "narrators": narrators,
            "abs_cover_url": cover_url,
        }
