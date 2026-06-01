from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"


def _venv_python() -> Path | None:
    candidates = [
        ROOT_DIR / ".venv" / "Scripts" / "python.exe",
        ROOT_DIR / ".venv" / "bin" / "python",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _running_inside_venv() -> bool:
    return Path(sys.prefix).resolve() == (ROOT_DIR / ".venv").resolve()


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'").strip('"'))


def main() -> int:
    venv_python = _venv_python()
    if venv_python and not _running_inside_venv():
        return subprocess.call([str(venv_python), str(__file__), *sys.argv[1:]], cwd=ROOT_DIR)

    _load_env_file(ROOT_DIR / ".env")
    _load_env_file(BACKEND_DIR / ".env")

    os.environ.setdefault("APP_NAME", "Biohuerto Inteligente")
    os.environ.setdefault("ENVIRONMENT", "development")
    os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    os.environ.setdefault("COOKIE_SECURE", "true")
    os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://app_bio_user:change-me-app-password@127.0.0.1:5432/biohuerto")
    os.environ.setdefault("SECRET_KEY", "dev-only-change-this-secret-key-32-chars")

    host = os.environ.get("BACKEND_HOST", "127.0.0.1")
    port = os.environ.get("BACKEND_PORT", "8000")
    reload_flag = os.environ.get("BACKEND_RELOAD", "true").lower() in {"1", "true", "yes", "on"}

    command = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        host,
        "--port",
        port,
    ]
    if reload_flag:
        command.append("--reload")

    print(f"Backend disponible en http://{host}:{port}")
    print(f"Swagger UI: http://{host}:{port}/docs")
    return subprocess.call(command, cwd=BACKEND_DIR)


if __name__ == "__main__":
    raise SystemExit(main())
