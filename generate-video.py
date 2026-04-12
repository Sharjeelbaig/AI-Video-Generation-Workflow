#!/usr/bin/env python3

from __future__ import annotations

import re
import shlex
import subprocess
import sys
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path


DEFAULTS = {
    "script": "script.txt",
    "audio-dir": "output",
    "output": "output.mp4",
    "font": "Helvetica",
    "arabic-font": "Geeza Pro",
    "heading-font": None,
    "subheading-font": None,
    "font-size": None,
    "font-color": "white",
    "heading-font-color": "yellow",
    "subheading-font-color": "yellow",
    "background": "black",
    "words-per-scene": "10",
    "width": "1920",
    "height": "1080",
    "fps": "30",
    "preset": "veryfast",
    "crf": "20",
    "audio-bitrate": "96k",
    "codec": "libx264",
    "seperate-text-by-seperatorline": "yes",
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


ARABIC_CHAR_RE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]")
RTL_EMBED = "\u202B"
POP_DIRECTIONAL = "\u202C"


OPTION_ALIASES = {
    "separate-text-by-separatorline": "seperate-text-by-seperatorline",
    "separate-text-by-separator-line": "seperate-text-by-seperatorline",
    "seperate-text-by-separatorline": "seperate-text-by-seperatorline",
    "heading-color": "heading-font-color",
    "subheading-color": "subheading-font-color",
}


STYLE_NORMAL = "normal"
STYLE_HEADING = "heading"
STYLE_SUBHEADING = "subheading"
MARKUP_TAG_RE = re.compile(r"<\s*/?\s*(heading|subheading)\s*>", re.IGNORECASE)
HEADING_TAG_RE = re.compile(r"<\s*/?\s*heading\s*>", re.IGNORECASE)
SUBHEADING_TAG_RE = re.compile(r"<\s*/?\s*subheading\s*>", re.IGNORECASE)


@dataclass(frozen=True)
class ScriptSegment:
    text: str
    style: str = STYLE_NORMAL


@dataclass(frozen=True)
class StyledRun:
    text: str
    style: str


@dataclass(frozen=True)
class SceneChunk:
    runs: list[StyledRun]
    start: float
    end: float


@dataclass(frozen=True)
class TextStyle:
    font: str
    font_size: int
    color: str


USAGE = """Usage:
  python generate-video.py font-color=white background=black words-per-scene=10

Optional key=value arguments:
  script=script.txt
  audio-dir=output
  output=output.mp4
  font=Helvetica
  arabic-font=Geeza Pro
  heading-font=Helvetica
  subheading-font=Helvetica
  font-size=72
  font-color=white
  heading-font-color=yellow
  subheading-font-color=yellow
  background=black
  words-per-scene=10
  width=1920
  height=1080
  fps=30
  preset=veryfast
  crf=20
  audio-bitrate=96k
  codec=libx264
  seperate-text-by-seperatorline=yes
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
        key = OPTION_ALIASES.get(key.strip().lower(), key.strip().lower())
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


def parse_bool(name: str, value: str | None) -> bool:
    if value is None or value == "":
        return False

    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    fail(f"{name} must be yes/no, true/false, on/off, or 1/0")


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


def parse_script_segment(value: str) -> ScriptSegment:
    style = STYLE_NORMAL
    if HEADING_TAG_RE.search(value):
        style = STYLE_HEADING
    elif SUBHEADING_TAG_RE.search(value):
        style = STYLE_SUBHEADING

    cleaned_text = normalize_text(MARKUP_TAG_RE.sub(" ", value))
    return ScriptSegment(text=cleaned_text, style=style)


def load_script_segments(script_path: Path, expected_count: int) -> list[ScriptSegment]:
    raw_segments = [parse_script_segment(piece) for piece in script_path.read_text(encoding="utf-8").split("---")]
    if len(raw_segments) == expected_count:
        return raw_segments

    non_empty_segments = [piece for piece in raw_segments if piece.text]
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


def build_segment_bound_scenes(
    segments: list[ScriptSegment],
    wav_files: list[Path],
    words_per_scene: int,
) -> tuple[list[SceneChunk], float]:
    scenes: list[SceneChunk] = []
    current_time = 0.0

    for segment, wav_path in zip(segments, wav_files, strict=True):
        duration = get_wav_duration(wav_path)
        chunks = split_scene_text(segment.text, words_per_scene)
        chunk_duration = duration / len(chunks)

        for chunk in chunks:
            start = current_time
            end = current_time + chunk_duration
            scenes.append(SceneChunk(runs=[StyledRun(chunk, segment.style)], start=start, end=end))
            current_time = end

    return scenes, current_time


def build_scene_runs(words: list[tuple[str, str]]) -> list[StyledRun]:
    if not words:
        return [StyledRun("", STYLE_NORMAL)]

    runs: list[StyledRun] = []
    current_style = words[0][1]
    current_words: list[str] = []

    for word, style in words:
        if style != current_style and current_words:
            runs.append(StyledRun(" ".join(current_words), current_style))
            current_words = []
            current_style = style
        current_words.append(word)

    if current_words:
        runs.append(StyledRun(" ".join(current_words), current_style))
    return runs


def build_word_bound_scenes(
    segments: list[ScriptSegment],
    wav_files: list[Path],
    words_per_scene: int,
) -> tuple[list[SceneChunk], float]:
    timed_words: list[tuple[str, str, float]] = []
    leading_gap = 0.0

    for segment, wav_path in zip(segments, wav_files, strict=True):
        duration = get_wav_duration(wav_path)
        words = segment.text.split()
        if not words:
            if timed_words:
                last_word, last_style, last_duration = timed_words[-1]
                timed_words[-1] = (last_word, last_style, last_duration + duration)
            else:
                leading_gap += duration
            continue

        word_duration = duration / len(words)
        timed_words.extend((word, segment.style, word_duration) for word in words)

    total_duration = leading_gap + sum(duration for _, _, duration in timed_words)
    if not timed_words:
        return [SceneChunk(runs=[StyledRun("", STYLE_NORMAL)], start=0.0, end=total_duration)], total_duration

    scenes: list[SceneChunk] = []
    current_time = leading_gap
    scene_words: list[tuple[str, str]] = []
    scene_duration = 0.0

    for word, style, duration in timed_words:
        scene_words.append((word, style))
        scene_duration += duration
        if words_per_scene > 0 and len(scene_words) < words_per_scene:
            continue

        start = current_time
        end = current_time + scene_duration
        scenes.append(SceneChunk(runs=build_scene_runs(scene_words), start=start, end=end))
        current_time = end
        scene_words = []
        scene_duration = 0.0

    if scene_words or not scenes:
        start = current_time
        end = current_time + scene_duration
        scenes.append(SceneChunk(runs=build_scene_runs(scene_words), start=start, end=end))
        current_time = end

    if scenes and current_time < total_duration:
        last_scene = scenes[-1]
        scenes[-1] = SceneChunk(runs=last_scene.runs, start=last_scene.start, end=total_duration)

    return scenes, total_duration


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


def is_arabic_char(char: str) -> bool:
    return bool(ARABIC_CHAR_RE.fullmatch(char))


def is_arabic_joiner(char: str) -> bool:
    return char.isspace() or char in ".,;:!?()[]{}<>-_/\\'\"،؛؟"


def consume_arabic_span(text: str, start_index: int) -> int:
    index = start_index
    last_arabic_end = start_index

    while index < len(text):
        while index < len(text) and is_arabic_char(text[index]):
            index += 1
            last_arabic_end = index

        joiner_start = index
        while index < len(text) and is_arabic_joiner(text[index]):
            index += 1

        if index > joiner_start and index < len(text) and is_arabic_char(text[index]):
            continue

        return last_arabic_end

    return last_arabic_end


def format_ass_text(text: str, default_font: str, arabic_font: str | None) -> str:
    if not arabic_font or arabic_font == default_font:
        return escape_ass_text(text)

    parts: list[str] = []
    index = 0
    plain_start = 0

    while index < len(text):
        if not is_arabic_char(text[index]):
            index += 1
            continue

        span_end = consume_arabic_span(text, index)
        if index > plain_start:
            parts.append(escape_ass_text(text[plain_start:index]))

        arabic_span = RTL_EMBED + text[index:span_end] + POP_DIRECTIONAL
        parts.append(
            r"{\fn" + arabic_font + "}"
            + escape_ass_text(arabic_span)
            + r"{\fn" + default_font + "}"
        )

        index = span_end
        plain_start = span_end

    if plain_start < len(text):
        parts.append(escape_ass_text(text[plain_start:]))

    return "".join(parts) if parts else escape_ass_text(text)


def resolve_text_style(
    style: str,
    normal_style: TextStyle,
    heading_style: TextStyle,
    subheading_style: TextStyle,
) -> TextStyle:
    if style == STYLE_HEADING:
        return heading_style
    if style == STYLE_SUBHEADING:
        return subheading_style
    return normal_style


def format_styled_run(text: str, style: TextStyle, arabic_font: str | None) -> str:
    if not text:
        return ""

    formatted_text = format_ass_text(text, default_font=style.font, arabic_font=arabic_font)
    return (
        r"{\fn" + style.font + r"\fs" + str(style.font_size) + r"\1c" + style.color + r"&}"
        + formatted_text
    )


def format_scene_text(
    runs: list[StyledRun],
    normal_style: TextStyle,
    heading_style: TextStyle,
    subheading_style: TextStyle,
    arabic_font: str | None,
) -> str:
    parts: list[str] = []
    for run in runs:
        run_style = resolve_text_style(run.style, normal_style, heading_style, subheading_style)
        parts.append(format_styled_run(run.text, run_style, arabic_font))
    return "".join(parts)


def build_subtitle_content(
    segments: list[ScriptSegment],
    wav_files: list[Path],
    words_per_scene: int,
    seperate_text_by_seperatorline: bool,
    width: int,
    height: int,
    font: str,
    arabic_font: str | None,
    heading_font: str,
    subheading_font: str,
    font_size: int,
    font_color: str,
    heading_font_color: str,
    subheading_font_color: str,
) -> tuple[str, float]:
    primary_color = to_ass_color(font_color)
    outline_color = to_ass_color("black")
    margin_v = max(40, height // 12)
    normal_style = TextStyle(font=font, font_size=font_size, color=primary_color)
    subheading_style = TextStyle(
        font=subheading_font,
        font_size=font_size,
        color=to_ass_color(subheading_font_color),
    )
    heading_style = TextStyle(
        font=heading_font,
        font_size=subheading_style.font_size * 2,
        color=to_ass_color(heading_font_color),
    )

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

    if seperate_text_by_seperatorline:
        scenes, total_duration = build_segment_bound_scenes(segments, wav_files, words_per_scene)
    else:
        scenes, total_duration = build_word_bound_scenes(segments, wav_files, words_per_scene)

    for scene in scenes:
        escaped_text = format_scene_text(
            scene.runs,
            normal_style=normal_style,
            heading_style=heading_style,
            subheading_style=subheading_style,
            arabic_font=arabic_font,
        )
        lines.append(
            f"Dialogue: 0,{ass_timestamp(scene.start)},{ass_timestamp(scene.end)},Default,,0,0,0,,{escaped_text}"
        )

    return "\n".join(lines) + "\n", total_duration


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
    heading_font = options["heading-font"] or font
    subheading_font = options["subheading-font"] or font
    font_color = options["font-color"] or DEFAULTS["font-color"]
    heading_font_color = options["heading-font-color"] or DEFAULTS["heading-font-color"]
    subheading_font_color = options["subheading-font-color"] or DEFAULTS["subheading-font-color"]
    background = options["background"] or DEFAULTS["background"]
    codec = options["codec"] or DEFAULTS["codec"]
    preset = options["preset"] or DEFAULTS["preset"]
    crf = options["crf"] or DEFAULTS["crf"]
    audio_bitrate = options["audio-bitrate"] or DEFAULTS["audio-bitrate"]

    width = parse_positive_int("width", options["width"])
    height = parse_positive_int("height", options["height"])
    fps = parse_positive_int("fps", options["fps"])
    words_per_scene = parse_non_negative_int("words-per-scene", options["words-per-scene"])
    seperate_text_by_seperatorline = parse_bool(
        "seperate-text-by-seperatorline",
        options["seperate-text-by-seperatorline"],
    )
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
        seperate_text_by_seperatorline=seperate_text_by_seperatorline,
        width=width,
        height=height,
        font=font,
        arabic_font=arabic_font,
        heading_font=heading_font,
        subheading_font=subheading_font,
        font_size=font_size,
        font_color=font_color,
        heading_font_color=heading_font_color,
        subheading_font_color=subheading_font_color,
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
