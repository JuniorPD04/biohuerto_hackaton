import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

/**
 * Selector de ubicación amigable: buscador con autocompletado de Google Places,
 * dictado por voz (Web Speech API), "usar mi ubicación" y mapa interactivo.
 *
 * Si se pasa `areaM2`, dibuja automáticamente un CUADRADO de esa área (lado =
 * √area) centrado en la ubicación elegida — sin que el usuario tenga que dibujar.
 *
 * Props:
 *  - value:    dirección inicial (texto)
 *  - onChange: (direccion, coords|null) => void
 *  - areaM2:   número (m²) — si > 0 y hay ubicación, dibuja el cuadrado
 *  - label, hint, country
 *
 * Si no hay API key o falla la carga, cae a un input de texto normal.
 */

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const LIMA = { lat: -12.0464, lng: -77.0428 };
// Resultados de Geocoding "precisos" (calle/lugar). Si el match es vago
// (país/región), no sobreescribimos lo que el usuario dictó/escribió.
const PRECISE_TYPES = [
  "street_address", "route", "premise", "subpremise",
  "establishment", "point_of_interest", "intersection", "plus_code",
];
const INPUT_CLS =
  "w-full rounded-xl border border-line bg-white px-[14px] py-3 text-[15px] text-text outline-none transition-all focus:border-primary focus:shadow-[0_0_0_3px_rgba(31,90,53,.12)]";

let mapsPromise = null;
function loadGoogleMaps() {
  if (typeof window !== "undefined" && window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    if (!MAPS_KEY) return reject(new Error("missing-key"));
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places,geometry&language=es&region=PE`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.google.maps);
    s.onerror = () => {
      mapsPromise = null;
      reject(new Error("load-failed"));
    };
    document.head.appendChild(s);
  });
  return mapsPromise;
}

const SpeechRecognition =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export default function AddressPicker({
  value = "",
  onChange,
  label = "Dirección",
  hint,
  country = "pe",
  areaM2 = 0,
  initialCenter = null, // { lat, lng } para centrar/dibujar al editar
}) {
  const inputRef = useRef(null);
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);
  const squareRef = useRef(null);
  const centerRef = useRef(null);
  const areaRef = useRef(0);
  areaRef.current = Number(areaM2) || 0;
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [listening, setListening] = useState(false);
  const [geolocating, setGeolocating] = useState(false);
  const [geoError, setGeoError] = useState("");

  // Dibuja / redimensiona / borra el cuadrado del área sobre el centro elegido.
  const syncSquare = useCallback((fit = false) => {
    const maps = window.google?.maps;
    if (!maps?.geometry || !mapRef.current) return;
    const center = centerRef.current;
    const m2 = areaRef.current;
    if (!center || !m2 || m2 <= 0) {
      if (squareRef.current) {
        squareRef.current.setMap(null);
        squareRef.current = null;
      }
      return;
    }
    const side = Math.sqrt(m2); // lado en metros
    const half = (side / 2) * Math.SQRT2; // distancia centro→vértice
    const corners = [45, 135, 225, 315].map((h) =>
      maps.geometry.spherical.computeOffset(center, half, h),
    );
    if (squareRef.current) {
      squareRef.current.setPath(corners);
    } else {
      squareRef.current = new maps.Polygon({
        map: mapRef.current,
        paths: corners,
        fillColor: "#1f7a3d",
        fillOpacity: 0.18,
        strokeColor: "#1b4d2e",
        strokeWeight: 2,
        clickable: false,
      });
    }
    if (fit) {
      const bounds = new maps.LatLngBounds();
      corners.forEach((c) => bounds.extend(c));
      mapRef.current.fitBounds(bounds, 80);
    }
  }, []);

  const applyPlace = useCallback(
    (address, latlng) => {
      if (address != null && inputRef.current) inputRef.current.value = address;
      const r6 = (n) => Math.round(n * 1e6) / 1e6; // 6 decimales → cabe en NUMERIC(9,6)
      const coords = latlng ? { lat: r6(latlng.lat()), lng: r6(latlng.lng()) } : null;
      onChange?.(address ?? "", coords);
      if (latlng && mapRef.current && markerRef.current) {
        mapRef.current.panTo(latlng);
        mapRef.current.setZoom(17);
        markerRef.current.setPosition(latlng);
        markerRef.current.setVisible(true);
        centerRef.current = latlng;
        syncSquare(true); // recentra/redibuja el cuadro y encuadra
      }
    },
    [onChange, syncSquare],
  );

  const reverse = useCallback(
    (latlng) => {
      geocoderRef.current?.geocode({ location: latlng }, (res, st) => {
        applyPlace(st === "OK" && res[0] ? res[0].formatted_address : "", latlng);
      });
    },
    [applyPlace],
  );

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !mapDivRef.current) return;
        const map = new maps.Map(mapDivRef.current, {
          center: LIMA,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        const marker = new maps.Marker({ map, draggable: true, visible: false, animation: maps.Animation.DROP });
        mapRef.current = map;
        markerRef.current = marker;
        geocoderRef.current = new maps.Geocoder();

        const ac = new maps.places.Autocomplete(inputRef.current, {
          fields: ["formatted_address", "geometry"],
          componentRestrictions: { country },
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (place.geometry?.location) applyPlace(place.formatted_address, place.geometry.location);
        });
        map.addListener("click", (e) => reverse(e.latLng));
        marker.addListener("dragend", (e) => reverse(e.latLng));

        if (value && inputRef.current) inputRef.current.value = value;
        // Al editar: centra en la ubicación guardada (el cuadro lo dibuja el efecto del área).
        if (
          initialCenter &&
          Number.isFinite(Number(initialCenter.lat)) &&
          Number.isFinite(Number(initialCenter.lng))
        ) {
          const ll = new maps.LatLng(Number(initialCenter.lat), Number(initialCenter.lng));
          marker.setPosition(ll);
          marker.setVisible(true);
          centerRef.current = ll;
          map.setCenter(ll);
          map.setZoom(17);
        }
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redibuja el cuadrado cuando cambia el área (sin reencuadrar bruscamente,
  // salvo que recién aparezca el cuadro).
  useEffect(() => {
    if (status !== "ready") return;
    const hadSquare = !!squareRef.current;
    syncSquare(!hadSquare);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaM2, status]);

  const startVoice = () => {
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.lang = "es-PE";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setListening(true);
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      if (inputRef.current) inputRef.current.value = text;
      onChange?.(text, null); // conserva SIEMPRE lo dictado
      geocoderRef.current?.geocode({ address: text, componentRestrictions: { country } }, (res, st) => {
        if (st !== "OK" || !res[0]) return;
        const r = res[0];
        const precise = (r.types || []).some((t) => PRECISE_TYPES.includes(t));
        if (precise) {
          applyPlace(r.formatted_address, r.geometry.location);
        } else if (r.geometry?.location && mapRef.current) {
          mapRef.current.panTo(r.geometry.location);
          mapRef.current.setZoom(13);
        }
      });
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  const useMyLocation = () => {
    setGeoError("");
    if (!navigator.geolocation || !window.google?.maps) {
      setGeoError("Tu navegador no permite obtener la ubicación. Escríbela a mano abajo.");
      return;
    }
    setGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeolocating(false);
        const latlng = new window.google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        reverse(latlng);
      },
      () => {
        setGeolocating(false);
        setGeoError("No se pudo obtener tu ubicación (permiso denegado o sin señal). Escríbela a mano abajo.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Fallback sin mapa: input de texto simple.
  if (status === "error") {
    return (
      <label className="flex flex-col gap-[7px]">
        <span className="text-[13.5px] font-bold text-text">{label}</span>
        <input
          className={INPUT_CLS}
          defaultValue={value}
          placeholder="Av. Siempre Viva 123"
          onChange={(e) => onChange?.(e.target.value, null)}
        />
        <span className="text-xs text-muted-2">
          El mapa no está disponible (falta la API key de Google Maps). Puedes escribir la dirección a mano.
        </span>
      </label>
    );
  }

  const showSquareHint = areaRef.current > 0;

  return (
    <div className="flex h-full flex-col gap-[7px]">
      {label && <span className="text-[13.5px] font-bold text-text">{label}</span>}

      <div className="relative">
        <span className="pointer-events-none absolute left-[15px] top-1/2 -translate-y-1/2 text-muted-2">
          <Icon name="search" size={18} />
        </span>
        <input
          ref={inputRef}
          className={`${INPUT_CLS} pl-11 pr-[52px]`}
          placeholder="Busca o dicta la dirección…"
          defaultValue={value}
          onChange={(e) => onChange?.(e.target.value, null)}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        />
        {SpeechRecognition && (
          <button
            type="button"
            onClick={startVoice}
            title={listening ? "Escuchando…" : "Dictar dirección por voz"}
            className={`absolute right-[7px] top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center overflow-visible rounded-[10px] transition-colors ${
              listening ? "bg-[#b23a2e] text-white" : "bg-chip text-muted-1 hover:bg-accent-50 hover:text-primary"
            }`}
          >
            {listening && <span className="absolute inset-0 animate-ping rounded-[10px] bg-[#b23a2e] opacity-60" />}
            <Icon name="mic" size={18} className={`relative ${listening ? "animate-pulse" : ""}`} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={geolocating}
          className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-white px-[14px] py-2 text-[13px] font-bold text-primary transition-colors hover:bg-accent-50 disabled:opacity-60"
        >
          <Icon name={geolocating ? "refresh" : "pin"} size={16} className={geolocating ? "animate-spin" : ""} />
          {geolocating ? "Ubicando…" : "Usar mi ubicación actual"}
        </button>
        {listening && (
          <span className="inline-flex items-center gap-2 rounded-full bg-[#fbe1de] px-3 py-[7px] text-[12.5px] font-bold text-[#b23a2e]">
            <span className="h-2 w-2 animate-ping rounded-full bg-[#b23a2e]" />
            Escuchando… habla ahora
          </span>
        )}
      </div>
      {geoError && <span className="text-xs font-semibold text-[#b23a2e]">{geoError}</span>}

      <div className="relative min-h-[240px] flex-1">
        <div
          ref={mapDivRef}
          className="absolute inset-0 h-full w-full overflow-hidden rounded-xl border border-line bg-chip"
        />
        {status === "loading" && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-chip text-sm text-muted-2">
            <span className="flex items-center gap-2">
              <Icon name="refresh" size={16} className="animate-spin" /> Cargando mapa…
            </span>
          </div>
        )}
      </div>

      <span className="text-xs text-muted-2">
        {hint ||
          (showSquareHint
            ? "El cuadro verde muestra el área sobre la ubicación. Cambia la ubicación o el área y se redibuja solo."
            : "Elige la ubicación (busca, dicta 🎙️ o toca el mapa). Al ingresar el área, se dibuja el cuadro del terreno.")}
      </span>
    </div>
  );
}
