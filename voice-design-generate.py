from mlx_audio.tts.generate import generate_audio
from mlx_audio.tts.utils import load
import os
import re

MODEL_ID = "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit"
REF_AUDIO = "designed_voice_000.wav"
TAG_RE = re.compile(r"<[^>]*>")


def clean_tts_text(value: str) -> str:
    return " ".join(TAG_RE.sub(" ", value).split())

# read from script.txt
with open("script.txt", "r") as f:
    text = f.read()

model = load(MODEL_ID)

if not os.path.exists("output"):
    os.makedirs("output")
for i, piece in enumerate(text.split("---")):
    cleaned_piece = clean_tts_text(piece)
    generate_audio(
        model=model,
        text=cleaned_piece,
        lang_code="en",
        file_prefix=f"output/test_audio_{i}",
        instruct="A calm male deep voice with low pitch and energetic tone matching Kurzgesagt style.",
    )
