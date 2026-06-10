from app.services.rag import _chunk_text, normalize_fuente


def test_normalize_fuente_uses_filename_and_removes_path_separators():
    fuente = normalize_fuente(None, "manual-biohuerto.pdf")
    sanitized = normalize_fuente("..\\guias/manual-biohuerto", None)

    assert fuente == "manual-biohuerto"
    assert sanitized == ".. guias manual-biohuerto"


def test_chunk_text_keeps_overlap_for_long_markdown():
    raw = "\n\n".join(
        [
            "Primer bloque de manejo organico para enfermedades foliares.",
            "Segundo bloque con recomendaciones de poda sanitaria y ventilacion.",
            "Tercer bloque sobre biopreparados preventivos para biohuertos urbanos.",
        ]
    )

    chunks = _chunk_text(raw)

    assert chunks
    assert "Primer bloque" in chunks[0]
    assert "biohuertos urbanos" in chunks[-1]
