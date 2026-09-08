# Diagnóstico Técnico — Estudio de Mercado Educativo
**Fecha:** 2026-05-06  
**Rol:** Arquitecto de Software Senior  
**Alcance:** Análisis completo para migración a producción institucional

---

## 1. Estructura Actual del Proyecto

```
proyecto_mercado_educativo/          ← raíz del proyecto
├── server.py                        ← único backend (Python stdlib)
├── start.bat                        ← launcher Windows
├── CLAUDE.md                        ← documentación interna
├── __pycache__/                     ← artefactos compilados (no debe existir en repo)
└── dashboard/
    ├── index.html                   ← 208 KB, 3.118 líneas, monolito HTML
    └── ai-panel.js                  ← panel flotante de chat (~10 KB)
```

**Observaciones estructurales:**
- El proyecto tiene **6 archivos efectivos**. No hay separación de capas.
- No existe `requirements.txt`, `pyproject.toml`, `Dockerfile`, `.gitignore`, ni estructura de paquete.
- Todo el estado de la aplicación (URLs de notebooks, lógica de parsing) está hardcodeado en `server.py`.
- El `index.html` mezcla estructura, estilos inline, datos embebidos y lógica en un único archivo de 208 KB. No es mantenible a escala.
- No hay sistema de configuración (variables de entorno, archivos `.env`, config por ambiente).

---

## 2. Cómo se Sirve el Dashboard

**Mecanismo:** `http.server.SimpleHTTPRequestHandler` de la biblioteca estándar de Python.

```python
# server.py — líneas clave
server = HTTPServer(("localhost", PORT), DashboardHandler)
super().__init__(*args, directory=DASHBOARD_DIR, **kwargs)
```

**Características actuales:**
| Propiedad | Valor |
|-----------|-------|
| Servidor | `HTTPServer` (stdlib Python) |
| Modelo de concurrencia | **Single-threaded síncrono** |
| Puerto | 8090 (hardcodeado) |
| Host | `localhost` únicamente |
| Archivos estáticos | Servidos desde `./dashboard/` |
| HTTPS | No |
| Autenticación | No |
| Logging estructurado | No (solo `print()`) |

**Problema crítico:** `SimpleHTTPRequestHandler` es de un solo hilo. Una sola petición a `/api/query` bloquea el servidor completo hasta 180 segundos (el timeout configurado). Cualquier segundo usuario vería la interfaz colgada.

---

## 3. Cómo Funciona el Endpoint `/api/query`

**Flujo completo de una consulta:**

```
Browser → POST /api/query (JSON)
  → DashboardHandler.do_POST()
    → query_notebook(question, notebook_key)
      → subprocess.run([python, "scripts/run.py", "ask_question.py", ...])
        → run.py lanza ask_question.py en el venv del skill
          → ask_question.py abre Playwright/Patchright
            → navega a notebooklm.google.com
              → interactúa con el DOM (scraping)
                → extrae la respuesta
                  → devuelve texto por stdout
      → parse_notebooklm_answer(stdout)  ← parsing por delimitadores "===="
    → send_json(result)
← Browser recibe JSON
```

**Análisis del parser:**
```python
def parse_notebooklm_answer(raw_output: str) -> str:
    # Cuenta divisores "====" en stdout para localizar la respuesta
    # Si cambia el formato del script externo, el parser se rompe silenciosamente
```
Este parser es **frágil por diseño**: depende del formato textual de stdout de un script externo. Cualquier cambio en `ask_question.py` o en el output de NotebookLM rompe la respuesta sin error explícito.

**Tiempos de respuesta esperados:** 30–180 segundos por consulta (automación de navegador real). Inaceptable para producción.

---

## 4. Cómo se Conecta Actualmente con NotebookLM

**Tecnología:** Automatización de navegador (Playwright/Patchright) — screen scraping real.

```
server.py
  └── subprocess → scripts/run.py (en SKILL_DIR)
        └── ask_question.py
              └── patchright (fork de Playwright)
                    └── Chromium headless
                          └── notebooklm.google.com (DOM automation)
```

**Dependencias de la cadena de integración:**
- `~/.claude/skills/notebooklm/` — directorio del skill local de Claude Code
- `.venv` dentro del skill — entorno virtual con patchright instalado
- Sesión de Google activa guardada en estado de navegador (`state.json`)
- Cookies de sesión válidas (expiran; requieren re-autenticación manual)
- Acceso a internet hacia `notebooklm.google.com`
- Chromium instalado por Playwright en el sistema

**Modelo de autenticación:**
La sesión de Google se persiste en un archivo de estado del navegador. Si el estado tiene más de 7 días, el código emite una advertencia pero sigue intentando. Si expira totalmente, todas las consultas fallan sin retorno de error claro al usuario.

---

## 5. Dependencias con Localhost, Claude Code, Skills Locales y Rutas del Sistema

### Dependencias que IMPIDEN el despliegue institucional:

| Dependencia | Archivo | Riesgo |
|-------------|---------|--------|
| `~/.claude/skills/notebooklm/` | `server.py:SKILL_DIR` | Ruta absoluta del home de un usuario específico |
| `sys.executable` (Python del proceso padre) | `server.py:query_notebook` | El Python que lanza el subprocess es el mismo que corre el servidor |
| `localhost:8090` hardcodeado | `server.py:PORT` | No configurable por ambiente |
| `HTTPServer("localhost", ...)` | `server.py:main()` | Solo acepta conexiones locales, no bind 0.0.0.0 |
| Sesión de Google del usuario | `auth_manager.py` | Autenticación personal no trasladable |
| `start.bat` (Windows) | `start.bat` | No funciona en Linux/servidor |
| `os.path.expanduser("~")` | `server.py:SKILL_DIR` | Depende del home del usuario que ejecuta el proceso |
| Chromium headless en el servidor | implícito | Un servidor institucional no debe tener GUI/browser |
| `PYTHONIOENCODING=utf-8` como workaround | múltiples scripts | Parcheo de encoding que no debería existir |

**Resumen:** La integración con NotebookLM es fundamentalmente local y personal. No existe ningún mecanismo de API oficial de NotebookLM — la conexión es scraping de un servicio de terceros.

---

## 6. Riesgos para Producción

### Críticos (bloquean el despliegue)

| # | Riesgo | Causa | Impacto |
|---|--------|-------|---------|
| R1 | **Sin control de acceso** | No hay autenticación ni autorización | Cualquier persona con acceso a la red puede consultar los notebooks |
| R2 | **Single-threaded blocking** | `HTTPServer` síncrono + subprocess 180s | Un usuario bloquea el servidor para todos |
| R3 | **Dependencia de servicio de terceros no oficial** | Scraping de notebooklm.google.com | Google puede cambiar el DOM o bloquear la IP institucional en cualquier momento |
| R4 | **Sesión personal de Google** | `auth_manager.py` con cookies de usuario | La sesión expira; solo el usuario original puede renovarla |
| R5 | **Sin HTTPS** | `HTTPServer` sin TLS | Datos académicos sensibles en texto plano |
| R6 | **CORS wildcard** | `Access-Control-Allow-Origin: *` | Cualquier sitio puede hacer peticiones cross-origin al servidor |

### Altos (deben resolverse antes de producción)

| # | Riesgo | Causa | Impacto |
|---|--------|-------|---------|
| R7 | **Sin persistencia de conversaciones** | No hay base de datos | No se puede auditar qué preguntas se hicieron ni dar contexto continuo |
| R8 | **Datos embebidos en HTML** | `index.html` de 208 KB con datos hardcodeados | Actualizar datos requiere editar HTML manualmente |
| R9 | **Sin manejo de errores robusto** | Parser frágil, fallos silenciosos | Los errores no llegan claramente al usuario |
| R10 | **Sin monitoreo ni observabilidad** | Solo `print()` en consola | No hay logs estructurados, métricas, ni alertas |
| R11 | **Sin pruebas** | Zero cobertura de tests | No se puede verificar regresiones |
| R12 | **Timeout de 180s sin feedback** | El usuario espera sin indicación de progreso | Percepción de falla aunque el sistema esté procesando |

### Medios (deuda técnica)

- `index.html` monolítico de 208 KB imposible de mantener en equipo
- No hay versionado de la API (no hay `/v1/`)
- No hay rate limiting (posible abuso)
- No hay caché de respuestas (misma pregunta → nuevo scraping)
- `__pycache__` en el repositorio

---

## 7. Archivos que Deberían Reorganizarse

### Estructura objetivo:

```
proyecto_mercado_educativo/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              ← FastAPI app
│   │   ├── config.py            ← settings con Pydantic BaseSettings
│   │   ├── routers/
│   │   │   ├── query.py         ← POST /api/v1/query
│   │   │   ├── notebooks.py     ← GET /api/v1/notebooks
│   │   │   └── health.py        ← GET /health
│   │   ├── services/
│   │   │   ├── rag.py           ← pipeline RAG con pgvector
│   │   │   └── llm.py           ← cliente Ollama/Gemma
│   │   ├── db/
│   │   │   ├── models.py        ← SQLAlchemy models
│   │   │   └── migrations/      ← Alembic
│   │   └── schemas/
│   │       └── query.py         ← Pydantic schemas de request/response
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/
│   ├── index.html               ← refactorizado (datos desde API)
│   ├── ai-panel.js              ← adaptado (nuevo endpoint)
│   ├── data/                    ← JSONs de datos estáticos separados
│   │   ├── kpis.json
│   │   ├── competencia.json
│   │   └── tendencias.json
│   └── Dockerfile
├── data/
│   └── documents/               ← PDFs, fuentes del RAG
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 8. Partes del Código que se Pueden Conservar

### Conservar íntegramente:

| Componente | Razón |
|------------|-------|
| **`dashboard/index.html`** — estructura visual y datos de las 18 secciones | Es el activo de negocio real: KPIs, gráficos, análisis DOFA, recomendaciones. El trabajo analítico es correcto y valioso. |
| **`dashboard/ai-panel.js`** — UI del chat flotante | El diseño, estilos y lógica de interacción son sólidos. Solo necesita apuntar al nuevo endpoint. |
| Los datos de Chart.js (configuraciones de gráficos) | Las visualizaciones están bien diseñadas. Se pueden externalizar a JSON sin perder la lógica. |

### Conservar con adaptaciones menores:

| Componente | Adaptación necesaria |
|------------|---------------------|
| Lógica de selección de notebook en `ai-panel.js` | Cambiar `const API = '/api/query'` → `/api/v1/query` |
| Estructura de respuesta JSON de la API | Mantener `{ answer, notebook, source }` para compatibilidad con el frontend |
| La lista de notebooks en `server.py` | Mover a `config.py` o base de datos |

---

## 9. Partes que Deben Reemplazarse para Despliegue Institucional

### Reemplazar completamente:

| Componente actual | Reemplazo | Razón |
|-------------------|-----------|-------|
| `http.server.HTTPServer` | **FastAPI + Uvicorn** | Async, multi-worker, OpenAPI automático |
| `subprocess → ask_question.py` | **Pipeline RAG local** | Elimina dependencia de scraping externo |
| Integración NotebookLM (scraping) | **pgvector + embeddings + Ollama/Gemma** | RAG propio, sin dependencia de terceros, sin sesión personal |
| `parse_notebooklm_answer()` | Respuesta estructurada del LLM | Elimina parser frágil basado en stdout |
| `start.bat` | **Docker Compose** | Portabilidad, reproducibilidad |
| Datos hardcodeados en `index.html` | **Endpoints REST que sirven JSON** | Actualización sin tocar HTML |
| Sin autenticación | **JWT / OAuth2 institucional** | Control de acceso requerido |
| Sin base de datos | **PostgreSQL + pgvector** | Persistencia de conversaciones, embeddings, documentos |
| Logging por `print()` | **logging estructurado (JSON)** + exportación a sistema institucional | Observabilidad real |

---

## 10. Plan de Migración hacia Producción Institucional

### Visión de la arquitectura objetivo:

```
                    ┌─────────────────────────────────────────┐
                    │           Servidor Institucional          │
                    │                                           │
  Browser  ──────►  │  Nginx (reverse proxy + TLS)             │
                    │       │                                   │
                    │       ▼                                   │
                    │  ┌─────────────┐    ┌─────────────────┐  │
                    │  │   Frontend  │    │  FastAPI Backend │  │
                    │  │  (Nginx /   │    │  (Uvicorn,       │  │
                    │  │   estático) │    │   async, multi-  │  │
                    │  └─────────────┘    │   worker)        │  │
                    │                    │       │           │  │
                    │                    │       ▼           │  │
                    │                    │  ┌──────────┐     │  │
                    │                    │  │  RAG      │     │  │
                    │                    │  │ Pipeline  │     │  │
                    │                    │  └──────────┘     │  │
                    │                    │    │       │       │  │
                    │                    │    ▼       ▼       │  │
                    │                    │  ┌────┐ ┌──────┐  │  │
                    │                    │  │ PG │ │Ollama│  │  │
                    │                    │  │+   │ │Gemma │  │  │
                    │                    │  │pgv │ │      │  │  │
                    │                    │  └────┘ └──────┘  │  │
                    │                    └─────────────────┘  │  │
                    └─────────────────────────────────────────┘
```

---

### Fase 1 — Fundación (Semana 1-2)

**Objetivo:** Reemplazar el servidor sin cambiar el frontend.

**Tareas:**
1. Crear proyecto FastAPI con estructura de paquete
2. Implementar los mismos 3 endpoints (`/api/query`, `/api/notebooks`, `/api/status`) con FastAPI
3. Agregar `pyproject.toml` con dependencias declaradas
4. Implementar logging estructurado con `structlog` o el módulo `logging` de Python
5. Agregar `Dockerfile` básico para el backend
6. Crear `.env.example` y `config.py` con `pydantic-settings`
7. Reemplazar `SKILL_DIR` hardcodeado por variable de entorno

**Criterio de éxito:** El dashboard existente funciona sin cambios apuntando al nuevo servidor.

---

### Fase 2 — Base de Datos y RAG (Semana 3-4)

**Objetivo:** Reemplazar la integración con NotebookLM por RAG propio.

**Tareas:**
1. Levantar PostgreSQL 16 con extensión `pgvector`
2. Definir schema:
   ```sql
   -- documentos fuente
   CREATE TABLE documents (
     id UUID PRIMARY KEY,
     notebook TEXT NOT NULL,  -- 'ibague' | 'global'
     title TEXT,
     content TEXT,
     metadata JSONB,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   
   -- embeddings por chunk
   CREATE TABLE chunks (
     id UUID PRIMARY KEY,
     document_id UUID REFERENCES documents(id),
     content TEXT,
     embedding VECTOR(2048),  -- dimensión según modelo Gemma
     chunk_index INT
   );
   
   -- historial de conversaciones
   CREATE TABLE conversations (
     id UUID PRIMARY KEY,
     session_id TEXT,
     notebook TEXT,
     question TEXT,
     answer TEXT,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```
3. Implementar pipeline de ingesta: PDF/DOCX → chunks → embeddings → pgvector
4. Descargar los documentos fuente de los dos notebooks (PDI, OCDE, UNESCO, Deloitte, etc.) y procesarlos
5. Implementar el endpoint `/api/v1/query` con búsqueda vectorial:
   ```
   question → embedding → similarity_search(pgvector) → contexto → Gemma → respuesta
   ```
6. Configurar Ollama con modelo Gemma en español

**Criterio de éxito:** Consultas en menos de 10 segundos sin scraping ni sesión de Google.

---

### Fase 3 — Frontend Modular (Semana 5)

**Objetivo:** Separar datos de presentación en `index.html`.

**Tareas:**
1. Extraer todos los datos hardcodeados del HTML a archivos JSON en `frontend/data/`
2. Crear endpoints en FastAPI que sirvan esos JSONs (o servir como estáticos)
3. Modificar `index.html` para cargar datos via `fetch()` al iniciar
4. Adaptar `ai-panel.js` al nuevo endpoint `/api/v1/query`
5. Optimizar `index.html`: separar CSS en archivo externo, modularizar secciones

**Criterio de éxito:** `index.html` baja de 208 KB a menos de 30 KB; los datos viven en JSONs versionables.

---

### Fase 4 — Seguridad y Autenticación (Semana 6)

**Objetivo:** Control de acceso institucional.

**Tareas:**
1. Implementar autenticación con el directorio activo institucional (LDAP/OAuth2 de la universidad) o JWT simple
2. Agregar middleware de rate limiting (máx N consultas por usuario por minuto)
3. Configurar CORS solo para el dominio institucional (eliminar wildcard `*`)
4. Configurar HTTPS (certificado institucional o Let's Encrypt)
5. Auditar y sanitizar todos los inputs del usuario

---

### Fase 5 — Docker y Despliegue (Semana 7)

**Objetivo:** Despliegue reproducible en servidor institucional.

**`docker-compose.yml` objetivo:**
```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: mercado_educativo
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  ollama:
    image: ollama/ollama
    volumes:
      - ollama_data:/root/.ollama
    # para GPU: deploy: resources: reservations: devices: - driver: nvidia

  backend:
    build: ./backend
    depends_on: [db, ollama]
    env_file: .env
    ports:
      - "8000:8000"

  frontend:
    image: nginx:alpine
    volumes:
      - ./frontend:/usr/share/nginx/html:ro
    ports:
      - "80:80"

volumes:
  pgdata:
  ollama_data:
```

**Tareas:**
1. Dockerfiles para backend y frontend
2. Script de inicialización de DB y precarga de embeddings
3. `docker-compose.yml` completo con variables de entorno
4. Health checks para todos los servicios
5. Documentar procedimiento de despliegue en servidor Linux institucional

---

### Cronograma Resumen

| Fase | Duración | Entregable clave |
|------|----------|-----------------|
| 1 — FastAPI | 2 semanas | Backend reemplazado, sin cambios en frontend |
| 2 — RAG + pgvector + Gemma | 2 semanas | Sin dependencia de NotebookLM |
| 3 — Frontend modular | 1 semana | index.html mantenible, datos en JSON |
| 4 — Seguridad | 1 semana | Autenticación, HTTPS, CORS correcto |
| 5 — Docker + despliegue | 1 semana | Sistema listo para servidor institucional |
| **Total** | **~7 semanas** | |

---

## Resumen Ejecutivo

El proyecto actual es un **prototipo de investigación local bien ejecutado** para su propósito original (exploración y análisis en máquina de un investigador). El dashboard y su contenido analítico son el activo real de valor y deben conservarse.

Sin embargo, **ningún componente del backend es apto para producción institucional** en su estado actual. Los riesgos más graves son:

1. La integración con NotebookLM es scraping de un servicio de Google sin API oficial — un cambio de DOM o una IP bloqueada detiene el sistema completamente.
2. El servidor es de un solo hilo: una consulta bloquea todos los demás usuarios.
3. No hay autenticación, HTTPS, ni control de acceso.
4. Todas las dependencias apuntan a rutas personales (`~/.claude/skills/`) que no existen en ningún otro servidor.

La ruta de migración propuesta es incremental y no requiere reescribir el trabajo analítico del dashboard. La prioridad inmediata es la **Fase 1** (FastAPI) y la **Fase 2** (RAG propio), que eliminan los dos riesgos más críticos.
