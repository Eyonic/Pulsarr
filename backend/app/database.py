import time

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from .config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(max_attempts: int = 5, delay_seconds: int = 2):
    """Create tables with a simple retry to handle slow-starting databases."""
    # Imported here to avoid circular imports
    from . import models  # noqa: F401
    from sqlalchemy.exc import OperationalError

    attempt = 1
    while attempt <= max_attempts:
        try:
            Base.metadata.create_all(bind=engine)
            return
        except OperationalError:
            if attempt == max_attempts:
                raise
            time.sleep(delay_seconds)
            attempt += 1
