from mlx_audio.tts.generate import generate_audio
from mlx_audio.tts.utils import load
import os

MODEL_ID = "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit"
REF_AUDIO = "designed_voice_000.wav"

# read from script.txt
with open("script.txt", "r") as f:
    text = f.read()

model = load(MODEL_ID)

if not os.path.exists("output"):
    os.makedirs("output")
for i, piece in enumerate(text.split("---")):
    generate_audio(
        model=model,
        text=piece.strip(),
        lang_code="en",
        file_prefix=f"output/test_audio_{i}",
        instruct="A calm male deep voice with low pitch and energetic tone matching Kurzgesagt style.",
    )

