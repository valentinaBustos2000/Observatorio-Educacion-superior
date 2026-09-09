# Estudio de Mercado Educativo — Colombia 2026

Dashboard ejecutivo interactivo sobre educación superior en Colombia, con un
asistente de IA conversacional que responde preguntas citando fuentes reales
(NotebookLM de Google).

## Qué es este proyecto

Un **prototipo de investigación local** con dos piezas:

1. **Dashboard** (`dashboard/index.html`): documento ejecutivo de una sola
   página con KPIs, gráficos (Chart.js) y tablas sobre el mercado de
   educación superior — contexto nacional, demanda por área, competencia
   regional, tendencias laborales, oportunidades de pregrado/posgrado, marco
   normativo y conclusiones.
2. **Asistente de IA** (panel flotante, `dashboard/ai-panel.js`): un chat que
   responde preguntas en lenguaje natural buscando la respuesta dentro de un
   notebook de Google NotebookLM cargado con fuentes reales (OCDE, UNESCO,
   Deloitte, Cuadernos LEE-Javeriana, etc.).

Todo el contenido está basado en fuentes citadas dentro del propio dashboard
(cada dato trae su fuente). No incluye datos internos de ninguna universidad.

## Cómo arrancarlo

```bat
start.bat
```

Esto abre `http://localhost:8090` en el navegador y levanta `server.py`, que
sirve el dashboard y expone la API que usa el asistente de IA.

## Estructura

```
proyecto_mercado_educativo 2/
├── server.py                 # Servidor HTTP (Python estándar) + API /api/query, /api/notebooks, /api/status
├── start.bat                 # Launcher para Windows
├── CLAUDE.md                 # Notas de trabajo para Claude Code sobre este proyecto
├── DIAGNOSTICO_TECNICO.md    # Auditoría de arquitectura: riesgos y plan de migración a producción
├── README.md                 # Este archivo
└── dashboard/
    ├── index.html             # Dashboard (Bootstrap + Chart.js), todo el contenido embebido
    └── ai-panel.js             # Panel de chat flotante conectado a NotebookLM
```

## Cómo funciona el asistente de IA (el "agente RAG")

**Primero lo importante: técnicamente no es un RAG en el sentido clásico.**
Un sistema RAG (Retrieval-Augmented Generation) tradicional tiene su propia
base de datos vectorial (embeddings) que tú controlas, busca los fragmentos
más relevantes y se los pasa a un LLM. Aquí no hay nada de eso — no hay base
de datos, ni embeddings, ni pipeline de recuperación propio.

**Lo que realmente hace es delegar toda la búsqueda y generación a NotebookLM
de Google, y automatizar el navegador para hablar con él.** El flujo completo
de una pregunta es:

```
Tú escribes una pregunta en el panel de chat
        │
        ▼
Navegador → POST /api/query { question, notebook }
        │
        ▼
server.py recibe la petición
        │
        ▼
Lanza un subproceso: scripts/run.py ask_question.py
   (usa el skill de Claude Code instalado en ~/.claude/skills/notebooklm/)
        │
        ▼
Ese script abre un Chromium controlado por Playwright/Patchright
        │
        ▼
Navega a notebooklm.google.com, abre el notebook indicado (global o antes ibague)
        │
        ▼
Escribe tu pregunta en el chat de NotebookLM y espera la respuesta
   (NotebookLM SÍ hace RAG real internamente: busca en sus fuentes y genera
   la respuesta con Gemini — pero eso pasa del lado de Google, no aquí)
        │
        ▼
El script extrae el texto de la respuesta leyendo el DOM de la página
        │
        ▼
server.py recibe ese texto por stdout y lo recorta con un parser basado en
delimitadores "====" (parse_notebooklm_answer)
        │
        ▼
Devuelve { answer, notebook, source } como JSON al navegador
        │
        ▼
El panel de chat muestra la respuesta
```

**¿Funciona?** Sí, funciona — pero con condiciones:

- Requiere que la sesión de Google esté autenticada y vigente en el skill
  (`~/.claude/skills/notebooklm/`). Si expira, hay que re-autenticar a mano
  (`python scripts/run.py auth_manager.py reauth`).
- Cada pregunta tarda **30 a 180 segundos** porque abre un navegador real y
  espera a que NotebookLM termine de responder — no es instantáneo.
- El servidor es de un solo hilo: mientras se procesa una pregunta, no puede
  atender otra petición al mismo tiempo.
- El parser que extrae la respuesta depende del formato de texto que imprime
  el script externo; si ese formato cambia, la respuesta puede llegar vacía
  o cortada sin un error claro.
- Es una automatización de un producto de Google sin API oficial: si Google
  cambia el diseño de la página de NotebookLM, esto puede dejar de funcionar
  hasta que se actualice el script de scraping.
- Solo funciona corriendo en la máquina donde está configurado el skill y la
  sesión de Google — no es algo que se pueda desplegar tal cual en un
  servidor institucional para muchos usuarios a la vez.

En resumen: es un **puente funcional de scraping hacia NotebookLM**, útil
para investigación individual en tu propia máquina, pero no un RAG propio ni
un servicio apto para producción con múltiples usuarios. El diagnóstico
técnico completo de estas limitaciones — y un plan de migración hacia una
arquitectura con RAG propio (PostgreSQL + pgvector + Ollama, sin depender de
scraping) — está en `DIAGNOSTICO_TECNICO.md`.

## Notebook conectado

| Clave    | Notebook | Contenido |
|----------|----------|-----------|
| `global` | Evolution of Excellence — Educación Superior Global | 54 fuentes (OCDE, UNESCO, Deloitte, LEE-Javeriana): IA en educación, economía de habilidades, micro-credenciales, demografía, modelos financieros de IES, movilidad estudiantil, ESG. |

> **2026-09-09:** se retiró el notebook `ibague` ("Universidad de Ibague —
> Mirada Interna") y las secciones del dashboard que dependían de datos
> internos de la universidad (Capacidades Internas, Brechas GAP,
> Competitividad, Viabilidad de Programas, DOFA Institucional, Recomendaciones
> basadas en diagnóstico interno, Percepción de Calidad CNA). El proyecto
> ahora cubre exclusivamente mercado externo (nacional y global) — ver
> `CLAUDE.md` para el detalle de qué se quitó y por qué.

## API

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/query` | `{ "question": "...", "notebook": "global" }` → `{ "answer", "notebook", "source" }` |
| `GET` | `/api/notebooks` | Lista los notebooks disponibles |
| `GET` | `/api/status` | Estado del servidor |

## Límites conocidos (ver `DIAGNOSTICO_TECNICO.md` para el detalle completo)

- Sin autenticación ni control de acceso.
- Servidor de un solo hilo (una consulta bloquea a los demás usuarios).
- Sin HTTPS.
- Todos los datos del dashboard están embebidos directamente en el HTML
  (actualizarlos implica editar el archivo a mano).
- Depende de rutas y sesión personal de un único usuario/máquina — no es
  portable a un servidor institucional sin la migración descrita en
  `DIAGNOSTICO_TECNICO.md`.
