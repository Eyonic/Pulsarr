from typing import Dict, List, Optional

import requests

BASE_URL = "https://openlibrary.org"
AUTHOR_SEARCH_PATH = "/search/authors.json"
WORKS_PATH = "/authors/{ol_id}/works.json"


def author_image_url(ol_id: str, size: str = "M") -> str:
    return f"https://covers.openlibrary.org/a/olid/{ol_id}-{size}.jpg"


def book_cover_url(cover_id: Optional[int], ol_work_id: Optional[str], size: str = "M") -> Optional[str]:
    if cover_id:
        return f"https://covers.openlibrary.org/b/id/{cover_id}-{size}.jpg"
    if ol_work_id:
        return f"https://covers.openlibrary.org/b/olid/{ol_work_id}-{size}.jpg"
    return None


def search_authors(query: str, limit: int = 10) -> List[Dict]:
    resp = requests.get(f"{BASE_URL}{AUTHOR_SEARCH_PATH}", params={"q": query, "limit": limit}, timeout=10)
    resp.raise_for_status()
    docs = resp.json().get("docs", [])

    results = []
    for doc in docs:
        key = doc.get("key") or ""
        ol_id = key.split("/")[-1] if key else None
        if not ol_id:
            continue
        results.append(
            {
                "name": doc.get("name") or doc.get("title") or "Unknown",
                "ol_id": ol_id,
                "image_url": author_image_url(ol_id),
                "top_work": doc.get("top_work"),
            }
        )
    return results


def fetch_author_works(ol_id: str, limit: int = 50) -> List[Dict]:
    resp = requests.get(f"{BASE_URL}{WORKS_PATH.format(ol_id=ol_id)}", params={"limit": limit}, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    entries = data.get("entries") or data.get("works") or []

    works = []
    for entry in entries:
        work_key = entry.get("key") or ""
        work_olid = work_key.split("/")[-1] if work_key else None
        cover_id = None
        covers = entry.get("covers") or []
        if isinstance(covers, list) and covers:
            cover_id = covers[0]

        works.append(
            {
                "title": entry.get("title", "Untitled"),
                "ol_id": work_olid,
                "first_publish_year": entry.get("first_publish_year") or entry.get("first_publish_date"),
                "cover_url": book_cover_url(cover_id, work_olid),
            }
        )
    return works
