"""
Servidor del Proyecto: Estudio de Mercado Educativo
Sirve el dashboard y provee API para consultar los notebooks de NotebookLM.
"""
import json
import os
import subprocess
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

SKILL_DIR = os.path.join(os.path.expanduser("~"), ".claude", "skills", "notebooklm")
DASHBOARD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard")
PORT = 8090

NOTEBOOKS = {
    "global": {
        "url": "https://notebooklm.google.com/notebook/690b4a48-7ca7-40ab-884e-171d74b09953",
        "name": "Evolution of Excellence - Educacion Superior Global",
        "desc": "Tendencias globales, IA, skills-based economy, demografía (54 fuentes: OCDE, UNESCO, Deloitte)"
    },
    "ibague": {
        "url": "https://notebooklm.google.com/notebook/9f82ef45-1d52-46e7-b02d-47abc13a5b3c",
        "name": "Universidad de Ibague - Mirada Interna",
        "desc": "PDI 2026-2029, facultades, programas, empleabilidad, investigación, Semestre Paz y Región"
    }
}


def parse_notebooklm_answer(raw_output: str) -> str:
    """Extrae la respuesta limpia del output de ask_question.py."""
    lines = raw_output.split("\n")
    answer_lines = []
    in_answer = False
    divider_count = 0

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("=" * 20):
            divider_count += 1
            if divider_count == 2:
                in_answer = True
            elif divider_count >= 3:
                break
            continue
        if in_answer:
            if stripped.startswith("EXTREMELY IMPORTANT:"):
                break
            answer_lines.append(line)

    answer = "\n".join(answer_lines).strip()
    return answer if answer else raw_output.strip()


def query_notebook(question: str, notebook_key: str) -> dict:
    notebook = NOTEBOOKS.get(notebook_key, NOTEBOOKS["ibague"])
    try:
        result = subprocess.run(
            [sys.executable, "scripts/run.py", "ask_question.py",
             "--question", question,
             "--notebook-url", notebook["url"]],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            cwd=SKILL_DIR,
            timeout=180
        )
        if result.returncode != 0 and not result.stdout:
            return {"error": result.stderr or "Error al consultar el notebook", "notebook": notebook["name"]}
        answer = parse_notebooklm_answer(result.stdout)
        return {"answer": answer, "notebook": notebook["name"], "source": notebook_key}
    except subprocess.TimeoutExpired:
        return {"error": "Tiempo de espera agotado (180s). Intenta de nuevo.", "notebook": notebook["name"]}
    except Exception as e:
        return {"error": str(e), "notebook": notebook["name"]}


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DASHBOARD_DIR, **kwargs)

    def log_message(self, format, *args):
        print(f"  [{self.command}] {self.path} -> {args[1] if len(args) > 1 else ''}")

    def send_json(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/notebooks":
            self.send_json(NOTEBOOKS)
        elif parsed.path == "/api/status":
            self.send_json({"status": "online", "notebooks": list(NOTEBOOKS.keys())})
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/query":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length))
                question = body.get("question", "").strip()
                notebook_key = body.get("notebook", "ibague")

                if not question:
                    self.send_json({"error": "Pregunta vacia"}, 400)
                    return
                if notebook_key not in NOTEBOOKS:
                    self.send_json({"error": f"Notebook desconocido: {notebook_key}"}, 400)
                    return

                print(f"\n  Consultando '{notebook_key}': {question[:80]}...")
                result = query_notebook(question, notebook_key)
                self.send_json(result)
            except json.JSONDecodeError:
                self.send_json({"error": "JSON invalido"}, 400)
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
        else:
            self.send_response(404)
            self.end_headers()


def main():
    print("=" * 60)
    print("  ESTUDIO DE MERCADO EDUCATIVO — Servidor de Proyecto")
    print("=" * 60)
    print(f"\n  Dashboard: http://localhost:{PORT}")
    print(f"  API:       http://localhost:{PORT}/api/query\n")
    print("  Notebooks conectados:")
    for key, nb in NOTEBOOKS.items():
        print(f"    [{key}] {nb['name']}")
    print("\n  Ctrl+C para detener\n" + "=" * 60)

    server = HTTPServer(("localhost", PORT), DashboardHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Servidor detenido.")
        server.shutdown()


if __name__ == "__main__":
    main()
