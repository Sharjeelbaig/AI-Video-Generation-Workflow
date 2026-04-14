from __future__ import annotations

from pathlib import Path

from mlx_audio.tts.generate import generate_audio
from mlx_audio.tts.utils import load


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DESIGNED_AUDIO_DIR = PROJECT_ROOT / "outputs" / "audios" / "designed"
DESIGNED_FILE_PREFIX = DESIGNED_AUDIO_DIR / "designed_voice_kurzgessagt_5"
DESIGNED_OUTPUT_PATH = DESIGNED_AUDIO_DIR / "designed_voice_kurzgessagt_5_000.wav"

REFERENCE_TEXT = (
    "Hope is a quiet thing. It doesn't scream to be heard, but it remains steady "
    "when the world gets loud. You have to nurture it, let it grow deep within "
    "your soul. In the end, that small spark is what carries us through the "
    "longest of nights."
)

VOICE_INSTRUCTION = (
    "deep calm low pitched Kurzgesagt style voice inspired by documentary narration. "
    "It begins very very slowly and measured, with clear and deliberate pacing. "
    "As the narration progresses, the tempo subtly increases and the delivery "
    "becomes more emotionally engaging, while still maintaining a controlled sense "
    "of calm. The tone carries curiosity and wonder, gradually building intensity "
    "without ever becoming harsh. By the end, the voice softens into a hopeful, "
    "uplifting resolution, leaving a sense of clarity, optimism, and reflection."
)


def main() -> None:
    DESIGNED_AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    model = load("mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit")
    generate_audio(
        model=model,
        text=REFERENCE_TEXT,
        instruct=VOICE_INSTRUCTION,
        file_prefix=str(DESIGNED_FILE_PREFIX),
        speed=1.5,
    )

    print(f"Designed voice generated at: {DESIGNED_OUTPUT_PATH}")


if __name__ == "__main__":
    main()
