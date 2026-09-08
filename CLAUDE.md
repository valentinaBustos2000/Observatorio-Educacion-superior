# Proyecto: Estudio de Mercado Educativo

Dashboard interactivo de educación superior Colombia 2026 con asistente de investigación conectado a Google NotebookLM via automatización de navegador.

## Arrancar el proyecto

```bat
start.bat
```

Abre el navegador en `http://localhost:8090` y activa el asistente de IA.

## Estructura

```
proyecto_mercado_educativo/
├── server.py              # Servidor HTTP + API /api/query y /api/notebooks
├── start.bat              # Script de inicio (Windows)
├── CLAUDE.md              # Este archivo
└── dashboard/
    ├── index.html         # Dashboard principal (Bootstrap + Chart.js)
    └── ai-panel.js        # Panel flotante de chat con NotebookLM
```

## Notebooks conectados

| Clave    | Notebook | URL |
|----------|----------|-----|
| `ibague` | Universidad de Ibague — Mirada Interna | https://notebooklm.google.com/notebook/9f82ef45-1d52-46e7-b02d-47abc13a5b3c |
| `global` | Evolution of Excellence — Educacion Superior Global | https://notebooklm.google.com/notebook/690b4a48-7ca7-40ab-884e-171d74b09953 |

### Notebook `ibague`
PDI 2026-2029 "Tejiendo Futuros", 3 facultades, oferta académica completa, resultados 2025, empleabilidad 70.2%, investigación Minciencias, Semestre Paz y Región, infraestructura (12 bloques, 3536 cupos), madurez digital Hybrid University, vacantes SENA Tolima.

### Notebook `global`
54 fuentes (OCDE, UNESCO, Deloitte, LEE-Javeriana). IA en educación, economía de habilidades, micro-credenciales, acantilado demográfico 2026, modelos financieros IES, movilidad estudiantil multipolar, ESG, bienestar, regulación DEI.

## API

**POST** `/api/query`
```json
{ "question": "...", "notebook": "ibague" }
```
Devuelve:
```json
{ "answer": "...", "notebook": "Nombre notebook", "source": "ibague" }
```

**GET** `/api/notebooks` — Lista los notebooks disponibles.
**GET** `/api/status` — Estado del servidor.

## Skill de NotebookLM

La consulta usa el skill instalado en `~/.claude/skills/notebooklm/`.
Requiere sesión activa (autenticación de Google). Si expira, ejecutar:
```bash
cd ~/.claude/skills/notebooklm
PYTHONIOENCODING=utf-8 python scripts/run.py auth_manager.py reauth
```

## Dashboard — Secciones

| ID | Sección |
|----|---------|
| S0 | KPIs Ejecutivos — 2.45M matriculados, cobertura 55.4%, IES 323 |
| S1 | Contexto Nacional — Ley 30, MEN, CNA, SNIES, gratuidad |
| S2 | Demanda por Área |
| S3 | Competencia Regional |
| S4 | Tendencias Laborales |
| S5 | Oportunidades Pregrado |
| S6 | Oportunidades Posgrado |
| S7 | Marco Normativo |
| S8 | KPIs Estratégicos |
| S9 | Metodología |
| S10 | Conclusiones |
| S11 | Capacidades Internas |
| S12 | Brechas GAP |
| S13 | Competitividad |
| S14 | Viabilidad de Programas |
| S15 | DOFA Institucional |
| S16 | Recomendaciones |
