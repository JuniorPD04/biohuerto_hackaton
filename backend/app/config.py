from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="Biohuerto Inteligente", alias="APP_NAME")
    environment: str = Field(default="development", alias="ENVIRONMENT")
    database_url: str = Field(alias="DATABASE_URL")
    secret_key: str = Field(default="", alias="SECRET_KEY")
    algorithm: str = Field(default="HS256", alias="ALGORITHM")
    access_token_expire_minutes: int = Field(default=30, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=7, alias="REFRESH_TOKEN_EXPIRE_DAYS")
    cookie_secure: bool = Field(default=True, alias="COOKIE_SECURE")
    cors_origins_raw: str = Field(default="", alias="CORS_ORIGINS")
    # OpenAI: solo embeddings para el RAG (text-embedding-3-small = 1536 dim,
    # debe coincidir con VECTOR(1536) de rag_chunks en backend/init.sql).
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    openai_embed_model: str = Field(default="text-embedding-3-small", alias="OPENAI_EMBED_MODEL")
    # OpenRouter: vision (reconocimiento/diagnostico de plantas) y texto (recomendaciones).
    openrouter_api_key: str | None = Field(default=None, alias="OPENROUTER_API_KEY")
    openrouter_model_vision: str = Field(default="google/gemini-3-flash-preview", alias="OPENROUTER_MODEL_VISION")
    openrouter_model_text: str = Field(default="google/gemini-2.5-flash", alias="OPENROUTER_MODEL_TEXT")
    fernet_key: str | None = Field(default=None, alias="FERNET_KEY")
    # Clave simetrica de pgcrypto para cifrar/descifrar campos sensibles
    # (telefono/direccion) en SQL con pgp_sym_encrypt/pgp_sym_decrypt.
    # Debe coincidir con la usada en el seed (backend/seed.sql).
    pgcrypto_key: str = Field(default="bkey", alias="PGCRYPTO_KEY")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
