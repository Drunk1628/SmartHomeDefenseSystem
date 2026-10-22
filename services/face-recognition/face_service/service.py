from __future__ import annotations

import base64
import binascii
import io
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import face_recognition
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
GALLERY = Path(os.getenv("FACE_GALLERY", ROOT / "demo_gallery"))
DB_PATH = Path(os.getenv("FACE_DB", ROOT / "history.sqlite3"))
# Similarity is derived as 1 - Euclidean distance and clipped to [0, 1]. This
# provisional demo target corresponds to the former 0.48 distance threshold.
MIN_MATCH_SIMILARITY = float(os.getenv("FACE_MIN_MATCH_SIMILARITY", "0.52"))
if not 0.0 <= MIN_MATCH_SIMILARITY <= 1.0:
    raise ValueError("FACE_MIN_MATCH_SIMILARITY must be between 0 and 1")
MAX_BYTES = 5 * 1024 * 1024
IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".webp"}

app = FastAPI(title="Local Face Recognition MVP", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FACE_CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(","),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class Frame(BaseModel):
    image_base64: str = Field(description="Base64 encoded JPEG/PNG image bytes")


class Enrollment(Frame):
    name: str = Field(min_length=1, max_length=80)
    consent_confirmed: bool = False


def _db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS recognition_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        captured_at TEXT NOT NULL,
        matched INTEGER NOT NULL,
        identity TEXT,
        face_count INTEGER NOT NULL,
        status TEXT
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS enrolled_faces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        encoding TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""")
    conn.execute("CREATE INDEX IF NOT EXISTS enrolled_faces_name_idx ON enrolled_faces(name)")
    columns = {row[1] for row in conn.execute("PRAGMA table_info(recognition_history)")}
    if "status" not in columns:
        conn.execute("ALTER TABLE recognition_history ADD COLUMN status TEXT")
        # Old records do not contain enough information to distinguish an
        # unknown person from an empty gallery, so preserve that uncertainty.
        conn.execute("""UPDATE recognition_history
            SET status = CASE
                WHEN matched = 1 THEN 'match'
                WHEN face_count = 0 THEN 'no_face'
                WHEN face_count > 1 THEN 'multiple_faces'
                ELSE 'indeterminate'
            END
            WHERE status IS NULL""")
    conn.commit()
    return conn


def load_gallery() -> list[tuple[str, np.ndarray]]:
    """Encode every detectable face in each person's image files."""
    entries: list[tuple[str, np.ndarray]] = []
    for path in sorted(GALLERY.rglob("*")) if GALLERY.exists() else []:
        if not path.is_file() or path.suffix.lower() not in IMAGE_TYPES:
            continue
        name = path.parent.name.strip()
        if not name:
            continue
        try:
            image = face_recognition.load_image_file(str(path))
            encodings = face_recognition.face_encodings(image)
            if len(encodings) == 1:
                entries.append((name, encodings[0]))
        except Exception:
            # A malformed or unsupported gallery file should not stop the API.
            continue
    # Newly enrolled faces are stored as feature vectors, not as uploaded photos.
    with _db() as conn:
        rows = conn.execute("SELECT name, encoding FROM enrolled_faces ORDER BY id").fetchall()
    for row in rows:
        try:
            vector = np.asarray(json.loads(row["encoding"]), dtype=float)
            if vector.shape == (128,) and np.isfinite(vector).all():
                entries.append((row["name"], vector))
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
    return entries


def _decode_image(value: str) -> np.ndarray:
    if value.startswith("data:"):
        try:
            value = value.split(",", 1)[1]
        except IndexError as exc:
            raise HTTPException(400, "Invalid data URL") from exc
    try:
        raw = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(400, "image_base64 must contain valid base64") from exc
    if not raw or len(raw) > MAX_BYTES:
        raise HTTPException(413, "Image is empty or exceeds the 5 MB limit")
    try:
        with Image.open(io.BytesIO(raw)) as im:
            im = im.convert("RGB")
            if im.width * im.height > 16_000_000:
                raise HTTPException(413, "Image dimensions exceed the 16 megapixel limit")
            return np.array(im)
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(400, "Image must be a valid JPEG, PNG, or WebP") from exc


def _record(status: str, identity: str | None, face_count: int) -> int:
    matched = status == "match"
    with _db() as conn:
        cur = conn.execute(
            "INSERT INTO recognition_history(captured_at,matched,identity,face_count,status) VALUES(?,?,?,?,?)",
            (datetime.now(timezone.utc).isoformat(), int(matched), identity, face_count, status),
        )
        return int(cur.lastrowid)


def _result(status: str, face_count: int | None, identity: str | None = None) -> dict[str, Any]:
    row_id = _record(status, identity if status == "match" else None, face_count or 0)
    matched: bool | None = True if status == "match" else False if status == "no_match" else None
    return {
        "status": status,
        "matched": matched,
        "identity": identity if status == "match" else None,
        "face_count": face_count,
        "history_id": row_id,
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    gallery = load_gallery()
    return {"status": "ok", "gallery_photos": len(gallery)}


@app.post("/api/enroll")
async def enroll(enrollment: Enrollment, request: Request) -> dict[str, Any]:
    """Enroll one consenting person by saving only their face encoding."""
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BYTES * 2:
        raise HTTPException(413, "Request exceeds the image size limit")
    name = enrollment.name.strip()
    if not name:
        raise HTTPException(400, "A non-empty name is required")
    if not enrollment.consent_confirmed:
        raise HTTPException(400, "Consent must be confirmed before enrollment")

    image = _decode_image(enrollment.image_base64)
    try:
        faces = face_recognition.face_encodings(image)
    except Exception:
        return {"status": "indeterminate", "identity": None}
    if not faces:
        return {"status": "no_face", "identity": None}
    if len(faces) > 1:
        return {"status": "multiple_faces", "identity": None}

    vector = np.asarray(faces[0], dtype=float)
    if vector.shape != (128,) or not np.isfinite(vector).all():
        return {"status": "indeterminate", "identity": None}

    created_at = datetime.now(timezone.utc).isoformat()
    with _db() as conn:
        cur = conn.execute(
            "INSERT INTO enrolled_faces(name, encoding, created_at) VALUES(?,?,?)",
            (name, json.dumps(vector.tolist()), created_at),
        )
        person_id = int(cur.lastrowid)
        sample_count = int(conn.execute(
            "SELECT COUNT(*) FROM enrolled_faces WHERE name = ?", (name,)
        ).fetchone()[0])
    return {"status": "enrolled", "identity": name, "person_id": person_id, "sample_count": sample_count}


@app.get("/api/enrolled")
def enrolled_people() -> dict[str, Any]:
    with _db() as conn:
        rows = conn.execute(
            "SELECT name, COUNT(*) AS sample_count, MIN(created_at) AS created_at "
            "FROM enrolled_faces GROUP BY name ORDER BY name COLLATE NOCASE"
        ).fetchall()
    return {"items": [dict(row) for row in rows]}


@app.delete("/api/enrolled/{name}")
def delete_enrolled_person(name: str) -> dict[str, Any]:
    with _db() as conn:
        cur = conn.execute("DELETE FROM enrolled_faces WHERE name = ?", (name,))
        deleted_samples = cur.rowcount
    return {"deleted_samples": deleted_samples, "identity": name}


@app.post("/api/recognize")
async def recognize(frame: Frame, request: Request) -> dict[str, Any]:
    # Reject oversized request bodies before decoding/parsing more data.
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BYTES * 2:
        raise HTTPException(413, "Request exceeds the image size limit")
    image = _decode_image(frame.image_base64)
    try:
        faces = face_recognition.face_encodings(image)
    except Exception:
        return _result("indeterminate", None)
    if not faces:
        return _result("no_face", 0)
    if len(faces) > 1:
        return _result("multiple_faces", len(faces))

    try:
        gallery = load_gallery()
    except Exception:
        return _result("indeterminate", len(faces))
    if not gallery:
        return _result("indeterminate", len(faces))

    try:
        known_vectors = [entry[1] for entry in gallery]
        distances = np.asarray(face_recognition.face_distance(known_vectors, faces[0]), dtype=float)
        if distances.size == 0 or not np.isfinite(distances).any():
            return _result("indeterminate", len(faces))
        distances = np.where(np.isfinite(distances), distances, np.inf)
        best = int(np.argmin(distances))
        similarity = max(0.0, min(1.0, 1.0 - float(distances[best])))
    except Exception:
        return _result("indeterminate", len(faces))

    if similarity >= MIN_MATCH_SIMILARITY:
        return _result("match", len(faces), gallery[best][0])
    return _result("no_match", len(faces))


@app.get("/api/history")
def history(limit: int = 50) -> dict[str, Any]:
    limit = max(1, min(limit, 200))
    with _db() as conn:
        rows = conn.execute(
            "SELECT id,captured_at,matched,identity,face_count,status FROM recognition_history ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    items = []
    for row in rows:
        item = dict(row)
        status = item["status"] or "indeterminate"
        item["status"] = status
        item["matched"] = True if status == "match" else False if status == "no_match" else None
        if status != "match":
            item["identity"] = None
        items.append(item)
    return {"items": items}


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Local face recognition API. Open /docs for interactive API details."}
