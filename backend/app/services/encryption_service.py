from base64 import urlsafe_b64decode

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


class EncryptionConfigurationError(RuntimeError):
    pass


def _fernet() -> Fernet:
    settings = get_settings()
    key = settings.fernet_key
    if not key:
        raise EncryptionConfigurationError("FERNET_KEY no configurado para cifrar campos sensibles.")
    try:
        urlsafe_b64decode(key)
        return Fernet(key.encode("utf-8"))
    except Exception as exc:
        raise EncryptionConfigurationError("FERNET_KEY no es una clave Fernet valida.") from exc


def encrypt_optional(value: str | None) -> bytes | None:
    if value is None or value == "":
        return None
    return _fernet().encrypt(value.encode("utf-8"))


def decrypt_optional(value: bytes | None) -> str | None:
    if value is None:
        return None
    try:
        return _fernet().decrypt(value).decode("utf-8")
    except (EncryptionConfigurationError, InvalidToken):
        return None

