from __future__ import annotations

import os
from pathlib import Path

from mlx_audio.tts.generate import generate_audio
from mlx_audio.tts.utils import load


def resolve_project_root(default_root: Path) -> Path:
    override = os.getenv("SEALED_NECTOR_PROJECT_ROOT", "").strip()
    if not override:
        return default_root
    return Path(override).expanduser().resolve()


PROJECT_ROOT = resolve_project_root(Path(__file__).resolve().parents[1])
DESIGNED_AUDIO_DIR = PROJECT_ROOT / "outputs" / "audios" / "designed"
DEFAULT_VOICE_NAME = "kurzgessagt_5"

DEFAULT_REFERENCE_TEXT = (
    "Hope is a quiet thing. It doesn't scream to be heard, but it remains steady "
    "when the world gets loud. You have to nurture it, let it grow deep within "
    "your soul. In the end, that small spark is what carries us through the "
    "longest of nights."
)

DEFAULT_VOICE_INSTRUCTION = (
    "deep calm low pitched Kurzgesagt style voice inspired by documentary narration. "
    "It begins very very slowly and measured, with clear and deliberate pacing. "
    "As the narration progresses, the tempo subtly increases and the delivery "
    "becomes more emotionally engaging, while still maintaining a controlled sense "
    "of calm. The tone carries curiosity and wonder, gradually building intensity "
    "without ever becoming harsh. By the end, the voice softens into a hopeful, "
    "uplifting resolution, leaving a sense of clarity, optimism, and reflection."
)


def resolve_speed() -> float:
    raw_value = os.getenv("VOICE_DESIGN_SPEED", "1.5").strip()
    try:
        speed = float(raw_value)
    except ValueError as exc:
        raise SystemExit(f"Error: VOICE_DESIGN_SPEED must be a number, got {raw_value!r}") from exc
    if speed <= 0:
        raise SystemExit("Error: VOICE_DESIGN_SPEED must be greater than 0")
    return speed


def main() -> None:
    voice_name = os.getenv("VOICE_DESIGN_NAME", DEFAULT_VOICE_NAME).strip() or DEFAULT_VOICE_NAME
    reference_text = os.getenv("VOICE_DESIGN_REFERENCE_TEXT", DEFAULT_REFERENCE_TEXT).strip() or DEFAULT_REFERENCE_TEXT
    voice_instruction = os.getenv("VOICE_DESIGN_INSTRUCTION", DEFAULT_VOICE_INSTRUCTION).strip() or DEFAULT_VOICE_INSTRUCTION
    speed = resolve_speed()

    designed_file_prefix = DESIGNED_AUDIO_DIR / f"designed_voice_{voice_name}"
    designed_output_path = DESIGNED_AUDIO_DIR / f"designed_voice_{voice_name}_000.wav"

    DESIGNED_AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    model = load("mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit")
    generate_audio(
        model=model,
        text=reference_text,
        instruct=voice_instruction,
        file_prefix=str(designed_file_prefix),
        speed=speed,
    )

    print(f"Designed voice generated at: {designed_output_path}")


if __name__ == "__main__":
    main()
