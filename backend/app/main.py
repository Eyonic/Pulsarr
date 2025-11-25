import logging
from typing import List

import requests
from fastapi import Depends, FastAPI, HTTPException, Query, status
from sqlalchemy import select, text
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

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Pulsarr Backend")


@app.on_event("startup")
def on_startup():
    """
    Initialize DB, seed default settings, and start auto-sync thread if enabled.
    """
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
        narrators=narrators
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
