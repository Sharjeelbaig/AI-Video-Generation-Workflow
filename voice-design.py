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
    instruct="""deep calm low pitched Kurzgesagt style voice inspired by documentary narration. It begins very very slowly and measured, with clear and deliberate pacing. As the narration progresses, the tempo subtly increases and the delivery becomes more emotionally engaging, while still maintaining a controlled sense of calm. The tone carries curiosity and wonder, gradually building intensity without ever becoming harsh. By the end, the voice softens into a hopeful, uplifting resolution, leaving a sense of clarity, optimism, and reflection and the starting of the next phrase will be slightly faster than the previous one but with deep pauses in between.
    """,
    file_prefix="designed_voice_kurzgessagt_5",
    speed=1.5,
)
