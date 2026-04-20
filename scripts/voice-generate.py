from __future__ import annotations

import os
from pathlib import Path
import re
import sys
from typing import Any

from mlx_audio.tts.generate import generate_audio
from mlx_audio.tts.utils import load


def resolve_project_root(default_root: Path) -> Path:
    override = os.getenv("SEALED_NECTOR_PROJECT_ROOT", "").strip()
    if not override:
        return default_root
    return Path(override).expanduser().resolve()


PROJECT_ROOT = resolve_project_root(Path(__file__).resolve().parents[1])
MODEL_ID = "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit"
DESIGNED_AUDIO_DIR = PROJECT_ROOT / "outputs" / "audios" / "designed"
DEFAULT_SCRIPT_PATH = "script.txt"
DEFAULT_OUTPUT_DIR = "outputs/audios/generated"
DEFAULT_REF_AUDIO = DESIGNED_AUDIO_DIR / "designed_voice_kurzgessagt_5_000.wav"

DEFAULTS: dict[str, str | None] = {
    "script": DEFAULT_SCRIPT_PATH,
    "output-dir": DEFAULT_OUTPUT_DIR,
    "segment-indices": None,
    "clear-existing": "yes",
    "speed": "10",
}
OPTION_ALIASES = {
    "script-path": "script",
    "output": "output-dir",
    "segments": "segment-indices",
    "segment-indices": "segment-indices",
    "clear": "clear-existing",
}
USAGE = (
    "Usage:\n"
    "  python voice-generate.py\n"
    "  python voice-generate.py segment-indices=0,2 clear-existing=no speed=1.0\n"
    "  python voice-generate.py script=script.txt output-dir=outputs/audios/generated\n"
)

# Match this text to the designed reference voice recording.
DEFAULT_REF_TEXT = (
    "Hope is a quiet thing. It doesn't scream to be heard, but it remains steady "
    "when the world gets loud. You have to nurture it, let it grow deep within "
    "your soul. In the end, that small spark is what carries us through "
    "longest of nights."
)

TAG_RE = re.compile(r"<[^>]*>")
HEADING_BLOCK_RE = re.compile(r"<\s*heading\s*>.*?<\s*/\s*heading\s*>", re.IGNORECASE | re.DOTALL)
SUBHEADING_BLOCK_RE = re.compile(r"<\s*subheading\s*>.*?<\s*/\s*subheading\s*>", re.IGNORECASE | re.DOTALL)
IMAGE_BLOCK_TAG_RE = re.compile(r"<\s*image\s*>.*?<\s*/\s*image\s*>", re.IGNORECASE | re.DOTALL)
ARABIC_CHAR_RE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]")
LATIN_CHAR_RE = re.compile(r"[A-Za-z]")


def parse_args(argv: list[str]) -> dict[str, str | None]:
    if any(arg in {"-h", "--help", "help"} for arg in argv):
        print(USAGE)
        raise SystemExit(0)

    options: dict[str, str | None] = dict(DEFAULTS)
    for arg in argv:
        if "=" not in arg:
            raise SystemExit(f"Error: Arguments must use key=value format. Invalid argument: {arg}")
        key, value = arg.split("=", 1)
        normalized_key = OPTION_ALIASES.get(key.strip().lower(), key.strip().lower())
        if normalized_key not in DEFAULTS:
            raise SystemExit(f"Error: Unknown option: {normalized_key}")
        options[normalized_key] = value.strip()

    return options


def parse_bool(name: str, value: str | None) -> bool:
    if value in {None, ""}:
        return False

    raw_value = value if value is not None else ""
    normalized = raw_value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise SystemExit(f"Error: {name} must be yes/no, true/false, on/off, or 1/0")


def parse_positive_float(name: str, value: str | None) -> float:
    if value is None or value == "":
        raise SystemExit(f"Error: {name} is required")
    try:
        parsed = float(value)
    except ValueError as exc:
        raise SystemExit(f"Error: {name} must be a number, got {value!r}") from exc
    if parsed <= 0:
        raise SystemExit(f"Error: {name} must be greater than 0")
    return parsed


def parse_segment_indices(value: str | None) -> set[int] | None:
    if value in {None, ""}:
        return None

    raw_value = value if value is not None else ""
    indices: set[int] = set()
    for chunk in raw_value.split(","):
        token = chunk.strip()
        if not token:
            continue
        try:
            index = int(token)
        except ValueError as exc:
            raise SystemExit(f"Error: segment index must be an integer, got {token!r}") from exc
        if index < 0:
            raise SystemExit("Error: segment index must be 0 or greater")
        indices.add(index)

    return indices if indices else None


def clean_tts_text(value: str) -> str:
    without_heading = HEADING_BLOCK_RE.sub(" ", value)
    without_subheading = SUBHEADING_BLOCK_RE.sub(" ", without_heading)
    without_image_prompts = IMAGE_BLOCK_TAG_RE.sub(" ", without_subheading)
    return " ".join(TAG_RE.sub(" ", without_image_prompts).split())


def normalized_spoken_segments(script_text: str) -> list[str]:
    segments: list[str] = []
    raw_blocks = [
        block
        for block in (piece.strip() for piece in re.split(r"^---$", script_text, flags=re.MULTILINE))
        if block
    ]
    for raw_block in raw_blocks:
        cleaned_text = clean_tts_text(raw_block)
        if not cleaned_text:
            continue
        segments.append(cleaned_text)
    return segments


def preview_text(value: str, limit: int = 80) -> str:
    if len(value) <= limit:
        return value
    return value[: limit - 3].rstrip() + "..."


def resolve_path(path_value: str) -> Path:
    path = Path(path_value)
    if path.is_absolute():
        return path
    return PROJECT_ROOT / path


def segment_output_files(output_dir: Path, index: int) -> list[Path]:
    return sorted(output_dir.glob(f"test_audio_{index}_*.wav"))


def clear_existing_generated_audio(output_dir: Path) -> None:
    for existing_file in output_dir.glob("test_audio_*.wav"):
        existing_file.unlink()


def lang_codes_for_text(text: str) -> list[str]:
    codes = ["en"]
    if ARABIC_CHAR_RE.search(text) and not LATIN_CHAR_RE.search(text):
        codes.append("ar")
    return list(dict.fromkeys(codes))


def resolve_reference_audio() -> Path:
    explicit_path = os.getenv("VOICE_REF_AUDIO", "").strip()
    if explicit_path:
        requested = Path(explicit_path)
        if not requested.is_absolute():
            requested = PROJECT_ROOT / requested
        requested = requested.resolve()
        if requested.exists():
            return requested
        raise SystemExit(f"Error: VOICE_REF_AUDIO file was not found: {requested}")

    if DEFAULT_REF_AUDIO.exists():
        return DEFAULT_REF_AUDIO

    designed_candidates = sorted(DESIGNED_AUDIO_DIR.glob("designed_voice*_000.wav"))
    if designed_candidates:
        return designed_candidates[-1]

    raise SystemExit(
        "Error: No designed reference audio found in outputs/audios/designed. "
        "Run scripts/voice-design.py first."
    )


def generate_segment_audio(
    model: Any,
    text: str,
    index: int,
    output_dir: Path,
    ref_audio: Path,
    ref_text: str,
    speed: float,
) -> None:
    for existing_file in segment_output_files(output_dir, index):
        existing_file.unlink()

    last_error: Exception | None = None
    tried_codes: list[str] = []
    for lang_code in lang_codes_for_text(text):
        tried_codes.append(lang_code)
        try:
            generate_audio(
                model=model,
                text=text,
                ref_audio=str(ref_audio),
                ref_text=ref_text,
                lang_code=lang_code,
                file_prefix=str(output_dir / f"test_audio_{index}"),
                speed=speed,
            )
        except Exception as exc:  # noqa: BLE001
            last_error = exc
        if segment_output_files(output_dir, index):
            return

    error = (
        f"No WAV generated for segment {index} ({preview_text(text)!r}). "
        f"Tried lang_code={', '.join(tried_codes)}"
    )
    if last_error is not None:
        raise SystemExit(f"Error: {error}. Last generator error: {last_error}") from last_error
    raise SystemExit(f"Error: {error}")


def main() -> None:
    options = parse_args(sys.argv[1:])

    script_value_option = options["script"]
    if script_value_option in {None, ""}:
        script_value_option = os.getenv("VOICE_SCRIPT_PATH", DEFAULT_SCRIPT_PATH).strip()
    script_value = str(script_value_option)
    script_path = resolve_path(script_value)

    output_dir_option = options["output-dir"]
    if output_dir_option in {None, ""}:
        output_dir_option = os.getenv("VOICE_OUTPUT_DIR", DEFAULT_OUTPUT_DIR).strip()
    output_dir_value = str(output_dir_option)
    output_dir = resolve_path(output_dir_value)

    segment_indices_value = options["segment-indices"]
    if segment_indices_value in {None, ""}:
        segment_indices_value = os.getenv("VOICE_SEGMENT_INDICES", "").strip() or None
    segment_indices = parse_segment_indices(segment_indices_value)

    clear_existing_value = options["clear-existing"]
    if clear_existing_value in {None, ""}:
        clear_existing_value = os.getenv("VOICE_CLEAR_EXISTING", "yes").strip()
    clear_existing = parse_bool("clear-existing", clear_existing_value)

    speed_value = options["speed"]
    if speed_value in {None, ""}:
        speed_value = os.getenv("VOICE_GENERATE_SPEED", "10").strip()
    speed = parse_positive_float("speed", speed_value)

    ref_text = os.getenv("VOICE_REF_TEXT", DEFAULT_REF_TEXT).strip() or DEFAULT_REF_TEXT

    if not script_path.exists():
        raise SystemExit(f"Error: Script file not found: {script_path}")

    output_dir.mkdir(parents=True, exist_ok=True)
    ref_audio = resolve_reference_audio()
    if clear_existing:
        clear_existing_generated_audio(output_dir)

    text = script_path.read_text(encoding="utf-8")
    model = load(MODEL_ID)

    spoken_segments = normalized_spoken_segments(text)

    generated_count = 0
    for index, cleaned_piece in enumerate(spoken_segments):
        if segment_indices is not None and index not in segment_indices:
            continue

        generate_segment_audio(
            model=model,
            text=cleaned_piece,
            index=index,
            output_dir=output_dir,
            ref_audio=ref_audio,
            ref_text=ref_text,
            speed=speed,
        )
        generated_count += 1

    if segment_indices is not None:
        printable_indices = ", ".join(str(index) for index in sorted(segment_indices))
        print(f"Processed requested segment indices: {printable_indices}")

    print(f"Generated {generated_count} audio segment(s) in {output_dir}")


if __name__ == "__main__":
    main()
