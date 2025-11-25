import logging
from sqlalchemy.orm import Session

from . import models

logger = logging.getLogger(__name__)


# ============================================================
#  AUTHOR RESOLUTION (ABS ONLY — NO OPENLIBRARY)
# ============================================================
def resolve_author(db: Session, name: str) -> models.Author:
    """
    Ensure an Author exists for the given name.
    Does NOT use OpenLibrary.
    """

    existing = (
        db.query(models.Author)
        .filter(models.Author.name.ilike(name))
        .first()
    )
    if existing:
        return existing

    # Local-only author
    author = models.Author(
        name=name,
        ol_id=None,
        image_url=None,
        monitored=True
    )

    db.add(author)
    db.commit()
    db.refresh(author)
    return author


# ============================================================
#  BOOK RESOLUTION (ABS ONLY — NO OPENLIBRARY)
# ============================================================
def resolve_book(
    db: Session,
    author: models.Author,
    title: str,
    abs_cover_url: str | None = None
) -> models.Book:
    """
    Ensure a Book exists for the given title + author.
    Uses ONLY Audiobookshelf metadata.
    """

    existing = (
        db.query(models.Book)
        .filter(models.Book.author_id == author.id)
        .filter(models.Book.title.ilike(title))
        .first()
    )
    if existing:
        if abs_cover_url and not existing.abs_cover_url:
            existing.abs_cover_url = abs_cover_url
            db.commit()
        return existing

    # No OpenLibrary lookups here
    book = models.Book(
        title=title,
        ol_id=None,
        first_publish_year=None,
        cover_url=None,
        abs_cover_url=abs_cover_url,
        author_id=author.id,
    )

    db.add(book)
    db.commit()
    db.refresh(book)
    return book


# ============================================================
#  NARRATOR RESOLUTION (many-to-many)
# ============================================================
def resolve_narrators(db: Session, book: models.Book, narrator_names: list[str]):
    """
    Ensure narrators exist and attach them to the Book.
    """
    attached = set(n.name for n in book.narrators)

    for name in narrator_names:
        name = name.strip()
        if not name or name in attached:
            continue

        narrator = (
            db.query(models.Narrator)
            .filter(models.Narrator.name.ilike(name))
            .first()
        )

        if not narrator:
            narrator = models.Narrator(name=name)
            db.add(narrator)
            db.commit()
            db.refresh(narrator)

        if narrator not in book.narrators:
            book.narrators.append(narrator)

    db.commit()


# ============================================================
#  MAIN IMPORT PIPELINE
# ============================================================
def import_bookshelf_items(db: Session, items: list[dict], dry_run: bool = False):
    """
    Import Audiobookshelf items into BookArr.
    Each item is expected to be normalized by BookshelfClient.normalize_item().
    """

    results = []

    for raw_item in items:
        title = raw_item.get("title")
        authors = raw_item.get("authors") or []
        narrators = raw_item.get("narrators") or []
        abs_cover_url = raw_item.get("abs_cover_url")

        if not title or not authors:
            continue

        primary_author = authors[0].strip()

        if dry_run:
            results.append({
                "title": title,
                "authors": authors,
                "narrators": narrators,
                "abs_cover_url": abs_cover_url,
                "action": "would_import"
            })
            continue

        # 1. Resolve author locally
        author = resolve_author(db, primary_author)

        # 2. Create/resolve book
        book = resolve_book(
            db=db,
            author=author,
            title=title,
            abs_cover_url=abs_cover_url
        )

        # 3. Resolve narrators
        if narrators:
            resolve_narrators(db, book, narrators)

        results.append({
            "book_id": book.id,
            "title": book.title,
            "author": author.name,
            "narrators": [n.name for n in book.narrators],
            "abs_cover_url": book.abs_cover_url,
        })

    return results
