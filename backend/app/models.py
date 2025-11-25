from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from .database import Base


# ============================================================
#  AUTHOR
# ============================================================
class Author(Base):
    __tablename__ = "authors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    ol_id = Column(String, nullable=False, unique=True, index=True)
    image_url = Column(String, nullable=True)
    monitored = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    books = relationship(
        "Book", back_populates="author", cascade="all, delete-orphan"
    )


# ============================================================
#  BOOK
# ============================================================
class Book(Base):
    __tablename__ = "books"
    __table_args__ = (UniqueConstraint("author_id", "title", name="uq_author_title"),)

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)

    # OpenLibrary metadata
    ol_id = Column(String, index=True, nullable=True)
    first_publish_year = Column(Integer, nullable=True)
    cover_url = Column(String, nullable=True)

    # NEW: ABS cover (preferred)
    abs_cover_url = Column(String, nullable=True)

    author_id = Column(
        Integer, ForeignKey("authors.id", ondelete="CASCADE"), nullable=False
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    author = relationship("Author", back_populates="books")

    # NEW: Many-to-many narrator relationship
    narrators = relationship(
        "Narrator",
        secondary="book_narrators",
        back_populates="books",
        cascade="all",
    )


# ============================================================
#  NARRATOR (NEW)
# ============================================================
class Narrator(Base):
    __tablename__ = "narrators"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)

    # Relationship back to books
    books = relationship(
        "Book",
        secondary="book_narrators",
        back_populates="narrators",
    )


# ============================================================
#  BOOK ↔ NARRATOR LINK TABLE (NEW)
# ============================================================
class BookNarrator(Base):
    __tablename__ = "book_narrators"

    id = Column(Integer, primary_key=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"))
    narrator_id = Column(Integer, ForeignKey("narrators.id", ondelete="CASCADE"))


# ============================================================
#  APP SETTINGS (key/value)
# ============================================================
class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=True)
