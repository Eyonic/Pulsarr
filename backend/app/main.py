import logging
import traceback
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from typing import List, Optional
from xml.etree import ElementTree

import requests
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import select, text, func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from . import (
    deluge,
    models,
    openlibrary,
    schemas,
    settings_store
)

from .database import get_db, init_db

# NEW IMPORTS
from .bookshelf import BookshelfClient
from .import_bookshelf import import_bookshelf_items
from .autosync import (
    configure_autosync,
    get_autosync_status,
    trigger_sync_now,
    start_autosync_thread,
)

MEDIA_DIR = Path(__file__).resolve().parent / "media"
COVERS_DIR = MEDIA_DIR / "covers"

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="BookArr Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    """
    Initialize DB, seed default settings, and start auto-sync thread if enabled.
    """
    _ensure_media_dirs()
    init_db()
    settings_store.ensure_defaults()

    # Optional: auto-start thread if autosync enabled
    state = get_autosync_status()
    if state["enabled"]:
        base_url, api_key = settings_store.get_abs_config()
        if base_url and api_key:
            start_autosync_thread(base_url, api_key)


def normalize_year(value):
    try:
        return int(str(value)[:4])
    except Exception:
        return None


def _ensure_media_dirs():
    MEDIA_DIR.mkdir(exist_ok=True)
    COVERS_DIR.mkdir(parents=True, exist_ok=True)


def _cover_file_for_book(book_id: int) -> Optional[Path]:
    existing = list(COVERS_DIR.glob(f"{book_id}.*"))
    return existing[0] if existing else None


def _download_cover(book: models.Book) -> Optional[Path]:
    src = book.abs_cover_url or book.cover_url
    if not src:
        return None

    try:
        resp = requests.get(src, timeout=10)
        resp.raise_for_status()
    except Exception:
        logger.exception("Failed to download cover for book %s", book.id)
        return None

    parsed = urlparse(src)
    ext = Path(parsed.path).suffix or ".jpg"
    filename = f"{book.id}{ext}"
    filepath = COVERS_DIR / filename
    try:
        filepath.write_bytes(resp.content)
        return filepath
    except Exception:
        logger.exception("Failed to write cover for book %s", book.id)
        return None


def _get_or_download_cover(book: models.Book) -> Optional[Path]:
    _ensure_media_dirs()
    existing = _cover_file_for_book(book.id)
    if existing:
        return existing
    return _download_cover(book)


def get_abs_client(db: Session) -> BookshelfClient:
    base_url, api_key = settings_store.get_abs_config(db)
    if not base_url or not api_key:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Audiobookshelf base URL and API key must be configured first.",
        )
    return BookshelfClient(base_url, api_key)


def fetch_itunes_audiobooks(author_name: str, limit: int = 50) -> List[dict]:
    """
    Fetch audiobooks for the given author from the iTunes API.
    """
    params = {
        "term": author_name,
        "media": "audiobook",
        "entity": "audiobook",
        "limit": limit,
    }
    try:
        resp = requests.get("https://itunes.apple.com/search", params=params, timeout=15)
        resp.raise_for_status()
        payload = resp.json()
        results = payload.get("results", [])
    except Exception as exc:
        logger.exception("iTunes lookup failed for author %s", author_name)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"iTunes lookup failed: {exc}")

    mapped = []
    for item in results:
        title = item.get("collectionName") or item.get("trackName")
        if not title:
            continue
        cover = item.get("artworkUrl100") or item.get("artworkUrl60")
        mapped.append(
            {
                "title": title,
                "cover_url": cover,
                "source": "itunes",
            }
        )
    return mapped


def search_indexer_for_magnet(query: str, runtime_settings: dict) -> Optional[str]:
    """
    Query a Torznab/Prowlarr indexer for the given query and return the first magnet/enclosure URL.
    """
    indexer_url = runtime_settings.get("indexer_url")
    api_key = runtime_settings.get("indexer_api_key")
    if not indexer_url or not api_key:
        return None

    params = {
        "t": "search",
        "q": query,
        "apikey": api_key,
        "extended": 1,
        "cat": "3030,7000",  # audiobook categories; include generic audio
    }

    try:
        resp = requests.get(indexer_url, params=params, timeout=20)
        resp.raise_for_status()
    except Exception:
        logger.exception("Indexer search failed for query %s", query)
        return None

    try:
        root = ElementTree.fromstring(resp.text)
    except Exception:
        logger.exception("Failed parsing indexer XML for query %s", query)
        return None

    # Find first item and attempt to extract a magnet/enclosure link
    for item in root.findall(".//item"):
        # torznab magnet attr
        for attr in item.findall(".//{*}attr"):
            if attr.get("name") == "magneturl" and attr.get("value"):
                return attr.get("value")

        link_el = item.find("link")
        if link_el is not None and link_el.text and link_el.text.startswith("magnet:"):
            return link_el.text

        enclosure = item.find("enclosure")
        if enclosure is not None:
            url = enclosure.get("url")
            if url:
                return url

    return None


def _prowlarr_base_and_key(runtime_settings: dict) -> tuple[Optional[str], Optional[str]]:
    base = runtime_settings.get("indexer_url", "")
    api_key = runtime_settings.get("indexer_api_key", "")
    if not base or not api_key:
        return None, None
    base = base.rstrip("/")
    if "/torznab" in base:
        base = base.split("/torznab")[0]
    return base, api_key


def search_prowlarr(query: str, runtime_settings: dict) -> Optional[str]:
    """
    Use Prowlarr's API search endpoint (arr-style) to find a download URL/magnet.
    """
    base, api_key = _prowlarr_base_and_key(runtime_settings)
    if not base or not api_key:
        return None

    # collect enabled indexers
    indexer_ids: list[str] = []
    try:
        idx_resp = requests.get(f"{base}/api/v1/indexer", params={"apikey": api_key}, timeout=10)
        idx_resp.raise_for_status()
        idx_data = idx_resp.json()
        if isinstance(idx_data, list):
            indexer_ids = [str(i.get("id")) for i in idx_data if i.get("enableRss", True) and i.get("id") is not None]
    except Exception:
        logger.exception("Failed to fetch indexers from Prowlarr base %s", base)

    params = {
        "apikey": api_key,
        "query": query,
        "type": "search",
        "limit": 5,
        "categories": "3030,7000",
    }
    if indexer_ids:
        params["indexerIds"] = ",".join(indexer_ids)

    try:
        resp = requests.get(f"{base}/api/v1/search", params=params, timeout=20)
        resp.raise_for_status()
        results = resp.json()
    except Exception:
        logger.exception("Prowlarr API search failed for query %s", query)
        return None

    if not isinstance(results, list) or not results:
        return None

    for top in results:
        for key in ("downloadUrl", "magnetUrl", "guid"):
            url = top.get(key)
            if url:
                return url
    return None


# ============================================================
# ACTIVITY LOG (in-memory, basic)
# ============================================================
ACTIVITY_LOG: list[dict] = []


def log_activity(message: str, detail: str | None = None, source: str | None = None, author: str | None = None,
                 status: str | None = None):
    ACTIVITY_LOG.append(
        {
            "message": message,
            "detail": detail,
            "source": source,
            "author": author,
            "status": status,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
    )
    # keep last 100
    if len(ACTIVITY_LOG) > 100:
        ACTIVITY_LOG.pop(0)


# ============================================================
# SCHEMA HELPERS
# ============================================================
def author_to_schema(author: models.Author) -> schemas.Author:
    return schemas.Author(
        id=author.id,
        name=author.name,
        ol_id=author.ol_id,       # now optional in schemas
        image_url=author.image_url,
        monitored=author.monitored,
        book_count=len(author.books),
    )


def book_to_schema(book: models.Book) -> schemas.Book:
    narrators = [schemas.Narrator(id=n.id, name=n.name) for n in book.narrators]

    return schemas.Book(
        id=book.id,
        title=book.title,
        ol_id=book.ol_id,
        first_publish_year=book.first_publish_year,
        cover_url=book.cover_url,
        abs_cover_url=book.abs_cover_url,
        author_id=book.author_id,
        narrators=narrators,
        cached_cover_url=f"/api/media/covers/{book.id}"
    )


def book_to_search_result(book: models.Book, author: models.Author) -> schemas.BookSearchResult:
    return schemas.BookSearchResult(
        id=book.id,
        title=book.title,
        author_id=author.id,
        author_name=author.name,
        cover_url=book.cover_url,
        abs_cover_url=book.abs_cover_url,
        cached_cover_url=f"/api/media/covers/{book.id}",
    )


# ============================================================
# ROOT + HEALTH
# ============================================================
@app.get("/")
def read_root():
    return {"system": "BookArr", "status": "online"}


@app.get("/health/db")
def test_db_connection(db: Session = Depends(get_db)):
    try:
        result = db.execute(text("SELECT 1"))
        return {"database": "connected", "result": result.scalar()}
    except Exception as e:
        return {"database": "error", "details": str(e)}


# ============================================================
# AUTHORS
# ============================================================
@app.get("/authors/", response_model=List[schemas.Author])
def list_authors(db: Session = Depends(get_db)):
    try:
        authors = (
            db.execute(
                select(models.Author)
                .options(joinedload(models.Author.books))
                .order_by(models.Author.name)
            )
            .unique()
            .scalars()
            .all()
        )
        return [author_to_schema(a) for a in authors]

    except SQLAlchemyError:
        logger.exception("Database failure listing authors")
        raise HTTPException(503, "Database unavailable")


@app.post("/authors/", response_model=schemas.Author, status_code=201)
def create_author(payload: schemas.AuthorCreate, db: Session = Depends(get_db)):
    try:
        existing = (
            db.execute(
                select(models.Author).where(models.Author.ol_id == payload.ol_id)
            ).scalar_one_or_none()
        )
        if existing:
            return author_to_schema(existing)

        author = models.Author(**payload.dict())
        db.add(author)
        db.commit()
        db.refresh(author)

        return author_to_schema(author)

    except SQLAlchemyError:
        logger.exception("Database failure creating author")
        raise HTTPException(503, "Database unavailable")


@app.delete("/authors/{author_id}", status_code=204)
def delete_author(author_id: int, db: Session = Depends(get_db)):
    try:
        author = db.get(models.Author, author_id)
        if not author:
            raise HTTPException(404, "Author not found")

        db.delete(author)
        db.commit()

    except SQLAlchemyError:
        logger.exception("Database failure deleting author")
        raise HTTPException(503, "Database unavailable")


@app.get("/media/covers/{book_id}")
def get_or_cache_cover(book_id: int, db: Session = Depends(get_db)):
    """
    Returns a cached cover image. If missing, downloads it and stores under media/covers.
    """
    book = db.get(models.Book, book_id)
    if not book:
        raise HTTPException(404, "Book not found")

    filepath = _get_or_download_cover(book)
    if not filepath or not filepath.exists():
        raise HTTPException(404, "Cover not available for this book")

    return FileResponse(filepath)


# ============================================================
# LIBRARIES / SERIES
# ============================================================
@app.get("/libraries/{library_id}/series")
def list_series(library_id: str, db: Session = Depends(get_db)):
    client = get_abs_client(db)
    try:
        data = client.get_series(library_id)
        return data
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))
    except Exception:
        logger.exception("Failed to fetch series for library %s", library_id)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Failed to fetch series from Audiobookshelf")


# ============================================================
# AUTHOR AUDIOS (iTunes)
# ============================================================
@app.get("/authors/{author_id}/missing-audiobooks", response_model=schemas.AuthorMissingBooks)
def author_missing_audiobooks(
    author_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    author = db.get(models.Author, author_id)
    if not author:
        raise HTTPException(404, "Author not found")

    # Owned books
    owned_books = (
        db.execute(
            select(models.Book).where(models.Book.author_id == author_id).order_by(models.Book.title)
        )
        .scalars()
        .all()
    )

    owned_titles = {b.title.lower() for b in owned_books if b.title}

    itunes_items = fetch_itunes_audiobooks(author.name, limit=limit)
    missing_items = [item for item in itunes_items if item["title"].lower() not in owned_titles]

    return {
        "owned": [book_to_schema(b) for b in owned_books],
        "missing": missing_items,
    }


# ============================================================
# BOOK SEARCH
# ============================================================
@app.get("/books/search", response_model=List[schemas.BookSearchResult])
def search_books(q: str = Query(..., min_length=2), limit: int = Query(20, ge=1, le=50), db: Session = Depends(get_db)):
    pattern = f"%{q}%"
    rows = (
        db.execute(
            select(models.Book, models.Author)
            .join(models.Author, models.Book.author_id == models.Author.id)
            .where(func.lower(models.Book.title).like(func.lower(pattern)))
            .order_by(models.Book.title)
            .limit(limit)
        )
        .all()
    )
    return [book_to_search_result(book, author) for book, author in rows]


@app.get("/books", response_model=List[schemas.BookSearchResult])
def list_books(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0, le=5000),
    db: Session = Depends(get_db),
):
    rows = (
        db.execute(
            select(models.Book, models.Author)
            .join(models.Author, models.Book.author_id == models.Author.id)
            .order_by(models.Book.title)
            .limit(limit)
            .offset(offset)
        )
        .all()
    )
    return [book_to_search_result(book, author) for book, author in rows]


@app.get("/activity", response_model=List[schemas.ActivityEvent])
def activity_feed():
    return list(ACTIVITY_LOG)[-100:][::-1]


def get_prowlarr_indexers(runtime_settings: dict) -> List[schemas.Indexer]:
    base_url = runtime_settings.get("indexer_url")
    api_key = runtime_settings.get("indexer_api_key")
    if not base_url or not api_key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indexer URL and API key must be configured first.")

    # Normalize: remove path if pointing to /torznab/all; Prowlarr's API lives under /prowlarr/api/v1/indexer
    normalized = base_url.rstrip("/")
    if "/torznab" in normalized:
        normalized = normalized.split("/torznab")[0]

    url = f"{normalized}/api/v1/indexer"
    try:
        resp = requests.get(url, params={"apikey": api_key}, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.exception("Failed to fetch indexers from Prowlarr")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Failed to fetch indexers: {exc}")

    indexers = []
    for item in data:
        indexers.append(
            schemas.Indexer(
                id=str(item.get("id")),
                name=item.get("name", "Indexer"),
                url=item.get("baseUrl") or item.get("url"),
                enabled=bool(item.get("enableRss", True)),
            )
        )
    return indexers


@app.get("/indexers", response_model=List[schemas.Indexer])
def list_indexers(db: Session = Depends(get_db)):
    runtime_settings = settings_store.get_settings_values(db)
    return get_prowlarr_indexers(runtime_settings)


@app.get("/authors/search", response_model=List[schemas.AuthorSearchResult])
def search_authors(q: str = Query(..., min_length=2), limit: int = Query(10, ge=1, le=25)):
    try:
        return openlibrary.search_authors(q, limit)
    except requests.RequestException as exc:
        raise HTTPException(502, f"Search failed: {exc}")


@app.get("/authors/{author_id}", response_model=schemas.Author)
def get_author(author_id: int, db: Session = Depends(get_db)):
    author = (
        db.execute(
            select(models.Author)
            .options(joinedload(models.Author.books))
            .where(models.Author.id == author_id)
        )
        .scalars()
        .first()
    )

    if not author:
        raise HTTPException(404, "Author not found")

    return author_to_schema(author)


# ============================================================
# BOOKS
# ============================================================
@app.get("/authors/{author_id}/books", response_model=List[schemas.Book])
def get_author_books(
    author_id: int,
    refresh: bool = False,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    try:
        author = db.get(models.Author, author_id)
        if not author:
            raise HTTPException(404, "Author not found")

        cached_books = (
            db.execute(
                select(models.Book)
                .where(models.Book.author_id == author_id)
                .order_by(models.Book.title)
            )
            .scalars()
            .all()
        )

        # ==================================================
        # FIX: Disable OpenLibrary refresh for ABS authors
        # ==================================================
        if author.ol_id is None or author.ol_id == "":
            # ABS author → return cached books only
            return [book_to_schema(b) for b in cached_books]

        # ==================================================
        # ORIGINAL OPENLIBRARY BEHAVIOR (only for OL authors)
        # ==================================================
        should_refresh = refresh or not cached_books

        if should_refresh:
            try:
                works = openlibrary.fetch_author_works(author.ol_id, limit=limit)
            except Exception as exc:
                raise HTTPException(502, f"OpenLibrary fetch failed: {exc}")

            for work in works:
                title = work.get("title") or "Untitled"

                existing = (
                    db.execute(
                        select(models.Book).where(
                            models.Book.author_id == author_id,
                            models.Book.title == title,
                        )
                    )
                    .scalars()
                    .first()
                )

                if existing:
                    existing.ol_id = work.get("ol_id")
                    existing.cover_url = work.get("cover_url") or existing.cover_url
                    existing.first_publish_year = normalize_year(work.get("first_publish_year"))
                else:
                    book = models.Book(
                        title=title,
                        ol_id=work.get("ol_id"),
                        cover_url=work.get("cover_url"),
                        first_publish_year=normalize_year(work.get("first_publish_year")),
                        author_id=author_id,
                    )
                    db.add(book)

            db.commit()

        books = (
            db.execute(
                select(models.Book)
                .where(models.Book.author_id == author_id)
                .order_by(models.Book.title)
            )
            .scalars()
            .all()
        )

        return [book_to_schema(b) for b in books]

    except SQLAlchemyError:
        logger.exception("Database error fetching books")
        raise HTTPException(503, "Database unavailable")


@app.post("/authors/{author_id}/books", response_model=schemas.Book, status_code=201)
def create_book_for_author(
    author_id: int,
    payload: schemas.BookCreate,
    download: bool = False,
    db: Session = Depends(get_db),
):
    """
    Create a book for the given author. Used by frontend when adding missing items.
    """
    author = db.get(models.Author, author_id)
    if not author:
        raise HTTPException(404, "Author not found")

    book = models.Book(
        title=payload.title,
        ol_id=payload.ol_id,
        cover_url=payload.cover_url,
        abs_cover_url=payload.abs_cover_url,
        first_publish_year=payload.first_publish_year,
        author_id=author_id,
    )
    db.add(book)

    if payload.narrators:
        for name in payload.narrators:
            if not name:
                continue
            narrator = models.Narrator(name=name)
            db.add(narrator)
            db.flush()
            book.narrators.append(narrator)

    db.commit()
    db.refresh(book)

    runtime_settings = settings_store.get_settings_values(db)
    if download:
        indexer_url = runtime_settings.get("indexer_url")
        api_key = runtime_settings.get("indexer_api_key")

        if not indexer_url or not api_key:
            log_activity(
                message=f"Skipped download (missing indexer config): {payload.title}",
                detail="Set indexer URL and API key in settings.",
                source="prowlarr",
                author=author.name,
                status="skipped",
            )
        else:
            query = f"{payload.title} {author.name}"
            magnet = search_indexer_for_magnet(query, runtime_settings)
            if magnet:
                try:
                    label = runtime_settings.get("deluge_label") or None
                    deluge.add_torrent(magnet, label=label, runtime_settings=runtime_settings)
                    log_activity(
                        message=f"Requested download: {payload.title}",
                        detail=f"Author: {author.name}",
                        source="deluge",
                        author=author.name,
                        status="queued",
                    )
                except Exception:
                    logger.exception("Failed to send torrent to Deluge for %s", payload.title)
                    log_activity(
                        message=f"Download failed to queue: {payload.title}",
                        detail=f"Author: {author.name}",
                        source="deluge",
                        author=author.name,
                        status="error",
                    )
            else:
                log_activity(
                    message=f"No magnet found for: {payload.title}",
                    detail=f"Query: {query}",
                    source="prowlarr",
                    author=author.name,
                    status="not_found",
                )

    return book_to_schema(book)


@app.post("/authors/{author_id}/download")
def download_missing_book(
    author_id: int,
    payload: schemas.DownloadRequest,
    db: Session = Depends(get_db),
):
    author = db.get(models.Author, author_id)
    if not author:
        raise HTTPException(404, "Author not found")

    runtime_settings = settings_store.get_settings_values(db)
    indexer_url = runtime_settings.get("indexer_url")
    api_key = runtime_settings.get("indexer_api_key")
    if not indexer_url or not api_key:
        log_activity(
            message=f"Skipped download (missing indexer config): {payload.title}",
            detail="Set indexer URL and API key in settings.",
            source="prowlarr",
            author=author.name,
            status="skipped",
        )
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Indexer URL and API key must be configured first.",
        )

    query = f"{payload.title} {author.name}"
    log_activity(
        message=f"Searching indexer for: {payload.title}",
        detail=f"Query: {query}",
        source="prowlarr",
        author=author.name,
        status="searching",
    )
    try:
        magnet = search_prowlarr(query, runtime_settings) or search_indexer_for_magnet(query, runtime_settings)
    except Exception as exc:
        logger.exception("Indexer search failed for %s", query)
        log_activity(
            message=f"Indexer search failed for: {payload.title}",
            detail=str(exc),
            source="prowlarr",
            author=author.name,
            status="error",
        )
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Indexer search failed: {exc}")

    if not magnet:
        log_activity(
            message=f"No magnet found for: {payload.title}",
            detail=f"Query: {query}",
            source="prowlarr",
            author=author.name,
            status="not_found",
        )
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No magnet found for this book")

    try:
        label = runtime_settings.get("deluge_label") or None
        deluge.add_torrent(magnet, label=label, runtime_settings=runtime_settings)
        log_activity(
            message=f"Requested download: {payload.title}",
            detail=f"Author: {author.name}",
            source="deluge",
            author=author.name,
            status="queued",
        )
        log_activity(
            message=f"Indexer found result for: {payload.title}",
            detail=f"Query: {query}",
            source="prowlarr",
            author=author.name,
            status="found",
        )
        return {"status": "queued", "message": "Download sent to Deluge"}
    except Exception as exc:
        logger.exception("Failed to send torrent to Deluge for %s", payload.title)
        log_activity(
            message=f"Download failed to queue: {payload.title}",
            detail=f"Author: {author.name} — {exc} — {traceback.format_exc()}",
            source="deluge",
            author=author.name,
            status="error",
        )
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Failed to queue download: {exc}")


# ============================================================
# PLACEHOLDER LOCAL IMPORT
# ============================================================
@app.post("/library/import")
def import_library(payload: schemas.LibraryImportRequest):
    logger.info("Local library import requested: %s", payload)
    return {
        "status": "queued",
        "note": "Local folder import not implemented (only ABS import available).",
    }


# ============================================================
# AUDIOBOOKSHELF IMPORT
# ============================================================
@app.post("/library/import/bookshelf")
def import_bookshelf(dry_run: bool = True, db: Session = Depends(get_db)):
    base_url, api_key = settings_store.get_abs_config(db)
    if not base_url or not api_key:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Audiobookshelf base URL and API key must be configured first.",
        )

    try:
        client = BookshelfClient(base_url, api_key)
        raw_items = client.get_all_items()

        normalized = [client.normalize_item(i) for i in raw_items]

        results = import_bookshelf_items(db, normalized, dry_run=dry_run)

        if dry_run:
            return {
                "status": "ok",
                "dry_run": True,
                "imported": len(results),
                "total_items": len(results),
                "items": results[:25],
                "note": "Dry-run sample only. Full import will process all items.",
            }

        return {
            "status": "ok",
            "dry_run": False,
            "imported": len(results),
        }

    except Exception as exc:
        logger.exception("Bookshelf import failed")
        raise HTTPException(500, str(exc))


# ============================================================
# AUTO-SYNC
# ============================================================
@app.get("/autosync/status")
def autosync_status():
    return get_autosync_status()


@app.post("/autosync/configure")
def autosync_configure(
    enabled: bool,
    interval_hours: int,
    db: Session = Depends(get_db),
):
    base_url, api_key = settings_store.get_abs_config(db)
    if enabled and (not base_url or not api_key):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Audiobookshelf base URL and API key must be configured to enable auto-sync.",
        )

    return configure_autosync(enabled, interval_hours, base_url, api_key)


@app.post("/autosync/sync-now")
def autosync_sync_now(db: Session = Depends(get_db)):
    base_url, api_key = settings_store.get_abs_config(db)
    if not base_url or not api_key:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Audiobookshelf base URL and API key must be configured first.",
        )

    return trigger_sync_now(base_url, api_key)


# ============================================================
# DELUGE
# ============================================================
@app.post("/downloads/deluge/add", response_model=schemas.AddTorrentResponse)
def add_torrent(payload: schemas.AddTorrentRequest, db: Session = Depends(get_db)):
    try:
        runtime_settings = settings_store.get_settings_values(db)
        label = payload.label or runtime_settings.get("deluge_label")
        deluge.add_torrent(payload.magnet_url, label=label, runtime_settings=runtime_settings)
        return schemas.AddTorrentResponse(status="queued", message="Torrent added to Deluge")
    except Exception as exc:
        raise HTTPException(502, f"Deluge error: {exc}")


# ============================================================
# SETTINGS
# ============================================================
@app.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    return settings_store.get_settings_snapshot(db)


@app.post("/settings")
def update_settings(payload: schemas.SettingsUpdateRequest, db: Session = Depends(get_db)):
    updated = settings_store.update_settings(payload.dict(exclude_none=True), db)
    return {"status": "ok", "settings": updated}
