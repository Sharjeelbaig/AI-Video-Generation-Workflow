#!/usr/bin/env python3

from __future__ import annotations

import re
import shlex
import subprocess
import sys
import tempfile
import wave
from pathlib import Path


DEFAULTS = {
    "script": "script.txt",
    "audio-dir": "output",
    "output": "output.mp4",
    "font": "Helvetica",
    "arabic-font": "Geeza Pro",
    "font-size": None,
    "font-color": "white",
    "background": "black",
    "words-per-scene": "10",
    "width": "1920",
    "height": "1080",
    "fps": "30",
    "preset": "veryfast",
    "crf": "20",
    "audio-bitrate": "96k",
    "codec": "libx264",
    "limit": None,
}


NAMED_COLORS = {
    "white": "FFFFFF",
    "black": "000000",
    "red": "FF0000",
    "green": "00FF00",
    "blue": "0000FF",
    "yellow": "FFFF00",
    "cyan": "00FFFF",
    "magenta": "FF00FF",
    "orange": "FFA500",
    "gray": "808080",
    "grey": "808080",
    "silver": "C0C0C0",
}


ARABIC_RUN_RE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+")


USAGE = """Usage:
  python generate-video font-color=white background=black words-per-scene=10

Optional key=value arguments:
  script=script.txt
  audio-dir=output
  output=output.mp4
  font=Helvetica
  arabic-font=Geeza Pro
  font-size=72
  font-color=white
  background=black
  words-per-scene=10
  width=1920
  height=1080
  fps=30
  preset=veryfast
  crf=20
  audio-bitrate=96k
  codec=libx264
  limit=25
"""


def fail(message: str) -> None:
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


def parse_args(argv: list[str]) -> dict[str, str | None]:
    if any(arg in {"-h", "--help", "help"} for arg in argv):
        print(USAGE)
        sys.exit(0)

    options: dict[str, str | None] = dict(DEFAULTS)
    for arg in argv:
        if "=" not in arg:
            fail(f"Arguments must use key=value format. Invalid argument: {arg}")
        key, value = arg.split("=", 1)
        key = key.strip().lower()
        if key not in DEFAULTS:
            fail(f"Unknown option: {key}")
        options[key] = value.strip()
    return options


def parse_positive_int(name: str, value: str | None) -> int:
    if value is None or not value:
        fail(f"{name} is required")
    try:
        parsed = int(value)
    except ValueError as exc:
        raise SystemExit(f"Error: {name} must be an integer, got {value!r}") from exc
    if parsed <= 0:
        fail(f"{name} must be greater than 0")
    return parsed


def parse_non_negative_int(name: str, value: str | None) -> int:
    if value is None or value == "":
        return 0
    try:
        parsed = int(value)
    except ValueError as exc:
        raise SystemExit(f"Error: {name} must be an integer, got {value!r}") from exc
    if parsed < 0:
        fail(f"{name} must be 0 or greater")
    return parsed


def natural_sort_key(path: Path) -> list[object]:
    parts = re.split(r"(\d+)", path.name)
    return [int(part) if part.isdigit() else part.lower() for part in parts]


def find_wav_files(audio_dir: Path) -> list[Path]:
    wav_files = sorted(audio_dir.glob("*.wav"), key=natural_sort_key)
    if not wav_files:
        fail(f"No WAV files found in {audio_dir}")
    return wav_files


def normalize_text(value: str) -> str:
    return " ".join(value.split())


def load_script_segments(script_path: Path, expected_count: int) -> list[str]:
    raw_segments = [normalize_text(piece) for piece in script_path.read_text(encoding="utf-8").split("---")]
    if len(raw_segments) == expected_count:
        return raw_segments

    non_empty_segments = [piece for piece in raw_segments if piece]
    if len(non_empty_segments) == expected_count:
        return non_empty_segments

    fail(
        f"Script segment count ({len(raw_segments)} raw / {len(non_empty_segments)} non-empty) "
        f"does not match WAV file count ({expected_count})"
    )


def split_scene_text(text: str, words_per_scene: int) -> list[str]:
    if not text:
        return [""]
    if words_per_scene <= 0:
        return [text]

    words = text.split()
    if len(words) <= words_per_scene:
        return [text]

    return [
        " ".join(words[index : index + words_per_scene])
        for index in range(0, len(words), words_per_scene)
    ]


def get_wav_duration(path: Path) -> float:
    try:
        with wave.open(str(path), "rb") as wav_file:
            frame_rate = wav_file.getframerate()
            if frame_rate <= 0:
                fail(f"Invalid sample rate in {path}")
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
        except FileNotFoundError as exc:
            raise SystemExit("Error: ffprobe is required but was not found in PATH") from exc
        try:
            return float(result.stdout.strip())
        except ValueError as exc:
            raise SystemExit(f"Error: Unable to read duration for {path}") from exc


def parse_limit(value: str | None) -> int | None:
    if value in {None, ""}:
        return None
    limit = parse_positive_int("limit", value)
    return limit


def parse_color_hex(value: str) -> str:
    normalized = value.strip().lower()
    if normalized in NAMED_COLORS:
        return NAMED_COLORS[normalized]
    if normalized.startswith("#"):
        normalized = normalized[1:]
    if re.fullmatch(r"[0-9a-fA-F]{6}", normalized):
        return normalized.upper()
    fail(f"Unsupported color {value!r}. Use a named color or #RRGGBB.")


def to_ass_color(value: str, alpha: str = "00") -> str:
    rgb = parse_color_hex(value)
    red = rgb[0:2]
    green = rgb[2:4]
    blue = rgb[4:6]
    return f"&H{alpha}{blue}{green}{red}"


def normalize_ffmpeg_color(value: str) -> str:
    normalized = value.strip().lower()
    if normalized in NAMED_COLORS:
        return normalized
    if normalized.startswith("#"):
        normalized = normalized[1:]
    if re.fullmatch(r"[0-9a-fA-F]{6}", normalized):
        return f"0x{normalized.upper()}"
    return value


def ass_timestamp(seconds: float) -> str:
    rounded = max(0, int(round(seconds * 100)))
    hours, remainder = divmod(rounded, 360000)
    minutes, remainder = divmod(remainder, 6000)
    secs, centis = divmod(remainder, 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{centis:02d}"


def escape_ass_text(text: str) -> str:
    return (
        text.replace("\\", r"\\")
        .replace("{", r"\{")
        .replace("}", r"\}")
        .replace("\n", r"\N")
    )


def format_ass_text(text: str, default_font: str, arabic_font: str | None) -> str:
    if not arabic_font or arabic_font == default_font:
        return escape_ass_text(text)

    parts: list[str] = []
    last_index = 0

    for match in ARABIC_RUN_RE.finditer(text):
        if match.start() > last_index:
            parts.append(escape_ass_text(text[last_index : match.start()]))
        parts.append(
            r"{\fn" + arabic_font + "}"
            + escape_ass_text(match.group(0))
            + r"{\fn" + default_font + "}"
        )
        last_index = match.end()

    if last_index < len(text):
        parts.append(escape_ass_text(text[last_index:]))

    return "".join(parts) if parts else escape_ass_text(text)


def build_subtitle_content(
    segments: list[str],
    wav_files: list[Path],
    words_per_scene: int,
    width: int,
    height: int,
    font: str,
    arabic_font: str | None,
    font_size: int,
    font_color: str,
) -> tuple[str, float]:
    primary_color = to_ass_color(font_color)
    outline_color = to_ass_color("black")
    margin_v = max(40, height // 12)

    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, "
        "ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
        "MarginR, MarginV, Encoding",
        "Style: Default,"
        f"{font},{font_size},{primary_color},{primary_color},{outline_color},"
        "&H00000000,0,0,0,0,100,100,0,0,1,3,0,5,80,80,"
        f"{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    current_time = 0.0
    for text, wav_path in zip(segments, wav_files, strict=True):
        duration = get_wav_duration(wav_path)
        chunks = split_scene_text(text, words_per_scene)
        chunk_duration = duration / len(chunks)

        for chunk in chunks:
            start = current_time
            end = current_time + chunk_duration
            escaped_text = format_ass_text(chunk, default_font=font, arabic_font=arabic_font)
            lines.append(
                f"Dialogue: 0,{ass_timestamp(start)},{ass_timestamp(end)},Default,,0,0,0,,{escaped_text}"
            )
            current_time = end

    return "\n".join(lines) + "\n", current_time


def build_ffconcat_content(wav_files: list[Path]) -> str:
    lines = ["ffconcat version 1.0"]
    for wav_file in wav_files:
        lines.append(f"file {shlex.quote(str(wav_file.resolve()))}")
    return "\n".join(lines) + "\n"


def run_ffmpeg(
    concat_file: Path,
    subtitle_file: Path,
    output_file: Path,
    background: str,
    width: int,
    height: int,
    fps: int,
    total_duration: float,
    codec: str,
    preset: str,
    crf: str,
    audio_bitrate: str,
) -> None:
    color_value = normalize_ffmpeg_color(background)
    color_input = f"color=c={color_value}:s={width}x{height}:r={fps}:d={total_duration:.6f}"
    command = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat_file),
        "-f",
        "lavfi",
        "-i",
        color_input,
        "-map",
        "1:v:0",
        "-map",
        "0:a:0",
        "-vf",
        f"subtitles={subtitle_file.as_posix()}",
        "-c:v",
        codec,
        "-preset",
        preset,
        "-crf",
        crf,
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        audio_bitrate,
        "-threads",
        "0",
        "-shortest",
        str(output_file),
    ]
    try:
        subprocess.run(command, check=True)
    except FileNotFoundError as exc:
        raise SystemExit("Error: ffmpeg is required but was not found in PATH") from exc


def main() -> None:
    options = parse_args(sys.argv[1:])

    script_path = Path(options["script"] or DEFAULTS["script"])
    audio_dir = Path(options["audio-dir"] or DEFAULTS["audio-dir"])
    output_file = Path(options["output"] or DEFAULTS["output"])
    font = options["font"] or DEFAULTS["font"]
    arabic_font = options["arabic-font"] or DEFAULTS["arabic-font"]
    font_color = options["font-color"] or DEFAULTS["font-color"]
    background = options["background"] or DEFAULTS["background"]
    codec = options["codec"] or DEFAULTS["codec"]
    preset = options["preset"] or DEFAULTS["preset"]
    crf = options["crf"] or DEFAULTS["crf"]
    audio_bitrate = options["audio-bitrate"] or DEFAULTS["audio-bitrate"]

    width = parse_positive_int("width", options["width"])
    height = parse_positive_int("height", options["height"])
    fps = parse_positive_int("fps", options["fps"])
    words_per_scene = parse_non_negative_int("words-per-scene", options["words-per-scene"])
    limit = parse_limit(options["limit"])

    font_size_value = options["font-size"]
    font_size = (
        parse_positive_int("font-size", font_size_value)
        if font_size_value
        else max(28, height // 15)
    )

    if not script_path.exists():
        fail(f"Script file does not exist: {script_path}")
    if not audio_dir.exists():
        fail(f"Audio directory does not exist: {audio_dir}")

    wav_files = find_wav_files(audio_dir)
    if limit is not None:
        wav_files = wav_files[:limit]

    segments = load_script_segments(script_path, len(find_wav_files(audio_dir)))
    if limit is not None:
        segments = segments[:limit]

    subtitle_content, total_duration = build_subtitle_content(
        segments=segments,
        wav_files=wav_files,
        words_per_scene=words_per_scene,
        width=width,
        height=height,
        font=font,
        arabic_font=arabic_font,
        font_size=font_size,
        font_color=font_color,
    )
    concat_content = build_ffconcat_content(wav_files)

    output_file.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="generate_video_") as temp_dir:
        temp_path = Path(temp_dir)
        concat_file = temp_path / "audio.ffconcat"
        subtitle_file = temp_path / "subtitles.ass"
        concat_file.write_text(concat_content, encoding="utf-8")
        subtitle_file.write_text(subtitle_content, encoding="utf-8")

        try:
            run_ffmpeg(
                concat_file=concat_file,
                subtitle_file=subtitle_file,
                output_file=output_file,
                background=background,
                width=width,
                height=height,
                fps=fps,
                total_duration=total_duration,
                codec=codec,
                preset=preset,
                crf=crf,
                audio_bitrate=audio_bitrate,
            )
        except subprocess.CalledProcessError as exc:
            raise SystemExit(f"Error: ffmpeg failed with exit code {exc.returncode}") from exc

    print(f"Created {output_file}")


if __name__ == "__main__":
    main()
