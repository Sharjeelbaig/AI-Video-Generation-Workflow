from __future__ import annotations

import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.main import app


client = TestClient(app)


def test_settings_and_project_lifecycle() -> None:
    health = client.get("/api/health")
    assert health.status_code == 200

    settings = client.get("/api/settings")
    assert settings.status_code == 200
    settings_body = settings.json()
    assert settings_body["projectsDirectory"]

    missing = client.get("/api/projects/does-not-exist")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "http_error"

    created = client.post(
        "/api/projects",
        json={
            "name": "Pytest Smoke Test",
            "description": "Temporary verification project",
            "language": "en",
            "aspectRatio": "16:9",
        },
    )
    assert created.status_code == 200
    project = created.json()
    project_id = project["id"]

    try:
        saved = client.put(
            f"/api/projects/{project_id}/script",
            json={"content": "First line\n---\nSecond line"},
        )
        assert saved.status_code == 200
        assert saved.json()["content"].startswith("First line")

        fetched = client.get(f"/api/projects/{project_id}")
        assert fetched.status_code == 200
        assert fetched.json()["id"] == project_id

        listed = client.get("/api/projects")
        assert listed.status_code == 200
        assert any(item["id"] == project_id for item in listed.json())
    finally:
        client.delete(f"/api/projects/{project_id}")
