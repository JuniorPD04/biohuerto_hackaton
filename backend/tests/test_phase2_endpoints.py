import os
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://app_bio_user:dummy@127.0.0.1:5432/biohuerto")
os.environ.setdefault("SECRET_KEY", "test-secret-key-with-at-least-32-chars")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")
os.environ.setdefault("COOKIE_SECURE", "true")

from fastapi.testclient import TestClient

from app.database import get_session
from app.dependencies import get_current_user
from app.main import app
from app.schemas.users import CurrentUser
from app.services.security import REFRESH_COOKIE_NAME, create_refresh_token, hash_password


NOW = datetime(2026, 5, 31, 12, 0, tzinfo=UTC)


class FakeMappings:
    def __init__(self, rows):
        self.rows = rows

    def first(self):
        return self.rows[0] if self.rows else None

    def one(self):
        if not self.rows:
            raise AssertionError("Expected one row, got none")
        return self.rows[0]

    def all(self):
        return self.rows


class FakeResult:
    def __init__(self, rows=None, scalar=None):
        self.rows = rows or []
        self._scalar = scalar
        self.rowcount = 1

    def mappings(self):
        return FakeMappings(self.rows)

    def scalar_one_or_none(self):
        if self._scalar is not None:
            return self._scalar
        if not self.rows:
            return None
        return next(iter(self.rows[0].values()))

    def scalar_one(self):
        if self._scalar is not None:
            return self._scalar
        if not self.rows:
            raise AssertionError("Expected scalar row, got none")
        return next(iter(self.rows[0].values()))

    def first(self):
        return self.rows[0] if self.rows else None

    def all(self):
        return self.rows


class FakeSession:
    def __init__(self, results):
        self.results = list(results)
        self.calls = []
        self.committed = False

    async def execute(self, statement, params=None):
        self.calls.append((str(statement), params or {}))
        if not self.results:
            raise AssertionError(f"No fake result queued for SQL: {statement}")
        return self.results.pop(0)

    async def commit(self):
        self.committed = True

    def begin_nested(self):
        class Nested:
            async def __aenter__(inner_self):
                return self

            async def __aexit__(inner_self, exc_type, exc, tb):
                return False

        return Nested()


def user_row(**overrides):
    row = {
        "id": 2,
        "email": "productor.demo@biohuerto.pe",
        "password_hash": hash_password("Demo123!"),
        "nombre": "Rosa Campos",
        "rol": "productor",
        "is_active": True,
        "created_at": NOW,
        "updated_at": NOW,
        "telefono_encrypted": None,
        "direccion_encrypted": None,
    }
    row.update(overrides)
    return row


def biohuerto_row(**overrides):
    row = {
        "id": 1,
        "user_id": 2,
        "nombre": "Biohuerto Demo",
        "codigo": "BH-DEMO",
        "ubicacion_referencia_encrypted": None,
        "area_m2": Decimal("42.50"),
        "descripcion": "Biohuerto comunitario",
        "created_at": NOW,
        "updated_at": NOW,
        "grid_filas": 4,
        "grid_columnas": 4,
    }
    row.update(overrides)
    return row


def cultivo_row(**overrides):
    row = {
        "id": UUID("11111111-1111-4111-8111-111111111111"),
        "biohuerto_id": 1,
        "user_id": 2,
        "especie": "Lechuga",
        "variedad": "Seda",
        "etapa": "crecimiento",
        "fecha_siembra": date(2026, 5, 10),
        "fecha_estimada_cosecha": date(2026, 6, 25),
        "cantidad": Decimal("80.00"),
        "area_m2": Decimal("12.00"),
        "campania": "Campania mayo 2026",
        "etapa_id": 2,
        "especie_id": 1,
        "unidad_id": 1,
        "campania_id": 1,
        "celda_fila": None,
        "celda_columna": None,
        "notas": "Cultivo demo",
        "is_synced": True,
        "created_at": NOW,
        "updated_at": NOW,
    }
    row.update(overrides)
    return row


def override_session(fake_session):
    async def _override():
        yield fake_session

    return _override


def override_current_user(role="productor"):
    async def _override():
        return CurrentUser(
            id=2,
            email="productor.demo@biohuerto.pe",
            nombre="Rosa Campos",
            rol=role,
            is_active=True,
        )

    return _override


def client_with_overrides(fake_session=None, role=None):
    app.dependency_overrides.clear()
    if fake_session is not None:
        app.dependency_overrides[get_session] = override_session(fake_session)
    if role is not None:
        app.dependency_overrides[get_current_user] = override_current_user(role)
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.clear()


def test_register_returns_access_token_and_secure_refresh_cookie():
    fake = FakeSession(
        [
            FakeResult(scalar=None),
            FakeResult(rows=[user_row(password_hash="hashed")]),
        ]
    )
    client = client_with_overrides(fake)

    response = client.post(
        "/auth/register",
        json={
            "email": "nuevo.productor@biohuerto.pe",
            "password": "Demo123!",
            "nombre": "Nuevo Productor",
            "rol": "productor",
        },
    )

    assert response.status_code == 201
    assert response.json()["access_token"]
    assert response.json()["user"]["rol"] == "consumidor"
    cookie = response.headers["set-cookie"].lower()
    assert REFRESH_COOKIE_NAME in cookie
    assert "httponly" in cookie
    assert "secure" in cookie
    assert "samesite=lax" in cookie
    assert fake.committed is True


def test_login_rejects_wrong_password():
    fake = FakeSession([FakeResult(rows=[user_row()])])
    client = client_with_overrides(fake)

    response = client.post(
        "/auth/login",
        json={"email": "productor.demo@biohuerto.pe", "password": "incorrecta"},
    )

    assert response.status_code == 401


def test_refresh_uses_httponly_cookie_and_returns_new_access_token():
    fake = FakeSession([FakeResult(rows=[user_row(password_hash="hidden")])])
    client = client_with_overrides(fake)
    refresh_token = create_refresh_token(subject=2, role="productor")
    client.cookies.set(REFRESH_COOKIE_NAME, refresh_token)

    response = client.post("/auth/refresh")

    assert response.status_code == 200
    assert response.json()["access_token"]


def test_biohuertos_are_protected_without_bearer_token():
    client = client_with_overrides()

    response = client.get("/api/biohuertos")

    assert response.status_code == 401


def test_list_biohuertos_for_current_productor():
    fake = FakeSession([FakeResult(rows=[biohuerto_row()])])
    client = client_with_overrides(fake, role="productor")

    response = client.get("/api/biohuertos")

    assert response.status_code == 200
    assert response.json()[0]["codigo"] == "BH-DEMO"


def test_consumer_cannot_create_biohuerto():
    client = client_with_overrides(FakeSession([]), role="consumidor")

    response = client.post(
        "/api/biohuertos",
        json={"nombre": "Huerto", "codigo": "BH-NEW", "area_m2": "10.00"},
    )

    assert response.status_code == 403


def test_create_cultivo_for_owned_biohuerto():
    fake = FakeSession(
        [
            FakeResult(rows=[{"user_id": 2}]),
            FakeResult(rows=[{"grid_filas": 4, "grid_columnas": 4}]),
            FakeResult(rows=[]),
            FakeResult(scalar=UUID("11111111-1111-4111-8111-111111111111")),
            FakeResult(rows=[]),
            FakeResult(rows=[]),
            FakeResult(rows=[]),
            FakeResult(rows=[cultivo_row(etapa="semillero")]),
        ]
    )
    client = client_with_overrides(fake, role="productor")

    response = client.post(
        "/api/cultivos",
        json={
            "biohuerto_id": "11111111-1111-4111-8111-111111111111",
            "especie_id": 1,
            "variedad": "Seda",
            "etapa": "semillero",
            "fecha_siembra": "2026-05-10",
            "fecha_estimada_cosecha": "2026-06-25",
            "cantidad": "80.00",
            "area_m2": "12.00",
            "campania": "Campania mayo 2026",
            "celda_fila": 1,
            "celda_columna": 1,
        },
    )

    assert response.status_code == 201
    assert response.json()["especie"] == "Lechuga"
    assert fake.committed is True
