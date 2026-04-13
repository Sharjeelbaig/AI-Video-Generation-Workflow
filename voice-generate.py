from pathlib import Path
import os
import re
from typing import Any

from mlx_audio.tts.generate import generate_audio
from mlx_audio.tts.utils import load

MODEL_ID = "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit"
REF_AUDIO = "designed_voice_kurzgessagt_4_000.wav"
# Match this to the exact spoken words in reference.wav for best cloning quality.
REF_TEXT = (
    "Hope is a quiet thing. It doesn't scream to be heard, but it remains steady "
    "when the world gets loud. You have to nurture it, let it grow deep within "
    "your soul. In the end, that small spark is what carries us through "
    "longest of nights."
)
TAG_RE = re.compile(r"<[^>]*>")
IMAGE_BLOCK_TAG_RE = re.compile(r"<\s*image\s*>.*?<\s*/\s*image\s*>", re.IGNORECASE | re.DOTALL)
ARABIC_CHAR_RE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]")
LATIN_CHAR_RE = re.compile(r"[A-Za-z]")
OUTPUT_DIR = Path("output")
SCRIPT_PATH = Path("script.txt")


def clean_tts_text(value: str) -> str:
    without_image_prompts = IMAGE_BLOCK_TAG_RE.sub(" ", value)
    return " ".join(TAG_RE.sub(" ", without_image_prompts).split())


def preview_text(value: str, limit: int = 80) -> str:
    if len(value) <= limit:
        return value
    return value[: limit - 3].rstrip() + "..."


def segment_output_files(index: int) -> list[Path]:
    return sorted(OUTPUT_DIR.glob(f"test_audio_{index}_*.wav"))


def lang_codes_for_text(text: str) -> list[str]:
    codes = ["en"]
    if ARABIC_CHAR_RE.search(text) and not LATIN_CHAR_RE.search(text):
        codes.append("ar")
    return list(dict.fromkeys(codes))


def generate_segment_audio(model: Any, text: str, index: int) -> None:
    for existing_file in segment_output_files(index):
        existing_file.unlink()

    last_error: Exception | None = None
    tried_codes: list[str] = []
    for lang_code in lang_codes_for_text(text):
        tried_codes.append(lang_code)
        try:
            generate_audio(
                model=model,
                text=text,
                ref_audio=REF_AUDIO,
                ref_text=REF_TEXT,
                lang_code=lang_code,
                file_prefix=f"{OUTPUT_DIR}/test_audio_{index}",
                speed=10,
            )
        except Exception as exc:  # noqa: BLE001
            last_error = exc
        if segment_output_files(index):
            return

    error = (
        f"No WAV generated for segment {index} ({preview_text(text)!r}). "
        f"Tried lang_code={', '.join(tried_codes)}"
    )
    if last_error is not None:
        raise SystemExit(f"Error: {error}. Last generator error: {last_error}") from last_error
    raise SystemExit(f"Error: {error}")


text = SCRIPT_PATH.read_text(encoding="utf-8")
model = load(MODEL_ID)

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

for i, piece in enumerate(text.split("---")):
    cleaned_piece = clean_tts_text(piece)
    generate_segment_audio(model=model, text=cleaned_piece, index=i)
