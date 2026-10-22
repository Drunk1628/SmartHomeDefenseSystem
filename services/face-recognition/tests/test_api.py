import base64
import io
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

from face_service import service


def png_base64() -> str:
    image = Image.new("RGB", (16, 16), "white")
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_db, service.DB_PATH = service.DB_PATH, Path(self.temp.name) / "history.sqlite3"
        self.client = TestClient(service.app)

    def tearDown(self):
        service.DB_PATH = self.old_db
        self.temp.cleanup()

    def recognize(self) -> dict:
        response = self.client.post("/api/recognize", json={"image_base64": png_base64()})
        self.assertEqual(response.status_code, 200)
        return response.json()

    def enroll(self, **overrides):
        payload = {
            "name": "Demo Member",
            "image_base64": png_base64(),
            "consent_confirmed": True,
        }
        payload.update(overrides)
        return self.client.post("/api/enroll", json=payload)

    @patch.object(service, "load_gallery", return_value=[])
    def test_health_does_not_return_a_similarity_score_or_threshold(self, _mock):
        body = self.client.get("/api/health").json()
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["gallery_photos"], 0)
        for hidden_field in ("confidence", "similarity", "minimum_match_similarity", "threshold", "distance"):
            self.assertNotIn(hidden_field, body)

    def test_rejects_invalid_base64(self):
        response = self.client.post("/api/recognize", json={"image_base64": "%%%"})
        self.assertEqual(response.status_code, 400)

    @patch.object(service.face_recognition, "face_encodings", return_value=[])
    def test_no_face_is_recorded(self, _mock):
        body = self.recognize()
        self.assertEqual(body["status"], "no_face")
        self.assertIsNone(body["matched"])
        self.assertEqual(body["face_count"], 0)
        self.assertEqual(self.client.get("/api/history").json()["items"][0]["status"], "no_face")

    @patch.object(service.face_recognition, "face_distance")
    @patch.object(service.face_recognition, "face_encodings", return_value=[np.array([0.0]), np.array([1.0])])
    def test_multiple_faces_are_not_matched(self, _encodings, distance_mock):
        body = self.recognize()
        self.assertEqual(body["status"], "multiple_faces")
        self.assertIsNone(body["matched"])
        self.assertIsNone(body["identity"])
        self.assertEqual(body["face_count"], 2)
        distance_mock.assert_not_called()

    @patch.object(service, "load_gallery", return_value=[])
    @patch.object(service.face_recognition, "face_encodings", return_value=[np.array([0.0])])
    def test_empty_gallery_is_indeterminate(self, *_mocks):
        body = self.recognize()
        self.assertEqual(body["status"], "indeterminate")
        self.assertIsNone(body["matched"])
        self.assertIsNone(body["identity"])

    @patch.object(service, "load_gallery", return_value=[("Demo Person", np.array([0.0]))])
    @patch.object(
        service.face_recognition,
        "face_distance",
        return_value=np.array([1.0 - service.MIN_MATCH_SIMILARITY]),
    )
    @patch.object(service.face_recognition, "face_encodings", return_value=[np.array([0.0])])
    def test_similarity_at_threshold_is_match_and_score_is_not_returned(self, *_mocks):
        body = self.recognize()
        self.assertEqual(body["status"], "match")
        self.assertIs(body["matched"], True)
        self.assertEqual(body["identity"], "Demo Person")
        self.assertEqual(body["face_count"], 1)
        for hidden_field in ("confidence", "confidence_type", "similarity", "distance", "candidate_identity"):
            self.assertNotIn(hidden_field, body)
        history = self.client.get("/api/history").json()["items"][0]
        self.assertEqual(history["status"], "match")
        self.assertNotIn("similarity", history)
        self.assertNotIn("distance", history)

    @patch.object(service, "load_gallery", return_value=[("Demo Person", np.array([0.0]))])
    @patch.object(service.face_recognition, "face_distance", return_value=np.array([0.60]))
    @patch.object(service.face_recognition, "face_encodings", return_value=[np.array([0.0])])
    def test_similarity_below_threshold_is_no_match(self, *_mocks):
        body = self.recognize()
        self.assertEqual(body["status"], "no_match")
        self.assertIs(body["matched"], False)
        self.assertIsNone(body["identity"])
        self.assertEqual(self.client.get("/api/history").json()["items"][0]["status"], "no_match")

    @patch.object(service.face_recognition, "face_encodings", side_effect=RuntimeError("model failure"))
    def test_model_failure_is_indeterminate(self, _mock):
        body = self.recognize()
        self.assertEqual(body["status"], "indeterminate")
        self.assertIsNone(body["matched"])
        self.assertIsNone(body["identity"])

    @patch.object(service, "load_gallery", return_value=[("Demo Person", np.array([0.0]))])
    @patch.object(service.face_recognition, "face_distance", side_effect=RuntimeError("comparison failure"))
    @patch.object(service.face_recognition, "face_encodings", return_value=[np.array([0.0])])
    def test_comparison_failure_is_indeterminate(self, *_mocks):
        body = self.recognize()
        self.assertEqual(body["status"], "indeterminate")
        self.assertIsNone(body["matched"])

    def test_old_history_migrates_without_claiming_unknown_was_no_match(self):
        with sqlite3.connect(service.DB_PATH) as conn:
            conn.execute("""CREATE TABLE recognition_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                captured_at TEXT NOT NULL,
                matched INTEGER NOT NULL,
                identity TEXT,
                distance REAL,
                face_count INTEGER NOT NULL
            )""")
            conn.execute(
                "INSERT INTO recognition_history(captured_at,matched,identity,distance,face_count) VALUES(?,?,?,?,?)",
                ("2026-01-01T00:00:00+00:00", 0, None, 0.7, 1),
            )
        item = self.client.get("/api/history").json()["items"][0]
        self.assertEqual(item["status"], "indeterminate")
        self.assertIsNone(item["matched"])
        self.assertNotIn("distance", item)

    def test_enrollment_requires_explicit_consent(self):
        response = self.enroll(consent_confirmed=False)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get("/api/enrolled").json()["items"], [])

    @patch.object(service.face_recognition, "face_encodings", return_value=[])
    def test_enrollment_rejects_image_without_a_face(self, _mock):
        response = self.enroll()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "no_face")
        self.assertEqual(self.client.get("/api/enrolled").json()["items"], [])

    @patch.object(service.face_recognition, "face_encodings", return_value=[np.zeros(128), np.ones(128)])
    def test_enrollment_rejects_multiple_faces(self, _mock):
        response = self.enroll()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "multiple_faces")
        self.assertEqual(self.client.get("/api/enrolled").json()["items"], [])

    @patch.object(service.face_recognition, "face_encodings", return_value=[np.zeros(128)])
    def test_enrolled_face_can_be_found_by_recognition(self, _mock):
        response = self.enroll(name="  Alice Demo  ")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "enrolled")
        self.assertEqual(response.json()["identity"], "Alice Demo")
        self.assertEqual(response.json()["sample_count"], 1)

        recognized = self.recognize()
        self.assertEqual(recognized["status"], "match")
        self.assertEqual(recognized["identity"], "Alice Demo")
        self.assertEqual(self.client.get("/api/enrolled").json()["items"][0]["name"], "Alice Demo")

    def test_enrollment_rejects_blank_name(self):
        response = self.enroll(name="   ")
        self.assertEqual(response.status_code, 400)

    @patch.object(service.face_recognition, "face_encodings", return_value=[np.zeros(128)])
    def test_enrolled_person_can_be_removed(self, _mock):
        self.assertEqual(self.enroll().json()["status"], "enrolled")
        response = self.client.delete("/api/enrolled/Demo%20Member")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["deleted_samples"], 1)
        self.assertEqual(self.client.get("/api/enrolled").json()["items"], [])


if __name__ == "__main__":
    unittest.main()
