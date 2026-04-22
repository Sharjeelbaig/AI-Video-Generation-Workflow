from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field, ValidationError


APP_NAME = "Sealed Nector Studio"
APP_DIR_NAME = "sealed-nector"


class AppSettings(BaseModel):
    projectsDirectory: str = Field(min_length=1)


class AppSettingsResponse(BaseModel):
    projectsDirectory: str
    configPath: str
    appDataDirectory: str
    logsDirectory: str
    stateDirectory: str


class UpdateAppSettingsRequest(BaseModel):
    projectsDirectory: str = Field(min_length=1)


def resolve_app_data_dir() -> Path:
    if os.name == "nt":
        base = Path(os.getenv("APPDATA", Path.home() / "AppData" / "Roaming"))
        return base / APP_DIR_NAME

    if sys_platform := os.getenv("XDG_DATA_HOME", "").strip():
        return Path(sys_platform).expanduser().resolve() / APP_DIR_NAME

    if os.uname().sysname == "Darwin":  # type: ignore[attr-defined]
        return (Path.home() / "Library" / "Application Support" / APP_DIR_NAME).resolve()

    return (Path.home() / ".local" / "share" / APP_DIR_NAME).resolve()


class SettingsManager:
    def __init__(self, repo_root: Path) -> None:
        self.repo_root = repo_root.resolve()
        self._set_app_data_dir(resolve_app_data_dir())
        self._settings: AppSettings | None = None

        load_dotenv(self.repo_root / ".env")
        self._ensure_base_dirs()
        self._migrate_legacy_state_db()
        self._settings = self._load()
        self.ensure_workspace_dirs()

    def _set_app_data_dir(self, app_data_dir: Path) -> None:
        self.app_data_dir = app_data_dir
        self.config_path = self.app_data_dir / "config.json"
        self.state_dir = self.app_data_dir / "state"
        self.logs_dir = self.app_data_dir / "logs"
        self.state_db_path = self.state_dir / "metadata.db"

    def _ensure_base_dirs(self) -> None:
        try:
            self.app_data_dir.mkdir(parents=True, exist_ok=True)
            self.state_dir.mkdir(parents=True, exist_ok=True)
            self.logs_dir.mkdir(parents=True, exist_ok=True)
        except PermissionError:
            fallback_root = self.repo_root / ".app-data"
            self._set_app_data_dir(fallback_root)
            self.app_data_dir.mkdir(parents=True, exist_ok=True)
            self.state_dir.mkdir(parents=True, exist_ok=True)
            self.logs_dir.mkdir(parents=True, exist_ok=True)

    def _migrate_legacy_state_db(self) -> None:
        legacy_db = self.repo_root / ".backend-data" / "metadata.db"
        if self.state_db_path.exists() or not legacy_db.exists():
            return
        self.state_db_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(legacy_db, self.state_db_path)

    def _default_projects_directory(self) -> Path:
        override = os.getenv("SEALED_NECTOR_PROJECTS_DIR", "").strip()
        if override:
            return Path(override).expanduser().resolve()
        return self.repo_root

    def _serialize(self, settings: AppSettings) -> None:
        payload = json.dumps(settings.model_dump(), indent=2, ensure_ascii=False)
        self.config_path.write_text(payload + "\n", encoding="utf-8")

    def _load(self) -> AppSettings:
        if not self.config_path.exists():
            settings = AppSettings(
                projectsDirectory=str(self._default_projects_directory()),
            )
            self._serialize(settings)
            return settings

        try:
            payload = json.loads(self.config_path.read_text(encoding="utf-8"))
            settings = AppSettings.model_validate(payload)
        except (OSError, json.JSONDecodeError, ValidationError):
            settings = AppSettings(
                projectsDirectory=str(self._default_projects_directory()),
            )
            self._serialize(settings)
        return settings

    def get(self) -> AppSettings:
        if self._settings is None:
            self._settings = self._load()
        return self._settings

    def update(self, request: UpdateAppSettingsRequest) -> AppSettings:
        resolved_directory = Path(request.projectsDirectory).expanduser().resolve()
        settings = AppSettings(projectsDirectory=str(resolved_directory))
        self._settings = settings
        self._serialize(settings)
        self.ensure_workspace_dirs()
        return settings

    def workspace_root(self) -> Path:
        return Path(self.get().projectsDirectory).expanduser().resolve()

    def backend_data_root(self) -> Path:
        return self.workspace_root() / ".backend-data"

    def projects_root(self) -> Path:
        return self.backend_data_root() / "projects"

    def outputs_root(self) -> Path:
        return self.workspace_root() / "outputs"

    def project_outputs_root(self) -> Path:
        return self.outputs_root() / "projects"

    def global_designed_audio_dir(self) -> Path:
        return self.outputs_root() / "audios" / "designed"

    def ensure_workspace_dirs(self) -> None:
        self.projects_root().mkdir(parents=True, exist_ok=True)
        self.global_designed_audio_dir().mkdir(parents=True, exist_ok=True)
        self.project_outputs_root().mkdir(parents=True, exist_ok=True)

    def response_model(self) -> AppSettingsResponse:
        settings = self.get()
        return AppSettingsResponse(
            projectsDirectory=settings.projectsDirectory,
            configPath=str(self.config_path),
            appDataDirectory=str(self.app_data_dir),
            logsDirectory=str(self.logs_dir),
            stateDirectory=str(self.state_dir),
        )
