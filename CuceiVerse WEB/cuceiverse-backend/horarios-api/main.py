"""
Horarios API — FastAPI microservice (Async Version)
===================================================
Expone el scraper de oferta académica de SIIAU como una API HTTP con tareas en segundo plano.

Iniciar:
  uvicorn main:app --port 8020 --reload
"""

import asyncio
import json
import os
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ofertas import exportar_excel, obtener_ciclo_actual, scrape_oferta

app = FastAPI(title="Horarios API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Thread pool para correr el scraping bloqueante
executor = ThreadPoolExecutor(max_workers=1)

# Estado global de la tarea en curso
_status = {
    "running": False,
    "last_result": None,
    "last_error": None,
    "total": 0,
    "ciclo": None,
    "centro": None,
    "progress": 0
}

if os.path.exists("horarios_cache.json"):
    try:
        with open("horarios_cache.json", "r", encoding="utf-8") as f:
            cached_data = json.load(f)
            _status["last_result"] = cached_data
            _status["total"] = len(cached_data)
            print(f"[Horarios API] Caché cargado: {len(cached_data)} materias iniciales.")
    except Exception as e:
        print(f"[Horarios API] Error al cargar caché: {e}")


def normalize_str(s: str) -> str:
    if not s: return ""
    return unicodedata.normalize('NFKD', str(s)).encode('ASCII', 'ignore').decode('ASCII').lower()


class ReloadRequest(BaseModel):
    ciclo: Optional[str] = None
    centro: Optional[str] = "D"


def run_scrape_background(ciclo: str, centro: str):
    global _status
    try:
        print(f"[Horarios API] Iniciando background scrape para {ciclo}...")
        datos = scrape_oferta(ciclo, centro)
        _status["last_result"] = datos
        _status["total"] = len(datos)
        _status["last_error"] = None
        
        with open("horarios_cache.json", "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False)
            print(f"[Horarios API] Datos guardados en horarios_cache.json")
    except Exception as e:
        print(f"[Horarios API] Error en background scrape: {e}")
        _status["last_error"] = str(e)
    finally:
        _status["running"] = False
        _status["ciclo"] = ciclo
        _status["centro"] = centro


@app.get("/ciclo")
def get_ciclo_actual():
    return {"ciclo": obtener_ciclo_actual()}


@app.post("/reload")
async def start_reload(req: ReloadRequest, background_tasks: BackgroundTasks):
    """
    Inicia un nuevo scraping en segundo plano. Retorna inmediatamente.
    """
    global _status

    if _status["running"]:
        return {"ok": True, "message": "Scraping ya en progreso", "running": True}

    ciclo = req.ciclo or obtener_ciclo_actual()
    centro = req.centro or "D"

    _status["running"] = True
    _status["last_error"] = None
    _status["last_result"] = None
    _status["total"] = 0

    background_tasks.add_task(run_scrape_background, ciclo, centro)

    return {
        "ok": True,
        "message": "Scraping iniciado en segundo plano",
        "running": True,
        "ciclo": ciclo,
        "centro": centro
    }


@app.get("/reload/status")
def reload_status():
    """Retorna el estado de la tarea y el resultado si ya terminó."""
    return {
        "running": _status["running"],
        "hasResult": _status["last_result"] is not None,
        "lastError": _status["last_error"],
        "total": _status["total"],
        "ciclo": _status["ciclo"],
        "centro": _status["centro"],
        "materias": _status["last_result"] if not _status["running"] and _status["last_result"] else None
    }


@app.get("/search")
def search_oferta(
    q: Optional[str] = None,
    profesor: Optional[str] = None,
    materia: Optional[str] = None,
    edificio: Optional[str] = None,
    dia: Optional[str] = None,
    hora: Optional[str] = None,
    limit: int = 15
):
    if not _status["last_result"]:
        return {"error": "No hay datos de oferta cargados. Ejecuta /reload primero.", "materias": []}
    
    resultados = _status["last_result"]
    if q:
        q_norm = normalize_str(q)
        resultados = [m for m in resultados if q_norm in normalize_str(m.get("Materia", "")) or q_norm in normalize_str(m.get("Profesor", ""))]
    if profesor:
        p_norm = normalize_str(profesor)
        resultados = [m for m in resultados if p_norm in normalize_str(m.get("Profesor", ""))]
    if materia:
        m_norm = normalize_str(materia)
        resultados = [m for m in resultados if m_norm in normalize_str(m.get("Materia", ""))]
    if edificio:
        e_norm = normalize_str(edificio)
        resultados = [m for m in resultados if e_norm in normalize_str(m.get("Edificio", ""))]
    if dia:
        d_norm = normalize_str(dia)
        resultados = [m for m in resultados if d_norm in normalize_str(m.get("Dias", ""))]
    if hora:
        resultados = [m for m in resultados if hora in str(m.get("Hora", ""))]
        
    return {"total": len(resultados), "materias": resultados[:limit]}


@app.post("/export")
async def export_oferta(req: ReloadRequest = ReloadRequest()):
    """
    Scraping + exporta a Excel (Bloqueante, pero conservado para scripts).
    """
    ciclo = req.ciclo or obtener_ciclo_actual()
    centro = req.centro or "D"

    loop = asyncio.get_event_loop()
    try:
        datos = await loop.run_in_executor(executor, lambda: scrape_oferta(ciclo, centro))
        ruta = exportar_excel(datos, ciclo, centro)
        return {"ok": True, "archivo": ruta}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {"status": "ok", "service": "horarios-api"}
