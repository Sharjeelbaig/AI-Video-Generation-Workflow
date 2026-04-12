from mlx_audio.tts.generate import generate_audio
from mlx_audio.tts.utils import load
import os
import re

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
        ref_audio=REF_AUDIO,
        ref_text=REF_TEXT,
        lang_code="en",
        file_prefix=f"output/test_audio_{i}",
        speed=10,
    )
