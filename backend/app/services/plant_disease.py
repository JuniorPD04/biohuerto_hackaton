"""Diagnóstico fitosanitario por imagen usando un modelo local (ResNet50 / PlantVillage).

El modelo se descarga una sola vez desde Hugging Face (mesabo/agri-plant-disease-resnet50)
y se cachea en disco (volumen hf_cache). La inferencia corre en CPU y se ejecuta en un
hilo aparte para no bloquear el event loop de FastAPI.
"""

import asyncio
import io
from dataclasses import dataclass
from threading import Lock

from PIL import Image

from app.schemas.diagnostico import DiagnosticoAlternativaResult, DiagnosticoResult

MODEL_NAME = "mesabo/agri-plant-disease-resnet50"

# Top-1 + alternativas a devolver.
TOP_K = 3

# Traducción de las 38 clases del dataset PlantVillage:
# raw_label -> (cultivo, nombre del problema, nombre científico o None si está sano)
_LABELS_ES: dict[str, tuple[str, str, str | None]] = {
    "Apple___Apple_scab": ("Manzano", "Sarna del manzano", "Venturia inaequalis"),
    "Apple___Black_rot": ("Manzano", "Podredumbre negra", "Botryosphaeria obtusa"),
    "Apple___Cedar_apple_rust": ("Manzano", "Roya del cedro y el manzano", "Gymnosporangium juniperi-virginianae"),
    "Apple___healthy": ("Manzano", "Planta sana", None),
    "Blueberry___healthy": ("Arándano", "Planta sana", None),
    "Cherry_(including_sour)___Powdery_mildew": ("Cerezo", "Oídio (cenicilla)", "Podosphaera clandestina"),
    "Cherry_(including_sour)___healthy": ("Cerezo", "Planta sana", None),
    "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot": ("Maíz", "Mancha gris de la hoja", "Cercospora zeae-maydis"),
    "Corn_(maize)___Common_rust_": ("Maíz", "Roya común", "Puccinia sorghi"),
    "Corn_(maize)___Northern_Leaf_Blight": ("Maíz", "Tizón foliar del norte", "Exserohilum turcicum"),
    "Corn_(maize)___healthy": ("Maíz", "Planta sana", None),
    "Grape___Black_rot": ("Vid", "Podredumbre negra", "Guignardia bidwellii"),
    "Grape___Esca_(Black_Measles)": ("Vid", "Esca (sarampión negro)", "Phaeomoniella chlamydospora"),
    "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)": ("Vid", "Tizón foliar (mancha de Isariopsis)", "Pseudocercospora vitis"),
    "Grape___healthy": ("Vid", "Planta sana", None),
    "Orange___Haunglongbing_(Citrus_greening)": ("Naranjo", "Huanglongbing (dragón amarillo de los cítricos)", "Candidatus Liberibacter spp."),
    "Peach___Bacterial_spot": ("Durazno", "Mancha bacteriana", "Xanthomonas arboricola pv. pruni"),
    "Peach___healthy": ("Durazno", "Planta sana", None),
    "Pepper,_bell___Bacterial_spot": ("Pimiento", "Mancha bacteriana", "Xanthomonas campestris pv. vesicatoria"),
    "Pepper,_bell___healthy": ("Pimiento", "Planta sana", None),
    "Potato___Early_blight": ("Papa", "Tizón temprano", "Alternaria solani"),
    "Potato___Late_blight": ("Papa", "Tizón tardío", "Phytophthora infestans"),
    "Potato___healthy": ("Papa", "Planta sana", None),
    "Raspberry___healthy": ("Frambuesa", "Planta sana", None),
    "Soybean___healthy": ("Soya", "Planta sana", None),
    "Squash___Powdery_mildew": ("Calabaza", "Oídio (cenicilla)", "Erysiphe cichoracearum"),
    "Strawberry___Leaf_scorch": ("Fresa", "Quemadura foliar", "Diplocarpon earlianum"),
    "Strawberry___healthy": ("Fresa", "Planta sana", None),
    "Tomato___Bacterial_spot": ("Tomate", "Mancha bacteriana", "Xanthomonas spp."),
    "Tomato___Early_blight": ("Tomate", "Tizón temprano", "Alternaria solani"),
    "Tomato___Late_blight": ("Tomate", "Tizón tardío", "Phytophthora infestans"),
    "Tomato___Leaf_Mold": ("Tomate", "Moho de la hoja", "Passalora fulva"),
    "Tomato___Septoria_leaf_spot": ("Tomate", "Mancha foliar de septoria", "Septoria lycopersici"),
    "Tomato___Spider_mites Two-spotted_spider_mite": ("Tomate", "Ácaro de dos manchas (araña roja)", "Tetranychus urticae"),
    "Tomato___Target_Spot": ("Tomate", "Mancha diana", "Corynespora cassiicola"),
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus": ("Tomate", "Virus del rizado amarillo de la hoja", "Begomovirus TYLCV"),
    "Tomato___Tomato_mosaic_virus": ("Tomate", "Virus del mosaico del tomate", "Tobamovirus ToMV"),
    "Tomato___healthy": ("Tomate", "Planta sana", None),
}


def _translate(raw_label: str) -> tuple[str, str | None, bool]:
    """Devuelve (descripción legible, nombre científico, es_sano) para una clase del modelo."""
    info = _LABELS_ES.get(raw_label)
    if info is None:
        # Etiqueta no reconocida: se muestra una versión legible del label crudo.
        bonito = raw_label.replace("___", " - ").replace("_", " ").strip()
        return bonito, None, "healthy" in raw_label.lower()

    cultivo, problema, nombre_cientifico = info
    es_sano = nombre_cientifico is None and problema == "Planta sana"
    descripcion = f"{problema} ({cultivo})" if not es_sano else f"Planta sana ({cultivo})"
    return descripcion, nombre_cientifico, es_sano


@dataclass
class _ModelBundle:
    model: object
    processor: object


_bundle: _ModelBundle | None = None
_bundle_lock = Lock()


def _load_bundle() -> _ModelBundle:
    global _bundle
    if _bundle is not None:
        return _bundle
    with _bundle_lock:
        if _bundle is None:
            from transformers import AutoImageProcessor, AutoModelForImageClassification

            model = AutoModelForImageClassification.from_pretrained(MODEL_NAME)
            processor = AutoImageProcessor.from_pretrained(MODEL_NAME)
            model.eval()
            _bundle = _ModelBundle(model=model, processor=processor)
    return _bundle


def _classify(image_bytes: bytes) -> DiagnosticoResult:
    import torch

    bundle = _load_bundle()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    inputs = bundle.processor(images=image, return_tensors="pt")

    with torch.no_grad():
        outputs = bundle.model(**inputs)
        probs = torch.nn.functional.softmax(outputs.logits, dim=-1)[0]

    k = min(TOP_K, probs.shape[-1])
    top_probs, top_idx = torch.topk(probs, k=k)

    id2label = bundle.model.config.id2label
    ranked = [
        (id2label[int(idx)], float(prob))
        for prob, idx in zip(top_probs.tolist(), top_idx.tolist())
    ]

    top_label, top_prob = ranked[0]
    descripcion, nombre_cientifico, es_sano = _translate(top_label)

    alternativas = []
    for raw_label, prob in ranked[1:]:
        alt_desc, _, _ = _translate(raw_label)
        alternativas.append(DiagnosticoAlternativaResult(enfermedad=alt_desc, confianza=round(prob * 100, 1)))

    return DiagnosticoResult(
        problema=descripcion,
        nombre_cientifico=nombre_cientifico,
        confianza=round(top_prob * 100),
        alternativas=alternativas,
        es_sano=es_sano,
    )


async def diagnosticar_imagen(image_bytes: bytes) -> tuple[DiagnosticoResult, str]:
    """Ejecuta la clasificación en un hilo aparte para no bloquear el event loop."""
    result = await asyncio.to_thread(_classify, image_bytes)
    return result, MODEL_NAME
