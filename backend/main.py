from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import uuid
import wave
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, ValidationError


REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = REPO_ROOT / ".backend-data"
PROJECTS_ROOT = DATA_ROOT / "projects"
DB_PATH = DATA_ROOT / "metadata.db"
SCRIPTS_DIR = REPO_ROOT / "scripts"
OUTPUTS_ROOT = REPO_ROOT / "outputs"
GLOBAL_DESIGNED_AUDIO_DIR = OUTPUTS_ROOT / "audios" / "designed"
PROJECT_OUTPUTS_ROOT = OUTPUTS_ROOT / "projects"

PROJECT_TABLE = "projects"
ENTITY_TABLES = {"runs", "voice_designs", "audios", "images", "videos"}


ProjectStatus = Literal["idle", "running", "success", "failed", "archived"]
JobStatus = Literal["idle", "queued", "running", "success", "failed"]
RunType = Literal["voice-design", "generate-voice", "generate-images", "generate-video"]
Language = Literal["en", "ar", "en-ar"]
AspectRatio = Literal["16:9", "9:16", "1:1", "4:3"]
TonePreset = Literal["neutral", "warm", "formal", "energetic", "calm"]
NarrationMood = Literal[
    "documentary",
    "conversational",
    "dramatic",
    "educational",
    "inspirational",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def slugify(value: str, fallback: str = "voice") -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return normalized or fallback


class VideoSettings(BaseModel):
    width: int
    height: int
    fps: int
    fontFamily: str
    arabicFontFamily: str
    bodyColor: str
    headingColor: str
    subHeadingColor: str
    backgroundColor: str
    wordsPerScene: int
    separatorLine: bool
    fadeTransition: bool
    fadeTransitionDuration: float
    outputFilename: str


class Project(BaseModel):
    id: str
    name: str
    description: str = ""
    language: Language
    aspectRatio: AspectRatio
    createdAt: str
    updatedAt: str
    status: ProjectStatus
    archived: bool = False
    scriptContent: str = ""
    defaultVoiceDesignId: str | None = None
    outputFolder: str | None = None
    videoSettings: VideoSettings


class ScriptSegment(BaseModel):
    id: str
    projectId: str
    index: int
    rawText: str
    cleanText: str
    heading: str | None = None
    subHeading: str | None = None
    imagePrompt: str | None = None
    warnings: list[str] = Field(default_factory=list)
    isEmpty: bool


class VoiceDesign(BaseModel):
    id: str
    projectId: str
    name: str
    promptInstruction: str
    referenceText: str
    speed: float
    tonePreset: TonePreset
    narrationMood: NarrationMood
    createdAt: str
    duration: float | None = None
    status: JobStatus
    audioUrl: str | None = None
    isDefault: bool = False


class DesignedVoiceAsset(BaseModel):
    id: str
    filename: str
    name: str
    audioUrl: str
    createdAt: str


class GeneratedAudio(BaseModel):
    id: str
    projectId: str
    segmentId: str
    segmentIndex: int
    voiceDesignId: str
    status: JobStatus
    progress: int = 0
    audioUrl: str | None = None
    duration: float | None = None
    createdAt: str
    runId: str


class GeneratedImage(BaseModel):
    id: str
    projectId: str
    segmentId: str
    segmentIndex: int
    prompt: str
    status: JobStatus
    progress: int = 0
    thumbnailUrl: str | None = None
    width: int
    height: int
    createdAt: str
    runId: str


class VideoStage(BaseModel):
    label: str
    status: JobStatus
    progress: int


class GeneratedVideo(BaseModel):
    id: str
    projectId: str
    status: JobStatus
    progress: int
    stages: list[VideoStage]
    videoUrl: str | None = None
    thumbnailUrl: str | None = None
    filename: str
    duration: float | None = None
    createdAt: str
    runId: str
    settings: VideoSettings


class RunJob(BaseModel):
    id: str
    projectId: str
    type: RunType
    status: JobStatus
    startedAt: str
    completedAt: str | None = None
    itemIds: list[str]
    label: str


class CreateProjectRequest(BaseModel):
    name: str
    description: str = ""
    language: Language = "en"
    aspectRatio: AspectRatio = "16:9"


class UpdateProjectRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    language: Language | None = None
    aspectRatio: AspectRatio | None = None
    status: ProjectStatus | None = None
    archived: bool | None = None
    defaultVoiceDesignId: str | None = None
    scriptContent: str | None = None
    videoSettings: VideoSettings | None = None


class ScriptUpdateRequest(BaseModel):
    content: str


class VoiceDesignCreateRequest(BaseModel):
    name: str
    promptInstruction: str
    referenceText: str = ""
    speed: float = 1.0
    tonePreset: TonePreset = "neutral"
    narrationMood: NarrationMood = "documentary"
    setAsDefault: bool = False


class GenerateAudiosRequest(BaseModel):
    segmentIndices: list[int] | None = None
    voiceDesignId: str | None = None
    designedVoiceId: str | None = None
    clearExisting: bool | None = None
    speed: float | None = None


class GenerateImagesRequest(BaseModel):
    segmentIndices: list[int] | None = None
    width: int | None = None
    height: int | None = None
    maxWorkers: int | None = None


class GenerateVideoRequest(BaseModel):
    settings: VideoSettings | None = None
    voiceDesignId: str | None = None
    designedVoiceId: str | None = None
    autoGenerateAudios: bool = True
    autoGenerateImages: bool = True


def default_video_settings(aspect_ratio: AspectRatio, project_name: str) -> VideoSettings:
    dimensions = {
        "16:9": (1920, 1080),
        "9:16": (1080, 1920),
        "1:1": (1080, 1080),
        "4:3": (1440, 1080),
    }
    width, height = dimensions[aspect_ratio]
    filename = f"{slugify(project_name, fallback='project')}.mp4"
    return VideoSettings(
        width=width,
        height=height,
        fps=30,
        fontFamily="Helvetica",
        arabicFontFamily="Geeza Pro",
        bodyColor="#FFFFFF",
        headingColor="#F59E0B",
        subHeadingColor="#60A5FA",
        backgroundColor="#000000",
        wordsPerScene=8,
        separatorLine=True,
        fadeTransition=True,
        fadeTransitionDuration=0.5,
        outputFilename=filename,
    )


def log_validation_issue(scope: str, project_id: str | None, entity_id: str | None, exc: Exception) -> None:
    print(
        f"[backend] skipping invalid {scope}"
        f"{f' for project {project_id}' if project_id else ''}"
        f"{f' ({entity_id})' if entity_id else ''}: {exc}",
        file=sys.stderr,
    )


def normalize_project_payload(payload: Any) -> tuple[Project, bool]:
    if not isinstance(payload, dict):
        return Project.model_validate(payload), False

    repaired = False
    if "videoSettings" not in payload:
        aspect_ratio = payload.get("aspectRatio")
        if aspect_ratio not in {"16:9", "9:16", "1:1", "4:3"}:
            aspect_ratio = "16:9"
        project_name = payload.get("name")
        if not isinstance(project_name, str) or not project_name.strip():
            project_name = "project"
        payload = {
            **payload,
            "videoSettings": default_video_settings(
                aspect_ratio,
                project_name,
            ).model_dump(),
        }
        repaired = True

    return Project.model_validate(payload), repaired


def load_valid_entities(
    table_name: str,
    project_id: str,
    model: type[BaseModel],
) -> list[BaseModel]:
    valid_entities: list[BaseModel] = []
    for item in store.list_entities(table_name, project_id):
        try:
            valid_entities.append(model.model_validate(item))
        except ValidationError as exc:
            entity_id = item.get("id") if isinstance(item, dict) else None
            log_validation_issue(table_name, project_id, entity_id, exc)
    return valid_entities


class JsonStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, timeout=30)
        connection.row_factory = sqlite3.Row
        return connection

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    data TEXT NOT NULL
                )
                """
            )
            for table_name in ENTITY_TABLES:
                conn.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {table_name} (
                        id TEXT PRIMARY KEY,
                        project_id TEXT NOT NULL,
                        data TEXT NOT NULL
                    )
                    """
                )
                conn.execute(
                    f"""
                    CREATE INDEX IF NOT EXISTS idx_{table_name}_project_id
                    ON {table_name}(project_id)
                    """
                )

    def upsert_project(self, project: Project) -> None:
        payload = json.dumps(project.model_dump(), ensure_ascii=False)
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO projects (id, data) VALUES (?, ?)",
                (project.id, payload),
            )

    def get_project(self, project_id: str) -> Project | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT data FROM projects WHERE id = ?",
                (project_id,),
            ).fetchone()
        if row is None:
            return None
        payload = json.loads(row["data"])
        try:
            project, repaired = normalize_project_payload(payload)
        except ValidationError as exc:
            entity_id = payload.get("id") if isinstance(payload, dict) else project_id
            log_validation_issue("project", project_id, entity_id, exc)
            return None
        if repaired:
            self.upsert_project(project)
        return project

    def list_projects(self) -> list[Project]:
        with self._connect() as conn:
            rows = conn.execute("SELECT data FROM projects").fetchall()
        projects: list[Project] = []
        for row in rows:
            payload = json.loads(row["data"])
            try:
                project, repaired = normalize_project_payload(payload)
            except ValidationError as exc:
                entity_id = payload.get("id") if isinstance(payload, dict) else None
                log_validation_issue("project", None, entity_id, exc)
                continue
            if repaired:
                self.upsert_project(project)
            projects.append(project)
        return sorted(projects, key=lambda item: item.updatedAt, reverse=True)

    def delete_project(self, project_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            for table_name in ENTITY_TABLES:
                conn.execute(
                    f"DELETE FROM {table_name} WHERE project_id = ?",
                    (project_id,),
                )

    def _validate_entity_table(self, table_name: str) -> None:
        if table_name not in ENTITY_TABLES:
            raise ValueError(f"Unsupported table: {table_name}")

    def upsert_entity(self, table_name: str, project_id: str, entity_id: str, data: dict[str, Any]) -> None:
        self._validate_entity_table(table_name)
        payload = json.dumps(data, ensure_ascii=False)
        with self._connect() as conn:
            conn.execute(
                f"INSERT OR REPLACE INTO {table_name} (id, project_id, data) VALUES (?, ?, ?)",
                (entity_id, project_id, payload),
            )

    def get_entity(self, table_name: str, project_id: str, entity_id: str) -> dict[str, Any] | None:
        self._validate_entity_table(table_name)
        with self._connect() as conn:
            row = conn.execute(
                f"SELECT data FROM {table_name} WHERE id = ? AND project_id = ?",
                (entity_id, project_id),
            ).fetchone()
        if row is None:
            return None
        return json.loads(row["data"])

    def list_entities(self, table_name: str, project_id: str) -> list[dict[str, Any]]:
        self._validate_entity_table(table_name)
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT data FROM {table_name} WHERE project_id = ?",
                (project_id,),
            ).fetchall()
        entities = [json.loads(row["data"]) for row in rows]
        return sorted(entities, key=lambda item: item.get("createdAt") or item.get("startedAt") or "", reverse=True)

    def delete_entity(self, table_name: str, project_id: str, entity_id: str) -> None:
        self._validate_entity_table(table_name)
        with self._connect() as conn:
            conn.execute(
                f"DELETE FROM {table_name} WHERE id = ? AND project_id = ?",
                (entity_id, project_id),
            )


class RunEventBroker:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def subscribe(self, run_id: str) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        async with self._lock:
            self._subscribers[run_id].add(queue)
        return queue

    async def unsubscribe(self, run_id: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._lock:
            run_queues = self._subscribers.get(run_id)
            if run_queues is None:
                return
            run_queues.discard(queue)
            if not run_queues:
                self._subscribers.pop(run_id, None)

    async def publish(self, run_id: str, event: dict[str, Any]) -> None:
        async with self._lock:
            run_queues = list(self._subscribers.get(run_id, set()))

        for queue in run_queues:
            await queue.put(event)


def extract_tag(text: str, tag: str) -> str | None:
    match = re.search(rf"<{tag}>([\\s\\S]*?)</{tag}>", text, flags=re.IGNORECASE)
    if not match:
        return None
    return match.group(1).strip() or None


def strip_tags(text: str) -> str:
    stripped = re.sub(r"<Heading>[\\s\\S]*?</Heading>", "", text, flags=re.IGNORECASE)
    stripped = re.sub(r"<SubHeading>[\\s\\S]*?</SubHeading>", "", stripped, flags=re.IGNORECASE)
    stripped = re.sub(r"<image>[\\s\\S]*?</image>", "", stripped, flags=re.IGNORECASE)
    stripped = re.sub(r"<[^>]+>", "", stripped)
    return stripped.strip()


def detect_warnings(raw_text: str, clean_text: str) -> list[str]:
    warnings: list[str] = []
    if not clean_text and not extract_tag(raw_text, "Heading") and not extract_tag(raw_text, "SubHeading"):
        warnings.append("Segment has no visible text")

    unclosed_matches = re.findall(r"<[A-Za-z]+(?![^>]*/>)[^>]*>(?![\\s\\S]*</)", raw_text)
    if unclosed_matches:
        warnings.append(f"Possible unclosed tag: {unclosed_matches[0]}")
    return warnings


def parse_script(content: str, project_id: str) -> list[ScriptSegment]:
    chunks = [chunk.strip() for chunk in re.split(r"^---$", content, flags=re.MULTILINE)]
    raw_segments = [chunk for chunk in chunks if chunk]

    segments: list[ScriptSegment] = []
    for index, raw_segment in enumerate(raw_segments):
        heading = extract_tag(raw_segment, "Heading")
        sub_heading = extract_tag(raw_segment, "SubHeading")
        image_prompt = extract_tag(raw_segment, "image")
        clean_text = strip_tags(raw_segment)
        warnings = detect_warnings(raw_segment, clean_text)

        segments.append(
            ScriptSegment(
                id=f"{project_id}_seg_{index}",
                projectId=project_id,
                index=index,
                rawText=raw_segment,
                cleanText=clean_text,
                heading=heading,
                subHeading=sub_heading,
                imagePrompt=image_prompt,
                warnings=warnings,
                isEmpty=not clean_text and not heading and not sub_heading,
            )
        )
    return segments


def default_project_output_folder(project_id: str, project_name: str) -> str:
    suffix = project_id.split("_")[-1][:6]
    return f"{slugify(project_name, fallback='project')}-{suffix}"


def ensure_global_output_roots() -> None:
    GLOBAL_DESIGNED_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    PROJECT_OUTPUTS_ROOT.mkdir(parents=True, exist_ok=True)


def ensure_project_workspace(project_id: str) -> Path:
    workspace = PROJECTS_ROOT / project_id
    workspace.mkdir(parents=True, exist_ok=True)
    script_path = workspace / "script.txt"
    if not script_path.exists():
        script_path.write_text("", encoding="utf-8")
    return workspace


def project_workspace(project_id: str) -> Path:
    return PROJECTS_ROOT / project_id


def resolve_path_within(root: Path, relative_path: str | Path) -> Path:
    base = root.resolve()
    target = (base / relative_path).resolve()
    if target != base and base not in target.parents:
        raise HTTPException(status_code=400, detail="Invalid asset path")
    return target


def ensure_project_output_layout(project: Project) -> Project:
    ensure_global_output_roots()
    folder = project.outputFolder
    if not folder:
        folder = default_project_output_folder(project.id, project.name)
        project = project.model_copy(update={"outputFolder": folder, "updatedAt": now_iso()})
        store.upsert_project(project)

    root = PROJECT_OUTPUTS_ROOT / folder
    (root / "audios" / "generated").mkdir(parents=True, exist_ok=True)
    (root / "images").mkdir(parents=True, exist_ok=True)
    (root / "videos").mkdir(parents=True, exist_ok=True)
    return project


def project_output_root(project: Project) -> Path:
    project = ensure_project_output_layout(project)
    return PROJECT_OUTPUTS_ROOT / (project.outputFolder or "")


def project_generated_audio_dir(project: Project) -> Path:
    return project_output_root(project) / "audios" / "generated"


def project_generated_image_dir(project: Project) -> Path:
    return project_output_root(project) / "images"


def project_generated_video_dir(project: Project) -> Path:
    return project_output_root(project) / "videos"


def get_script_path(project_id: str) -> Path:
    return ensure_project_workspace(project_id) / "script.txt"


def workspace_asset_url(project_id: str, absolute_path: Path) -> str:
    workspace = project_workspace(project_id).resolve()
    rel_path = absolute_path.resolve().relative_to(workspace)
    return f"/api/assets/{project_id}/workspace/{rel_path.as_posix()}"


def project_asset_url(project: Project, absolute_path: Path) -> str:
    output_root = project_output_root(project).resolve()
    rel_path = absolute_path.resolve().relative_to(output_root)
    return f"/api/assets/{project.id}/project/{rel_path.as_posix()}"


def global_asset_url(absolute_path: Path) -> str:
    ensure_global_output_roots()
    rel_path = absolute_path.resolve().relative_to(OUTPUTS_ROOT.resolve())
    return f"/api/global-assets/{rel_path.as_posix()}"


def resolve_asset_path(project_id: str, asset_path: str) -> Path:
    project = ensure_project_output_layout(require_project(project_id))
    if asset_path.startswith("project/"):
        return resolve_path_within(project_output_root(project), asset_path[len("project/") :])
    if asset_path.startswith("workspace/"):
        return resolve_path_within(project_workspace(project_id), asset_path[len("workspace/") :])
    return resolve_path_within(project_workspace(project_id), asset_path)


def resolve_global_asset_path(asset_path: str) -> Path:
    ensure_global_output_roots()
    return resolve_path_within(OUTPUTS_ROOT, asset_path)


def local_path_from_asset_url(project_id: str, url: str | None) -> Path | None:
    if not url:
        return None

    project_prefix = f"/api/assets/{project_id}/"
    if url.startswith(project_prefix):
        relative_path = url[len(project_prefix) :]
        return resolve_asset_path(project_id, relative_path)

    global_prefix = "/api/global-assets/"
    if url.startswith(global_prefix):
        relative_path = url[len(global_prefix) :]
        return resolve_global_asset_path(relative_path)

    return None


def make_designed_voice_id(file_path: Path) -> str:
    digest = hashlib.sha1(file_path.name.encode("utf-8")).hexdigest()[:12]
    return f"dsv_{digest}"


def list_global_designed_voice_assets() -> list[DesignedVoiceAsset]:
    ensure_global_output_roots()
    candidates = sorted(
        GLOBAL_DESIGNED_AUDIO_DIR.glob("designed_voice*_000.wav"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    assets: list[DesignedVoiceAsset] = []
    for candidate in candidates:
        stem = candidate.stem
        name = stem
        if stem.startswith("designed_voice_"):
            name = stem[len("designed_voice_") :]
        if name.endswith("_000"):
            name = name[: -len("_000")]
        display_name = name.replace("_", " ").strip() or candidate.stem
        assets.append(
            DesignedVoiceAsset(
                id=make_designed_voice_id(candidate),
                filename=candidate.name,
                name=display_name,
                audioUrl=global_asset_url(candidate),
                createdAt=datetime.fromtimestamp(candidate.stat().st_mtime, tz=timezone.utc).isoformat(),
            )
        )
    return assets


def get_global_designed_voice_asset(asset_id: str) -> DesignedVoiceAsset | None:
    for asset in list_global_designed_voice_assets():
        if asset.id == asset_id:
            return asset
    return None


def read_duration_seconds(path: Path) -> float | None:
    if not path.exists():
        return None
    try:
        with wave.open(str(path), "rb") as wav_file:
            frame_rate = wav_file.getframerate()
            if frame_rate <= 0:
                return None
            return wav_file.getnframes() / float(frame_rate)
    except wave.Error:
        try:
            result = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    str(path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
        except (FileNotFoundError, subprocess.CalledProcessError):
            return None
        try:
            return float(result.stdout.strip())
        except ValueError:
            return None


async def run_python_script(
    script_name: str,
    project_id: str,
    args: list[str] | None = None,
    env_extra: dict[str, str] | None = None,
    line_callback: Any | None = None,
) -> tuple[list[str], list[str]]:
    args = args or []
    script_path = SCRIPTS_DIR / script_name
    if not script_path.exists():
        raise RuntimeError(f"Script was not found: {script_path}")

    workspace = ensure_project_workspace(project_id)

    command = [sys.executable, str(script_path), *args]
    environment = os.environ.copy()
    environment["SEALED_NECTOR_PROJECT_ROOT"] = str(workspace)
    if env_extra:
        for key, value in env_extra.items():
            environment[key] = value

    process = await asyncio.create_subprocess_exec(
        *command,
        cwd=str(REPO_ROOT),
        env=environment,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    async def consume_stream(stream: asyncio.StreamReader | None, is_error: bool) -> list[str]:
        if stream is None:
            return []
        captured: list[str] = []
        while True:
            raw_line = await stream.readline()
            if not raw_line:
                break
            line = raw_line.decode("utf-8", errors="replace").rstrip()
            captured.append(line)
            if line_callback is not None:
                maybe_result = line_callback(line, is_error)
                if asyncio.iscoroutine(maybe_result):
                    await maybe_result
        return captured

    stdout_lines, stderr_lines = await asyncio.gather(
        consume_stream(process.stdout, False),
        consume_stream(process.stderr, True),
    )

    return_code = await process.wait()
    if return_code != 0:
        merged_tail = (stderr_lines or stdout_lines)[-12:]
        details = "\n".join(merged_tail) if merged_tail else "No script output"
        raise RuntimeError(
            f"Script {script_name} failed with exit code {return_code}.\n{details}"
        )

    return stdout_lines, stderr_lines


def collect_generated_audio_files(project_id: str) -> dict[int, Path]:
    project = ensure_project_output_layout(require_project(project_id))
    generated_dir = project_generated_audio_dir(project)
    pattern = re.compile(r"test_audio_(\d+)_\d+\.wav$", re.IGNORECASE)
    by_index: dict[int, Path] = {}
    for candidate in sorted(generated_dir.glob("test_audio_*.wav")):
        match = pattern.fullmatch(candidate.name)
        if not match:
            continue
        segment_index = int(match.group(1))
        by_index[segment_index] = candidate
    return by_index


def collect_generated_image_files(project_id: str) -> dict[int, Path]:
    project = ensure_project_output_layout(require_project(project_id))
    images_dir = project_generated_image_dir(project)
    pattern = re.compile(r"image_block_(\d+)\.[A-Za-z0-9]+$", re.IGNORECASE)
    by_block: dict[int, Path] = {}
    for candidate in sorted(images_dir.iterdir()) if images_dir.exists() else []:
        if not candidate.is_file():
            continue
        match = pattern.fullmatch(candidate.name)
        if not match:
            continue
        block_index = int(match.group(1))
        by_block[block_index] = candidate
    return by_block


def save_project_script(project_id: str, content: str) -> None:
    script_path = get_script_path(project_id)
    script_path.write_text(content, encoding="utf-8")


def load_project_script(project_id: str) -> str:
    return get_script_path(project_id).read_text(encoding="utf-8")


store = JsonStore(DB_PATH)
broker = RunEventBroker()

app = FastAPI(title="Sealed Nector Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_project(project_id: str) -> Project:
    project = store.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return ensure_project_output_layout(project)


def upsert_run(run: RunJob) -> None:
    store.upsert_entity("runs", run.projectId, run.id, run.model_dump())


def get_run(project_id: str, run_id: str) -> RunJob:
    payload = store.get_entity("runs", project_id, run_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunJob.model_validate(payload)


def set_project_status(project_id: str, status: ProjectStatus) -> Project:
    project = require_project(project_id)
    updated_project = project.model_copy(update={"status": status, "updatedAt": now_iso()})
    store.upsert_project(updated_project)
    return updated_project


def run_item_id_for_segment(project_id: str, segment_index: int) -> str:
    return f"{project_id}_seg_{segment_index}"


async def publish_run_event(run_id: str, event_type: str, payload: dict[str, Any]) -> None:
    await broker.publish(run_id, {"type": event_type, **payload})


def spawn_background_task(coroutine: Any) -> None:
    task = asyncio.create_task(coroutine)

    def _log_background_failure(done_task: asyncio.Task[Any]) -> None:
        try:
            done_task.result()
        except Exception as exc:  # noqa: BLE001
            print(f"[backend] background task failed: {exc}", file=sys.stderr)

    task.add_done_callback(_log_background_failure)


async def finalize_run(
    run: RunJob,
    status: JobStatus,
    project_status: ProjectStatus,
    error: str | None = None,
) -> None:
    completed_run = run.model_copy(update={"status": status, "completedAt": now_iso()})
    upsert_run(completed_run)
    set_project_status(run.projectId, project_status)
    await publish_run_event(completed_run.id, "run-update", {"run": completed_run.model_dump()})
    if error:
        await publish_run_event(completed_run.id, "run-error", {"message": error})
    terminal_event = "run-completed" if status == "success" else "run-failed"
    await publish_run_event(completed_run.id, terminal_event, {"run": completed_run.model_dump()})


def list_voice_design_models(project_id: str) -> list[VoiceDesign]:
    return [item for item in load_valid_entities("voice_designs", project_id, VoiceDesign) if isinstance(item, VoiceDesign)]


def unset_default_voice_designs(project_id: str, except_id: str) -> None:
    existing_designs = list_voice_design_models(project_id)
    for voice_design in existing_designs:
        if voice_design.id == except_id:
            continue
        if not voice_design.isDefault:
            continue
        updated_design = voice_design.model_copy(update={"isDefault": False})
        store.upsert_entity("voice_designs", project_id, updated_design.id, updated_design.model_dump())


async def run_voice_design_pipeline(
    project_id: str,
    run: RunJob,
    voice_design: VoiceDesign,
    set_as_default: bool,
) -> None:
    try:
        set_project_status(project_id, "running")
        running_design = voice_design.model_copy(update={"status": "running"})
        store.upsert_entity("voice_designs", project_id, running_design.id, running_design.model_dump())
        await publish_run_event(run.id, "voice-design-update", {"voiceDesign": running_design.model_dump()})

        voice_slug = slugify(voice_design.name)
        env_extra = {
            "VOICE_DESIGN_NAME": voice_slug,
            "VOICE_DESIGN_INSTRUCTION": voice_design.promptInstruction,
            "VOICE_DESIGN_SPEED": str(voice_design.speed),
            "SEALED_NECTOR_PROJECT_ROOT": str(REPO_ROOT),
        }
        if voice_design.referenceText.strip():
            env_extra["VOICE_DESIGN_REFERENCE_TEXT"] = voice_design.referenceText

        async def on_script_line(line: str, is_error: bool) -> None:
            await publish_run_event(
                run.id,
                "log",
                {"stream": "stderr" if is_error else "stdout", "line": line},
            )

        await run_python_script(
            "voice-design.py",
            project_id=project_id,
            env_extra=env_extra,
            line_callback=on_script_line,
        )

        ensure_global_output_roots()
        designed_dir = GLOBAL_DESIGNED_AUDIO_DIR
        preferred_path = designed_dir / f"designed_voice_{voice_slug}_000.wav"
        if preferred_path.exists():
            audio_path = preferred_path
        else:
            candidates = sorted(designed_dir.glob("designed_voice*_000.wav"))
            if not candidates:
                raise RuntimeError("Designed voice file was not generated")
            audio_path = candidates[-1]

        duration = read_duration_seconds(audio_path)
        completed_design = running_design.model_copy(
            update={
                "status": "success",
                "audioUrl": global_asset_url(audio_path),
                "duration": duration,
                "isDefault": set_as_default or running_design.isDefault,
            }
        )
        store.upsert_entity("voice_designs", project_id, completed_design.id, completed_design.model_dump())

        if completed_design.isDefault:
            unset_default_voice_designs(project_id, completed_design.id)
            project = require_project(project_id)
            store.upsert_project(
                project.model_copy(
                    update={
                        "defaultVoiceDesignId": completed_design.id,
                        "updatedAt": now_iso(),
                    }
                )
            )

        await publish_run_event(run.id, "voice-design-update", {"voiceDesign": completed_design.model_dump()})
        await finalize_run(run, status="success", project_status="success")
    except Exception as exc:  # noqa: BLE001
        failed_design = voice_design.model_copy(update={"status": "failed"})
        store.upsert_entity("voice_designs", project_id, failed_design.id, failed_design.model_dump())
        await publish_run_event(run.id, "voice-design-update", {"voiceDesign": failed_design.model_dump()})
        await finalize_run(run, status="failed", project_status="failed", error=str(exc))


async def run_audio_generation_pipeline(
    project_id: str,
    run: RunJob,
    request: GenerateAudiosRequest,
) -> None:
    try:
        project = set_project_status(project_id, "running")
        segments = parse_script(project.scriptContent, project_id)
        if not segments:
            raise RuntimeError("No script segments available. Save script content first.")

        all_indices = sorted(segment.index for segment in segments)
        requested_indices = sorted(set(request.segmentIndices or all_indices))

        segment_by_index = {segment.index: segment for segment in segments}
        existing_audios = [
            GeneratedAudio.model_validate(item)
            for item in store.list_entities("audios", project_id)
        ]
        existing_by_index = {audio.segmentIndex: audio for audio in existing_audios}

        reference_text: str | None = None
        selected_reference_id: str | None = None
        reference_audio_path: Path | None = None

        if request.designedVoiceId:
            selected_asset = get_global_designed_voice_asset(request.designedVoiceId)
            if selected_asset is None:
                raise RuntimeError("Selected designed voice was not found")
            resolved_path = local_path_from_asset_url(project_id, selected_asset.audioUrl)
            if resolved_path is None or not resolved_path.exists():
                raise RuntimeError("Selected designed voice file is unavailable")
            selected_reference_id = selected_asset.id
            reference_audio_path = resolved_path
        else:
            requested_voice_id = request.voiceDesignId
            candidate_voice_ids = [voice_id for voice_id in [requested_voice_id, project.defaultVoiceDesignId] if voice_id]
            for candidate_voice_id in candidate_voice_ids:
                selected_voice_payload = store.get_entity("voice_designs", project_id, candidate_voice_id)
                if selected_voice_payload is None:
                    if requested_voice_id and candidate_voice_id == requested_voice_id:
                        raise RuntimeError("Selected voice design was not found")
                    continue
                selected_voice = VoiceDesign.model_validate(selected_voice_payload)
                resolved_path = local_path_from_asset_url(project_id, selected_voice.audioUrl)
                if resolved_path is None or not resolved_path.exists():
                    continue
                selected_reference_id = selected_voice.id
                reference_audio_path = resolved_path
                if selected_voice.referenceText.strip():
                    reference_text = selected_voice.referenceText.strip()
                break

            if reference_audio_path is None:
                fallback_assets = list_global_designed_voice_assets()
                if fallback_assets:
                    fallback_asset = fallback_assets[0]
                    resolved_path = local_path_from_asset_url(project_id, fallback_asset.audioUrl)
                    if resolved_path is not None and resolved_path.exists():
                        selected_reference_id = fallback_asset.id
                        reference_audio_path = resolved_path

        if reference_audio_path is None or selected_reference_id is None:
            raise RuntimeError(
                "No designed voice is available. Create one first in Voice Design or add a file to outputs/audios/designed."
            )

        for segment_index in requested_indices:
            segment = segment_by_index.get(segment_index)
            if segment is None:
                continue
            previous_audio = existing_by_index.get(segment_index)
            running_audio = GeneratedAudio(
                id=previous_audio.id if previous_audio else create_id("aud"),
                projectId=project_id,
                segmentId=segment.id,
                segmentIndex=segment.index,
                voiceDesignId=selected_reference_id,
                status="running",
                progress=0,
                audioUrl=None,
                duration=None,
                createdAt=now_iso(),
                runId=run.id,
            )
            store.upsert_entity("audios", project_id, running_audio.id, running_audio.model_dump())
            await publish_run_event(run.id, "audio-update", {"audio": running_audio.model_dump()})

        clear_existing = request.clearExisting
        if clear_existing is None:
            clear_existing = request.segmentIndices is None

        target_audio_dir = project_generated_audio_dir(project)
        target_audio_dir.mkdir(parents=True, exist_ok=True)
        script_args = [
            f"script={get_script_path(project_id)}",
            f"output-dir={target_audio_dir}",
            f"segment-indices={','.join(str(index) for index in requested_indices)}",
            f"clear-existing={'yes' if clear_existing else 'no'}",
        ]
        if request.speed is not None:
            script_args.append(f"speed={request.speed}")

        env_extra: dict[str, str] = {
            "VOICE_REF_AUDIO": str(reference_audio_path),
        }
        if reference_text:
            env_extra["VOICE_REF_TEXT"] = reference_text

        async def on_script_line(line: str, is_error: bool) -> None:
            await publish_run_event(
                run.id,
                "log",
                {"stream": "stderr" if is_error else "stdout", "line": line},
            )

        await run_python_script(
            "voice-generate.py",
            project_id=project_id,
            args=script_args,
            env_extra=env_extra,
            line_callback=on_script_line,
        )

        generated_files = collect_generated_audio_files(project_id)
        failures = 0
        for segment_index in requested_indices:
            segment = segment_by_index.get(segment_index)
            if segment is None:
                continue

            previous_audio = existing_by_index.get(segment_index)
            audio_file = generated_files.get(segment_index)
            if audio_file is None:
                failures += 1
                failed_audio = GeneratedAudio(
                    id=previous_audio.id if previous_audio else create_id("aud"),
                    projectId=project_id,
                    segmentId=segment.id,
                    segmentIndex=segment.index,
                    voiceDesignId=selected_reference_id,
                    status="failed",
                    progress=0,
                    audioUrl=None,
                    duration=None,
                    createdAt=now_iso(),
                    runId=run.id,
                )
                store.upsert_entity("audios", project_id, failed_audio.id, failed_audio.model_dump())
                await publish_run_event(run.id, "audio-update", {"audio": failed_audio.model_dump()})
                continue

            completed_audio = GeneratedAudio(
                id=previous_audio.id if previous_audio else create_id("aud"),
                projectId=project_id,
                segmentId=segment.id,
                segmentIndex=segment.index,
                voiceDesignId=selected_reference_id,
                status="success",
                progress=100,
                audioUrl=project_asset_url(project, audio_file),
                duration=read_duration_seconds(audio_file),
                createdAt=now_iso(),
                runId=run.id,
            )
            store.upsert_entity("audios", project_id, completed_audio.id, completed_audio.model_dump())
            await publish_run_event(run.id, "audio-update", {"audio": completed_audio.model_dump()})

        if failures:
            await finalize_run(
                run,
                status="failed",
                project_status="failed",
                error=f"Audio generation failed for {failures} segment(s)",
            )
        else:
            await finalize_run(run, status="success", project_status="success")
    except Exception as exc:  # noqa: BLE001
        await finalize_run(run, status="failed", project_status="failed", error=str(exc))


async def run_image_generation_pipeline(
    project_id: str,
    run: RunJob,
    request: GenerateImagesRequest,
) -> None:
    try:
        project = set_project_status(project_id, "running")
        segments = parse_script(project.scriptContent, project_id)

        prompt_segments = [segment for segment in segments if segment.imagePrompt]
        if not prompt_segments:
            raise RuntimeError("No <image> prompt blocks were found in the script")

        if request.segmentIndices is None:
            target_segments = prompt_segments
        else:
            requested_set = set(request.segmentIndices)
            target_segments = [segment for segment in prompt_segments if segment.index in requested_set]

        if not target_segments:
            raise RuntimeError("No target segments with image prompts were selected")

        set_project_status(project_id, "running")
        existing_images = [
            GeneratedImage.model_validate(item)
            for item in store.list_entities("images", project_id)
        ]
        existing_by_index = {image.segmentIndex: image for image in existing_images}
        target_indices = sorted(segment.index for segment in target_segments)

        for segment in target_segments:
            previous_image = existing_by_index.get(segment.index)
            running_image = GeneratedImage(
                id=previous_image.id if previous_image else create_id("img"),
                projectId=project_id,
                segmentId=segment.id,
                segmentIndex=segment.index,
                prompt=segment.imagePrompt or "",
                status="running",
                progress=0,
                thumbnailUrl=None,
                width=request.width or project.videoSettings.width,
                height=request.height or project.videoSettings.height,
                createdAt=now_iso(),
                runId=run.id,
            )
            store.upsert_entity("images", project_id, running_image.id, running_image.model_dump())
            await publish_run_event(run.id, "image-update", {"image": running_image.model_dump()})

        target_image_dir = project_generated_image_dir(project)
        target_image_dir.mkdir(parents=True, exist_ok=True)
        script_args = [
            f"script={get_script_path(project_id)}",
            f"output-dir={target_image_dir}",
            f"block-indices={','.join(str(index + 1) for index in target_indices)}",
        ]
        if request.width is not None and request.height is not None:
            script_args.extend([f"width={request.width}", f"height={request.height}"])
        if request.maxWorkers is not None:
            script_args.append(f"max-workers={request.maxWorkers}")

        block_event_re = re.compile(r"\[block\s+(\d+)\].*(saved|failed)", re.IGNORECASE)

        async def on_script_line(line: str, is_error: bool) -> None:
            await publish_run_event(
                run.id,
                "log",
                {"stream": "stderr" if is_error else "stdout", "line": line},
            )
            match = block_event_re.search(line)
            if not match:
                return
            block_index = int(match.group(1))
            segment_index = block_index - 1
            if segment_index not in target_indices:
                return
            state = match.group(2).lower()
            await publish_run_event(
                run.id,
                "image-progress",
                {
                    "segmentIndex": segment_index,
                    "status": "success" if state == "saved" else "failed",
                    "progress": 100 if state == "saved" else 0,
                },
            )

        await run_python_script(
            "generate-image.py",
            project_id=project_id,
            args=script_args,
            line_callback=on_script_line,
        )

        generated_files = collect_generated_image_files(project_id)
        failures = 0
        for segment in target_segments:
            previous_image = existing_by_index.get(segment.index)
            image_file = generated_files.get(segment.index + 1)
            if image_file is None:
                failures += 1
                failed_image = GeneratedImage(
                    id=previous_image.id if previous_image else create_id("img"),
                    projectId=project_id,
                    segmentId=segment.id,
                    segmentIndex=segment.index,
                    prompt=segment.imagePrompt or "",
                    status="failed",
                    progress=0,
                    thumbnailUrl=None,
                    width=request.width or project.videoSettings.width,
                    height=request.height or project.videoSettings.height,
                    createdAt=now_iso(),
                    runId=run.id,
                )
                store.upsert_entity("images", project_id, failed_image.id, failed_image.model_dump())
                await publish_run_event(run.id, "image-update", {"image": failed_image.model_dump()})
                continue

            success_image = GeneratedImage(
                id=previous_image.id if previous_image else create_id("img"),
                projectId=project_id,
                segmentId=segment.id,
                segmentIndex=segment.index,
                prompt=segment.imagePrompt or "",
                status="success",
                progress=100,
                thumbnailUrl=project_asset_url(project, image_file),
                width=request.width or project.videoSettings.width,
                height=request.height or project.videoSettings.height,
                createdAt=now_iso(),
                runId=run.id,
            )
            store.upsert_entity("images", project_id, success_image.id, success_image.model_dump())
            await publish_run_event(run.id, "image-update", {"image": success_image.model_dump()})

        if failures:
            await finalize_run(
                run,
                status="failed",
                project_status="failed",
                error=f"Image generation failed for {failures} segment(s)",
            )
        else:
            await finalize_run(run, status="success", project_status="success")
    except Exception as exc:  # noqa: BLE001
        await finalize_run(run, status="failed", project_status="failed", error=str(exc))


def build_video_script_args(
    settings: VideoSettings,
    script_path: Path,
    audio_dir: Path,
    images_dir: Path,
    output_path: Path,
) -> list[str]:
    return [
        f"script={script_path}",
        f"audio-dir={audio_dir}",
        f"images-dir={images_dir}",
        f"output={output_path}",
        f"width={settings.width}",
        f"height={settings.height}",
        f"fps={settings.fps}",
        f"font={settings.fontFamily}",
        f"arabic-font={settings.arabicFontFamily}",
        f"font-color={settings.bodyColor}",
        f"heading-font-color={settings.headingColor}",
        f"subheading-font-color={settings.subHeadingColor}",
        f"background={settings.backgroundColor}",
        f"words-per-scene={settings.wordsPerScene}",
        f"seperate-text-by-seperatorline={'yes' if settings.separatorLine else 'no'}",
        f"fade-transition={'yes' if settings.fadeTransition else 'no'}",
        f"fade-duration={settings.fadeTransitionDuration}",
        "filter-threads=1",
        "filter-complex-threads=1",
    ]


def initial_video_stages() -> list[VideoStage]:
    return [
        VideoStage(label="Preparing scenes", status="idle", progress=0),
        VideoStage(label="Generating missing voice", status="idle", progress=0),
        VideoStage(label="Generating missing images", status="idle", progress=0),
        VideoStage(label="Rendering frames", status="idle", progress=0),
        VideoStage(label="Encoding audio", status="idle", progress=0),
        VideoStage(label="Compositing video", status="idle", progress=0),
        VideoStage(label="Finalizing output", status="idle", progress=0),
    ]


async def publish_video_stages(run_id: str, stages: list[VideoStage]) -> None:
    await publish_run_event(
        run_id,
        "video-stages",
        {"stages": [stage.model_dump() for stage in stages]},
    )


async def run_video_generation_pipeline(
    project_id: str,
    run: RunJob,
    request: GenerateVideoRequest,
    settings: VideoSettings,
) -> None:
    video_id = create_id("vid")
    stages = initial_video_stages()
    try:
        project = set_project_status(project_id, "running")
        updated_project = project.model_copy(update={"videoSettings": settings, "updatedAt": now_iso()})
        store.upsert_project(updated_project)
        project = ensure_project_output_layout(updated_project)

        stages[0] = stages[0].model_copy(update={"status": "running", "progress": 100})
        await publish_video_stages(run.id, stages)

        video_record = GeneratedVideo(
            id=video_id,
            projectId=project_id,
            status="running",
            progress=0,
            stages=stages,
            videoUrl=None,
            thumbnailUrl=None,
            filename=settings.outputFilename,
            duration=None,
            createdAt=now_iso(),
            runId=run.id,
            settings=settings,
        )
        store.upsert_entity("videos", project_id, video_record.id, video_record.model_dump())

        segments = parse_script(project.scriptContent, project_id)

        existing_audio_files = collect_generated_audio_files(project_id)
        missing_audio_indices = sorted(
            segment.index
            for segment in segments
            if segment.cleanText and segment.index not in existing_audio_files
        )
        if missing_audio_indices:
            if not request.autoGenerateAudios:
                raise RuntimeError(
                    "Missing generated audios for one or more segments. Enable automatic audio generation or generate them first."
                )

            stages[1] = stages[1].model_copy(update={"status": "running", "progress": 30})
            await publish_video_stages(run.id, stages)

            auto_audio_run = RunJob(
                id=create_id("run"),
                projectId=project_id,
                type="generate-voice",
                status="running",
                startedAt=now_iso(),
                completedAt=None,
                itemIds=[run_item_id_for_segment(project_id, index) for index in missing_audio_indices],
                label="Auto-generate missing voice segments",
            )
            upsert_run(auto_audio_run)
            await run_audio_generation_pipeline(
                project_id,
                auto_audio_run,
                GenerateAudiosRequest(
                    segmentIndices=missing_audio_indices,
                    voiceDesignId=request.voiceDesignId,
                    designedVoiceId=request.designedVoiceId,
                    clearExisting=False,
                ),
            )
            audio_run_result = get_run(project_id, auto_audio_run.id)
            if audio_run_result.status != "success":
                raise RuntimeError("Automatic voice generation failed for missing segment(s)")

        stages[1] = stages[1].model_copy(update={"status": "success", "progress": 100})
        await publish_video_stages(run.id, stages)

        existing_image_files = collect_generated_image_files(project_id)
        missing_image_indices = sorted(
            segment.index
            for segment in segments
            if segment.imagePrompt and (segment.index + 1) not in existing_image_files
        )

        if missing_image_indices and request.autoGenerateImages:
            stages[2] = stages[2].model_copy(update={"status": "running", "progress": 30})
            await publish_video_stages(run.id, stages)

            auto_image_run = RunJob(
                id=create_id("run"),
                projectId=project_id,
                type="generate-images",
                status="running",
                startedAt=now_iso(),
                completedAt=None,
                itemIds=[run_item_id_for_segment(project_id, index) for index in missing_image_indices],
                label="Auto-generate missing images",
            )
            upsert_run(auto_image_run)
            await run_image_generation_pipeline(
                project_id,
                auto_image_run,
                GenerateImagesRequest(segmentIndices=missing_image_indices),
            )
            image_run_result = get_run(project_id, auto_image_run.id)
            if image_run_result.status != "success":
                raise RuntimeError("Automatic image generation failed for missing segment(s)")

        stages[2] = stages[2].model_copy(update={"status": "success", "progress": 100})
        stages[3] = stages[3].model_copy(update={"status": "running", "progress": 20})
        await publish_video_stages(run.id, stages)

        script_path = get_script_path(project_id)
        audio_dir = project_generated_audio_dir(project)
        images_dir = project_generated_image_dir(project)
        output_path = project_generated_video_dir(project) / settings.outputFilename
        project_generated_video_dir(project).mkdir(parents=True, exist_ok=True)

        async def on_script_line(line: str, is_error: bool) -> None:
            await publish_run_event(
                run.id,
                "log",
                {"stream": "stderr" if is_error else "stdout", "line": line},
            )

        await run_python_script(
            "generate-video.py",
            project_id=project_id,
            args=build_video_script_args(
                settings=settings,
                script_path=script_path,
                audio_dir=audio_dir,
                images_dir=images_dir,
                output_path=output_path,
            ),
            line_callback=on_script_line,
        )

        if not output_path.exists():
            raise RuntimeError("Video output file was not generated")

        stages[3] = stages[3].model_copy(update={"status": "success", "progress": 100})
        stages[4] = stages[4].model_copy(update={"status": "success", "progress": 100})
        stages[5] = stages[5].model_copy(update={"status": "success", "progress": 100})
        stages[6] = stages[6].model_copy(update={"status": "success", "progress": 100})
        await publish_video_stages(run.id, stages)

        completed_video = GeneratedVideo(
            id=video_record.id,
            projectId=project_id,
            status="success",
            progress=100,
            stages=stages,
            videoUrl=project_asset_url(project, output_path),
            thumbnailUrl=None,
            filename=settings.outputFilename,
            duration=read_duration_seconds(output_path),
            createdAt=now_iso(),
            runId=run.id,
            settings=settings,
        )
        store.upsert_entity("videos", project_id, completed_video.id, completed_video.model_dump())
        await publish_run_event(run.id, "video-update", {"video": completed_video.model_dump()})

        await finalize_run(run, status="success", project_status="success")
    except Exception as exc:  # noqa: BLE001
        failed_stages = [
            stage.model_copy(update={"status": "failed" if stage.status == "running" else stage.status})
            for stage in stages
        ]
        failed_video = GeneratedVideo(
            id=video_id,
            projectId=project_id,
            status="failed",
            progress=0,
            stages=failed_stages,
            videoUrl=None,
            thumbnailUrl=None,
            filename=settings.outputFilename,
            duration=None,
            createdAt=now_iso(),
            runId=run.id,
            settings=settings,
        )
        store.upsert_entity("videos", project_id, failed_video.id, failed_video.model_dump())
        await publish_run_event(run.id, "video-update", {"video": failed_video.model_dump()})
        await finalize_run(run, status="failed", project_status="failed", error=str(exc))


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/projects", response_model=list[Project])
def list_projects() -> list[Project]:
    projects = [ensure_project_output_layout(project) for project in store.list_projects()]
    return projects


@app.post("/api/projects", response_model=Project)
def create_project(request: CreateProjectRequest) -> Project:
    project_id = create_id("proj")
    created_at = now_iso()
    output_folder = default_project_output_folder(project_id, request.name)
    project = Project(
        id=project_id,
        name=request.name,
        description=request.description,
        language=request.language,
        aspectRatio=request.aspectRatio,
        createdAt=created_at,
        updatedAt=created_at,
        status="idle",
        archived=False,
        scriptContent="",
        defaultVoiceDesignId=None,
        outputFolder=output_folder,
        videoSettings=default_video_settings(request.aspectRatio, request.name),
    )
    ensure_project_workspace(project.id)
    ensure_project_output_layout(project)
    save_project_script(project.id, project.scriptContent)
    store.upsert_project(project)
    return project


@app.get("/api/projects/{project_id}", response_model=Project)
def get_project(project_id: str) -> Project:
    return require_project(project_id)


@app.patch("/api/projects/{project_id}", response_model=Project)
def update_project(project_id: str, request: UpdateProjectRequest) -> Project:
    project = require_project(project_id)

    update_payload = request.model_dump(exclude_unset=True)
    update_payload.pop("outputFolder", None)
    if not update_payload:
        return project

    if "scriptContent" in update_payload:
        save_project_script(project_id, update_payload["scriptContent"])

    updated_project = project.model_copy(update={**update_payload, "updatedAt": now_iso()})
    store.upsert_project(updated_project)
    return updated_project


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str) -> JSONResponse:
    project = require_project(project_id)
    store.delete_project(project_id)
    workspace = project_workspace(project_id)
    if workspace.exists():
        shutil.rmtree(workspace)
    output_root = project_output_root(project)
    if output_root.exists():
        shutil.rmtree(output_root)
    return JSONResponse({"status": "deleted"})


@app.post("/api/projects/{project_id}/duplicate", response_model=Project)
def duplicate_project(project_id: str) -> Project:
    project = require_project(project_id)
    new_project_id = create_id("proj")
    created_at = now_iso()
    duplicate = project.model_copy(
        update={
            "id": new_project_id,
            "name": f"{project.name} (copy)",
            "createdAt": created_at,
            "updatedAt": created_at,
            "status": "idle",
            "archived": False,
            "defaultVoiceDesignId": None,
            "outputFolder": default_project_output_folder(new_project_id, f"{project.name} (copy)"),
        }
    )
    ensure_project_workspace(duplicate.id)
    ensure_project_output_layout(duplicate)
    save_project_script(duplicate.id, project.scriptContent)
    store.upsert_project(duplicate)
    return duplicate


@app.get("/api/projects/{project_id}/script")
def get_project_script(project_id: str) -> dict[str, Any]:
    project = require_project(project_id)
    script_content = load_project_script(project_id)
    segments = parse_script(script_content, project_id)
    return {"content": script_content, "segments": [segment.model_dump() for segment in segments], "project": project.model_dump()}


@app.put("/api/projects/{project_id}/script")
def save_project_script_endpoint(project_id: str, request: ScriptUpdateRequest) -> dict[str, Any]:
    project = require_project(project_id)
    save_project_script(project_id, request.content)
    updated_project = project.model_copy(update={"scriptContent": request.content, "updatedAt": now_iso()})
    store.upsert_project(updated_project)
    segments = parse_script(request.content, project_id)
    return {
        "content": request.content,
        "segments": [segment.model_dump() for segment in segments],
        "project": updated_project.model_dump(),
    }


@app.get("/api/projects/{project_id}/voice-designs", response_model=list[VoiceDesign])
def list_voice_designs(project_id: str) -> list[VoiceDesign]:
    require_project(project_id)
    return list_voice_design_models(project_id)


@app.get("/api/designed-voices", response_model=list[DesignedVoiceAsset])
def list_global_designed_voices() -> list[DesignedVoiceAsset]:
    return list_global_designed_voice_assets()


@app.post("/api/projects/{project_id}/voice-designs")
async def create_voice_design(project_id: str, request: VoiceDesignCreateRequest) -> dict[str, Any]:
    require_project(project_id)

    voice_design = VoiceDesign(
        id=create_id("vd"),
        projectId=project_id,
        name=request.name,
        promptInstruction=request.promptInstruction,
        referenceText=request.referenceText,
        speed=request.speed,
        tonePreset=request.tonePreset,
        narrationMood=request.narrationMood,
        createdAt=now_iso(),
        duration=None,
        status="queued",
        audioUrl=None,
        isDefault=False,
    )
    store.upsert_entity("voice_designs", project_id, voice_design.id, voice_design.model_dump())

    run = RunJob(
        id=create_id("run"),
        projectId=project_id,
        type="voice-design",
        status="running",
        startedAt=now_iso(),
        completedAt=None,
        itemIds=[voice_design.id],
        label=f"Design voice: {voice_design.name}",
    )
    upsert_run(run)

    spawn_background_task(
        run_voice_design_pipeline(
            project_id=project_id,
            run=run,
            voice_design=voice_design,
            set_as_default=request.setAsDefault,
        )
    )

    return {"run": run.model_dump(), "voiceDesign": voice_design.model_dump()}


@app.delete("/api/projects/{project_id}/voice-designs/{voice_design_id}")
def delete_voice_design(project_id: str, voice_design_id: str) -> JSONResponse:
    payload = store.get_entity("voice_designs", project_id, voice_design_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Voice design not found")

    store.delete_entity("voice_designs", project_id, voice_design_id)
    project = require_project(project_id)
    if project.defaultVoiceDesignId == voice_design_id:
        store.upsert_project(project.model_copy(update={"defaultVoiceDesignId": None, "updatedAt": now_iso()}))
    return JSONResponse({"status": "deleted"})


@app.post("/api/projects/{project_id}/default-voice")
def set_default_voice(project_id: str, body: dict[str, str]) -> dict[str, Any]:
    voice_design_id = body.get("voiceDesignId")
    if not voice_design_id:
        raise HTTPException(status_code=400, detail="voiceDesignId is required")

    payload = store.get_entity("voice_designs", project_id, voice_design_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Voice design not found")

    unset_default_voice_designs(project_id, voice_design_id)
    selected = VoiceDesign.model_validate(payload).model_copy(update={"isDefault": True})
    store.upsert_entity("voice_designs", project_id, selected.id, selected.model_dump())

    project = require_project(project_id)
    updated_project = project.model_copy(update={"defaultVoiceDesignId": selected.id, "updatedAt": now_iso()})
    store.upsert_project(updated_project)
    return {"project": updated_project.model_dump(), "voiceDesign": selected.model_dump()}


@app.get("/api/projects/{project_id}/audios", response_model=list[GeneratedAudio])
def list_generated_audios(project_id: str) -> list[GeneratedAudio]:
    require_project(project_id)
    return [item for item in load_valid_entities("audios", project_id, GeneratedAudio) if isinstance(item, GeneratedAudio)]


@app.post("/api/projects/{project_id}/generate-audios")
async def generate_audios(project_id: str, request: GenerateAudiosRequest) -> dict[str, Any]:
    require_project(project_id)

    run = RunJob(
        id=create_id("run"),
        projectId=project_id,
        type="generate-voice",
        status="running",
        startedAt=now_iso(),
        completedAt=None,
        itemIds=[run_item_id_for_segment(project_id, index) for index in sorted(set(request.segmentIndices or []))],
        label="Generate voice segments",
    )
    upsert_run(run)
    spawn_background_task(run_audio_generation_pipeline(project_id, run, request))
    return {"run": run.model_dump()}


@app.delete("/api/projects/{project_id}/audios/{audio_id}")
def delete_audio(project_id: str, audio_id: str) -> JSONResponse:
    payload = store.get_entity("audios", project_id, audio_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Audio not found")

    audio = GeneratedAudio.model_validate(payload)
    file_path = local_path_from_asset_url(project_id, audio.audioUrl)
    if file_path is not None and file_path.exists():
        file_path.unlink(missing_ok=True)

    store.delete_entity("audios", project_id, audio_id)
    return JSONResponse({"status": "deleted"})


@app.get("/api/projects/{project_id}/images", response_model=list[GeneratedImage])
def list_generated_images(project_id: str) -> list[GeneratedImage]:
    require_project(project_id)
    return [item for item in load_valid_entities("images", project_id, GeneratedImage) if isinstance(item, GeneratedImage)]


@app.post("/api/projects/{project_id}/generate-images")
async def generate_images(project_id: str, request: GenerateImagesRequest) -> dict[str, Any]:
    require_project(project_id)

    run = RunJob(
        id=create_id("run"),
        projectId=project_id,
        type="generate-images",
        status="running",
        startedAt=now_iso(),
        completedAt=None,
        itemIds=[run_item_id_for_segment(project_id, index) for index in sorted(set(request.segmentIndices or []))],
        label="Generate scene images",
    )
    upsert_run(run)
    spawn_background_task(run_image_generation_pipeline(project_id, run, request))
    return {"run": run.model_dump()}


@app.delete("/api/projects/{project_id}/images/{image_id}")
def delete_image(project_id: str, image_id: str) -> JSONResponse:
    payload = store.get_entity("images", project_id, image_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Image not found")

    image = GeneratedImage.model_validate(payload)
    file_path = local_path_from_asset_url(project_id, image.thumbnailUrl)
    if file_path is not None and file_path.exists():
        file_path.unlink(missing_ok=True)

    store.delete_entity("images", project_id, image_id)
    return JSONResponse({"status": "deleted"})


@app.get("/api/projects/{project_id}/videos", response_model=list[GeneratedVideo])
def list_generated_videos(project_id: str) -> list[GeneratedVideo]:
    require_project(project_id)
    return [item for item in load_valid_entities("videos", project_id, GeneratedVideo) if isinstance(item, GeneratedVideo)]


@app.post("/api/projects/{project_id}/generate-video")
async def generate_video(project_id: str, request: GenerateVideoRequest) -> dict[str, Any]:
    project = require_project(project_id)
    settings = request.settings or project.videoSettings

    run = RunJob(
        id=create_id("run"),
        projectId=project_id,
        type="generate-video",
        status="running",
        startedAt=now_iso(),
        completedAt=None,
        itemIds=[],
        label="Generate final video",
    )
    upsert_run(run)
    spawn_background_task(run_video_generation_pipeline(project_id, run, request, settings))
    return {"run": run.model_dump()}


@app.delete("/api/projects/{project_id}/videos/{video_id}")
def delete_video(project_id: str, video_id: str) -> JSONResponse:
    payload = store.get_entity("videos", project_id, video_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Video not found")

    video = GeneratedVideo.model_validate(payload)
    file_path = local_path_from_asset_url(project_id, video.videoUrl)
    if file_path is not None and file_path.exists():
        file_path.unlink(missing_ok=True)

    store.delete_entity("videos", project_id, video_id)
    return JSONResponse({"status": "deleted"})


@app.get("/api/projects/{project_id}/runs", response_model=list[RunJob])
def list_runs(project_id: str) -> list[RunJob]:
    require_project(project_id)
    return [item for item in load_valid_entities("runs", project_id, RunJob) if isinstance(item, RunJob)]


@app.get("/api/projects/{project_id}/runs/{run_id}", response_model=RunJob)
def get_run_status(project_id: str, run_id: str) -> RunJob:
    require_project(project_id)
    return get_run(project_id, run_id)


@app.get("/api/projects/{project_id}/runs/{run_id}/events")
async def stream_run_events(project_id: str, run_id: str) -> StreamingResponse:
    require_project(project_id)
    run = get_run(project_id, run_id)
    queue = await broker.subscribe(run_id)

    async def event_generator() -> Any:
        try:
            initial_payload = {"type": "run-snapshot", "run": run.model_dump()}
            yield f"data: {json.dumps(initial_payload)}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except TimeoutError:
                    yield ": keep-alive\n\n"
                    continue

                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") in {"run-completed", "run-failed"}:
                    break
        finally:
            await broker.unsubscribe(run_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/assets/{project_id}/{asset_path:path}")
def get_asset(project_id: str, asset_path: str) -> FileResponse:
    require_project(project_id)
    target_path = resolve_asset_path(project_id, asset_path)
    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(target_path)


@app.get("/api/global-assets/{asset_path:path}")
def get_global_asset(asset_path: str) -> FileResponse:
    target_path = resolve_global_asset_path(asset_path)
    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(target_path)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "sealed-nector-backend", "status": "ok"}
