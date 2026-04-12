from mlx_audio.tts.utils import load_model
from mlx_audio.tts.generate import generate_audio

model = load_model("mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit")
generate_audio(
    model=model,
    text=(
    "Hope is a quiet thing. It doesn't scream to be heard, but it remains steady "
    "when the world gets loud. You have to nurture it, let it grow deep within "
    "your soul. In the end, that small spark is what carries us through the "
    "longest of nights."
    ),
    instruct="A calm male deep voice with low pitch and energetic tone matching Kurzgesagt style.",
    file_prefix="designed_voice",
    # speed=0.3,
)
