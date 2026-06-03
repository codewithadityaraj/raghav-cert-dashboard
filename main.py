from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


BASE_DIR = Path(__file__).resolve().parent
app = FastAPI(title="Certification Program Dashboard")

@app.get("/")
def read_dashboard() -> FileResponse:
    return FileResponse(BASE_DIR / "index.html")


@app.get("/{file_path:path}")
def read_static_file(file_path: str):
    requested = (BASE_DIR / file_path).resolve()
    if requested.is_file() and requested.parent == BASE_DIR:
        return FileResponse(requested)
    return FileResponse(BASE_DIR / "index.html")
