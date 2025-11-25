from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_SERVER: str
    POSTGRES_PORT: str = "5432"

    # Deluge settings
    DELUGE_HOST: str = "deluge"
    DELUGE_PORT: str = "8112"
    DELUGE_PASSWORD: str = "deluge"  # set via env in production
    DELUGE_URL: str | None = None  # Optional full URL, e.g., http://127.0.0.1:8112
    DELUGE_LABEL: str = "bookarr"

    # Settings toggles (persisted via API in future)
    SETTINGS_ALLOW_RUNTIME_UPDATE: bool = True

    # Indexer (Torznab/Jackett/Prowlarr-like)
    INDEXER_URL: str | None = None
    INDEXER_API_KEY: str | None = None

    @property
    def DATABASE_URL(self):
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    class Config:
        env_file = ".env"

settings = Settings()
