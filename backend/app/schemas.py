from typing import List, Optional
from pydantic import BaseModel


# ============================================================
#  NARRATOR SCHEMAS (NEW)
# ============================================================
class NarratorBase(BaseModel):
    name: str


class NarratorCreate(NarratorBase):
    pass


class Narrator(NarratorBase):
    id: int

    class Config:
        orm_mode = True


# ============================================================
#  BOOK SCHEMAS
# ============================================================
class BookBase(BaseModel):
    title: str
    ol_id: Optional[str] = None
    first_publish_year: Optional[int] = None

    # OpenLibrary cover
    cover_url: Optional[str] = None

    # NEW: ABS cover override
    abs_cover_url: Optional[str] = None


class BookCreate(BookBase):
    author_id: int
    narrators: Optional[List[str]] = None  # names only


class Book(BookBase):
    id: int
    author_id: int

    # Narrators as objects
    narrators: List[Narrator] = []

    class Config:
        orm_mode = True


# ============================================================
#  AUTHOR SCHEMAS
# ============================================================
class AuthorBase(BaseModel):
    name: str
    ol_id: Optional[str] = None            # <-- FIXED
    image_url: Optional[str] = None
    monitored: bool = True


class AuthorCreate(AuthorBase):
    pass


class Author(AuthorBase):
    id: int
    book_count: int = 0

    class Config:
        orm_mode = True


# ============================================================
#  SEARCH RESULT SCHEMA
# ============================================================
class AuthorSearchResult(BaseModel):
    name: str
    ol_id: Optional[str] = None            # <-- FIXED, OL sometimes missing
    image_url: Optional[str] = None
    top_work: Optional[str] = None


# ============================================================
#  IMPORTS / TORRENT SCHEMAS
# ============================================================
class LibraryImportRequest(BaseModel):
    path: Optional[str] = None
    dry_run: bool = True


class AddTorrentRequest(BaseModel):
    magnet_url: str
    label: Optional[str] = None


class AddTorrentResponse(BaseModel):
    status: str
    message: Optional[str] = None


# ============================================================
#  SETTINGS
# ============================================================
class SettingsUpdateRequest(BaseModel):
    deluge_host: Optional[str] = None
    deluge_port: Optional[str] = None
    deluge_password: Optional[str] = None
    deluge_url: Optional[str] = None
    deluge_label: Optional[str] = None
    indexer_url: Optional[str] = None
    indexer_api_key: Optional[str] = None
    abs_base_url: Optional[str] = None
    abs_api_key: Optional[str] = None

    class Config:
        extra = "ignore"
