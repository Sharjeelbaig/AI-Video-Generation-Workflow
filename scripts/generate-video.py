#!/usr/bin/env python3

from __future__ import annotations

import os
import re
import shlex
import subprocess
import sys
import tempfile
import wave
import zlib
from dataclasses import dataclass
from pathlib import Path


DEFAULTS = {
    "script": "script.txt",
    "audio-dir": "outputs/audios/generated",
    "images-dir": "outputs/images",
    "output": "outputs/videos/output.mp4",
    "font": "Helvetica",
    "arabic-font": "Geeza Pro",
    "heading-font": None,
    "subheading-font": None,
    "font-size": None,
    "font-color": "white",
    "heading-font-color": "yellow",
    "subheading-font-color": "yellow",
    "background": "black",
    "words-per-scene": None,
    "fade-transition": "no",
    "fade-duration": "0.5",
    "width": "1920",
    "height": "1080",
    "fps": "30",
    "preset": "veryfast",
    "crf": "20",
    "audio-bitrate": "96k",
    "codec": "libx264",
    "seperate-text-by-seperatorline": "yes",
    "limit": None,
    "filter-threads": "1",
    "filter-complex-threads": "1",
}


def resolve_project_root(default_root: Path) -> Path:
    override = os.getenv("SEALED_NECTOR_PROJECT_ROOT", "").strip()
    if not override:
        return default_root
    return Path(override).expanduser().resolve()


PROJECT_ROOT = resolve_project_root(Path(__file__).resolve().parents[1])


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
    "image-dir": "images-dir",
    "word-per-scene": "words-per-scene",
    "fade": "fade-transition",
    "filter_threads": "filter-threads",
    "filter_complex_threads": "filter-complex-threads",
}


BOOLEAN_OPTIONS = {
    "seperate-text-by-seperatorline",
    "fade-transition",
}


STYLE_NORMAL = "normal"
STYLE_HEADING = "heading"
STYLE_SUBHEADING = "subheading"
MARKUP_TAG_RE = re.compile(r"<\s*/?\s*(heading|subheading)\s*>", re.IGNORECASE)
IMAGE_TAG_RE = re.compile(r"<\s*image\s*>.*?<\s*/\s*image\s*>", re.IGNORECASE | re.DOTALL)
HEADING_TAG_RE = re.compile(r"<\s*/?\s*heading\s*>", re.IGNORECASE)
SUBHEADING_TAG_RE = re.compile(r"<\s*/?\s*subheading\s*>", re.IGNORECASE)
WAV_INDEX_RE = re.compile(r"_(\d+)_\d+\.wav$", re.IGNORECASE)
IMAGE_BLOCK_FILE_RE = re.compile(r"image_block_(\d+)\.[A-Za-z0-9]+$", re.IGNORECASE)
IMAGE_SEQUENCE_FILE_RE = re.compile(r"image_(\d+)\.[A-Za-z0-9]+$", re.IGNORECASE)


@dataclass(frozen=True)
class ScriptSegment:
    text: str
    style: str = STYLE_NORMAL
    has_image: bool = False


@dataclass(frozen=True)
class StyledRun:
    text: str
    style: str


@dataclass(frozen=True)
class SceneChunk:
    runs: list[StyledRun]
    start: float
    end: float
    raw_segment_index: int | None = None


@dataclass(frozen=True)
class TextStyle:
    font: str
    font_size: int
    color: str


@dataclass(frozen=True)
class BackgroundClip:
    path: Path
    duration: float


USAGE = (
        "Usage:\n"
        "  python generate-video.py font-color=white background=black\n"
        "  python generate-video.py --fade-transition fade-duration=0.5\n"
        "\n"
        "Optional key=value arguments:\n"
        "  script=script.txt\n"
        "  audio-dir=outputs/audios/generated\n"
        "  images-dir=outputs/images\n"
        "  output=outputs/videos/output.mp4\n"
        "  font=Helvetica\n"
        "  arabic-font=Geeza Pro\n"
        "  heading-font=Helvetica\n"
        "  subheading-font=Helvetica\n"
        "  font-size=72\n"
        "  font-color=white\n"
        "  heading-font-color=yellow\n"
        "  subheading-font-color=yellow\n"
        "  background=black\n"
        "  words-per-scene=20\n"
        "  fade-transition=no\n"
        "  fade-duration=0.5\n"
        "  width=1920\n"
        "  height=1080\n"
        "  fps=30\n"
        "  preset=veryfast\n"
        "  crf=20\n"
        "  audio-bitrate=96k\n"
        "  codec=libx264\n"
        "  seperate-text-by-seperatorline=yes\n"
        "  limit=25\n"
        "  filter-threads=1\n"
        "  filter-complex-threads=1\n"
)


def fail(message: str) -> None:
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


def normalize_option_key(raw_key: str) -> str:
    stripped_key = raw_key.strip().lower()
    if stripped_key.startswith("--"):
        stripped_key = stripped_key[2:]
    return OPTION_ALIASES.get(stripped_key, stripped_key)


def parse_args(argv: list[str]) -> dict[str, str | None]:
    if any(arg in {"-h", "--help", "help"} for arg in argv):
        print(USAGE)
        sys.exit(0)

    options: dict[str, str | None] = dict(DEFAULTS)
    index = 0
    while index < len(argv):
        arg = argv[index]

        if arg.startswith("--no-"):
            key = normalize_option_key(arg[5:])
            if key not in BOOLEAN_OPTIONS:
                fail(f"Unknown boolean option: {arg}")
            options[key] = "no"
            index += 1
            continue

        if "=" in arg:
            key, value = arg.split("=", 1)
            key = normalize_option_key(key)
        elif arg.startswith("--"):
            key = normalize_option_key(arg)
            if key in BOOLEAN_OPTIONS:
                value = "yes"
            else:
                if index + 1 >= len(argv):
                    fail(f"Missing value for option: {arg}")
                value = argv[index + 1]
                index += 1
        else:
            fail(f"Arguments must use key=value format or --option style. Invalid argument: {arg}")

        if key not in DEFAULTS:
            fail(f"Unknown option: {key}")
        options[key] = value.strip()
        index += 1
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


def parse_non_negative_float(name: str, value: str | None) -> float:
    if value is None or value == "":
        return 0.0
    try:
        parsed = float(value)
    except ValueError as exc:
        raise SystemExit(f"Error: {name} must be a number, got {value!r}") from exc
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


def resolve_path(value: str | None, default_value: str) -> Path:
    path = Path(value or default_value)
    if path.is_absolute():
        return path
    return PROJECT_ROOT / path


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
    has_image = bool(IMAGE_TAG_RE.search(value))
    text_without_image_markup = IMAGE_TAG_RE.sub(" ", value)

    style = STYLE_NORMAL
    if HEADING_TAG_RE.search(text_without_image_markup):
        style = STYLE_HEADING
    elif SUBHEADING_TAG_RE.search(text_without_image_markup):
        style = STYLE_SUBHEADING

    cleaned_text = normalize_text(MARKUP_TAG_RE.sub(" ", text_without_image_markup))
    return ScriptSegment(text=cleaned_text, style=style, has_image=has_image)


def load_script_segments(script_path: Path) -> tuple[list[ScriptSegment], list[ScriptSegment], list[int]]:
    raw_segments = [parse_script_segment(piece) for piece in script_path.read_text(encoding="utf-8").split("---")]
    non_empty_segments: list[ScriptSegment] = []
    non_empty_raw_indices: list[int] = []
    for index, segment in enumerate(raw_segments):
        if not segment.text:
            continue
        non_empty_segments.append(segment)
        non_empty_raw_indices.append(index)
    return raw_segments, non_empty_segments, non_empty_raw_indices


def extract_wav_index(path: Path) -> int | None:
    match = WAV_INDEX_RE.search(path.name)
    if match is None:
        return None
    return int(match.group(1))


def preview_segment_text(text: str, limit: int = 60) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def format_segment_refs(indices: list[int], segments: list[ScriptSegment], limit: int = 3) -> str:
    refs: list[str] = []
    for index in indices[:limit]:
        preview = preview_segment_text(segments[index].text or "<empty>")
        refs.append(f"{index} ({preview!r})")
    if len(indices) > limit:
        refs.append(f"+{len(indices) - limit} more")
    return ", ".join(refs)


def build_segment_count_error(
    raw_segments: list[ScriptSegment],
    non_empty_segments: list[ScriptSegment],
    wav_files: list[Path],
) -> str:
    message = (
        f"Script segment count ({len(raw_segments)} raw / {len(non_empty_segments)} non-empty) "
        f"does not match WAV file count ({len(wav_files)})"
    )

    wav_indices = [extract_wav_index(path) for path in wav_files]
    if any(index is None for index in wav_indices):
        return message

    indexed_wav_files = [index for index in wav_indices if index is not None]
    missing_indices = sorted(set(range(len(raw_segments))) - set(indexed_wav_files))
    extra_indices = sorted(set(indexed_wav_files) - set(range(len(raw_segments))))
    details: list[str] = []
    if missing_indices:
        details.append(f"missing audio indices: {format_segment_refs(missing_indices, raw_segments)}")
    if extra_indices:
        details.append(f"unexpected audio indices: {', '.join(str(index) for index in extra_indices[:5])}")
    if not details:
        return message
    return f"{message}; {'; '.join(details)}"


def resolve_script_segments(
    raw_segments: list[ScriptSegment],
    non_empty_segments: list[ScriptSegment],
    non_empty_raw_indices: list[int],
    wav_files: list[Path],
) -> tuple[list[ScriptSegment], list[int]]:
    expected_count = len(wav_files)
    wav_indices = [extract_wav_index(path) for path in wav_files]

    if all(index is not None for index in wav_indices):
        indexed_wav_files = [index for index in wav_indices if index is not None]
        if indexed_wav_files == list(range(expected_count)) and len(raw_segments) >= expected_count:
            return raw_segments[:expected_count], list(range(expected_count))
        if indexed_wav_files == non_empty_raw_indices[:expected_count] and len(non_empty_segments) >= expected_count:
            return non_empty_segments[:expected_count], non_empty_raw_indices[:expected_count]

    if len(raw_segments) == expected_count:
        return raw_segments, list(range(expected_count))
    if len(non_empty_segments) == expected_count:
        return non_empty_segments, non_empty_raw_indices[:expected_count]

    fail(build_segment_count_error(raw_segments, non_empty_segments, wav_files))


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
    segment_raw_indices: list[int],
    words_per_scene: int,
) -> tuple[list[SceneChunk], float]:
    scenes: list[SceneChunk] = []
    current_time = 0.0

    for segment, wav_path, raw_segment_index in zip(segments, wav_files, segment_raw_indices, strict=True):
        duration = get_wav_duration(wav_path)
        chunks = split_scene_text(segment.text, words_per_scene)
        chunk_duration = duration / len(chunks)

        for chunk in chunks:
            start = current_time
            end = current_time + chunk_duration
            scenes.append(
                SceneChunk(
                    runs=[StyledRun(chunk, segment.style)],
                    start=start,
                    end=end,
                    raw_segment_index=raw_segment_index,
                )
            )
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
    segment_raw_indices: list[int],
    words_per_scene: int,
) -> tuple[list[SceneChunk], float]:
    timed_words: list[tuple[str, str, float, int]] = []
    leading_gap = 0.0

    for segment, wav_path, raw_segment_index in zip(segments, wav_files, segment_raw_indices, strict=True):
        duration = get_wav_duration(wav_path)
        words = segment.text.split()
        if not words:
            if timed_words:
                last_word, last_style, last_duration, last_raw_index = timed_words[-1]
                timed_words[-1] = (last_word, last_style, last_duration + duration, last_raw_index)
            else:
                leading_gap += duration
            continue

        word_duration = duration / len(words)
        timed_words.extend((word, segment.style, word_duration, raw_segment_index) for word in words)

    total_duration = leading_gap + sum(duration for _, _, duration, _ in timed_words)
    if not timed_words:
        return [SceneChunk(runs=[StyledRun("", STYLE_NORMAL)], start=0.0, end=total_duration)], total_duration

    scenes: list[SceneChunk] = []
    current_time = leading_gap
    scene_words: list[tuple[str, str]] = []
    scene_duration = 0.0
    scene_raw_index: int | None = None

    for word, style, duration, raw_segment_index in timed_words:
        scene_words.append((word, style))
        if scene_raw_index is None:
            scene_raw_index = raw_segment_index
        scene_duration += duration
        if words_per_scene > 0 and len(scene_words) < words_per_scene:
            continue

        start = current_time
        end = current_time + scene_duration
        scenes.append(
            SceneChunk(
                runs=build_scene_runs(scene_words),
                start=start,
                end=end,
                raw_segment_index=scene_raw_index,
            )
        )
        current_time = end
        scene_words = []
        scene_duration = 0.0
        scene_raw_index = None

    if scene_words or not scenes:
        start = current_time
        end = current_time + scene_duration
        scenes.append(
            SceneChunk(
                runs=build_scene_runs(scene_words),
                start=start,
                end=end,
                raw_segment_index=scene_raw_index,
            )
        )
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
    segment_raw_indices: list[int],
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
) -> tuple[str, float, list[SceneChunk]]:
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
        scenes, total_duration = build_segment_bound_scenes(
            segments,
            wav_files,
            segment_raw_indices,
            words_per_scene,
        )
    else:
        scenes, total_duration = build_word_bound_scenes(
            segments,
            wav_files,
            segment_raw_indices,
            words_per_scene,
        )

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

    return "\n".join(lines) + "\n", total_duration, scenes


def build_ffconcat_content(wav_files: list[Path]) -> str:
    lines = ["ffconcat version 1.0"]
    for wav_file in wav_files:
        lines.append(f"file {shlex.quote(str(wav_file.resolve()))}")
    return "\n".join(lines) + "\n"


def parse_color_rgb(value: str) -> tuple[int, int, int]:
    rgb = parse_color_hex(value)
    return (
        int(rgb[0:2], 16),
        int(rgb[2:4], 16),
        int(rgb[4:6], 16),
    )


def write_png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    payload = chunk_type + data
    return (
        len(data).to_bytes(4, "big")
        + payload
        + zlib.crc32(payload).to_bytes(4, "big")
    )


def write_solid_png_image(path: Path, color: tuple[int, int, int], width: int, height: int) -> None:
    if width <= 0 or height <= 0:
        fail("Fallback background dimensions must be greater than 0")

    png_signature = b"\x89PNG\r\n\x1a\n"
    ihdr = (
        width.to_bytes(4, "big")
        + height.to_bytes(4, "big")
        + b"\x08"  # bit depth
        + b"\x02"  # color type: truecolor RGB
        + b"\x00"  # compression
        + b"\x00"  # filter
        + b"\x00"  # interlace
    )
    row = b"\x00" + (bytes(color) * width)
    pixel_data = row * height
    idat = zlib.compress(pixel_data)
    png_bytes = (
        png_signature
        + write_png_chunk(b"IHDR", ihdr)
        + write_png_chunk(b"IDAT", idat)
        + write_png_chunk(b"IEND", b"")
    )
    path.write_bytes(png_bytes)


def get_image_dimensions(path: Path) -> tuple[int, int]:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "csv=p=0:s=x",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise SystemExit("Error: ffprobe is required but was not found in PATH") from exc
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"Error: Unable to inspect image size for {path}") from exc

    output = result.stdout.strip()
    try:
        raw_width, raw_height = output.split("x", 1)
        width = int(raw_width)
        height = int(raw_height)
    except ValueError as exc:
        raise SystemExit(f"Error: Unable to parse image dimensions for {path}: {output!r}") from exc

    if width <= 0 or height <= 0:
        raise SystemExit(f"Error: Invalid image dimensions for {path}: {width}x{height}")
    return width, height


def resolve_fallback_background_dimensions(
    scene_backgrounds: list[Path | None],
    width: int,
    height: int,
) -> tuple[int, int]:
    for image_path in scene_backgrounds:
        if image_path is None:
            continue
        return get_image_dimensions(image_path)
    return width, height


def build_background_timeline(
    scenes: list[SceneChunk],
    scene_backgrounds: list[Path | None],
    fallback_image: Path,
) -> list[BackgroundClip]:
    fallback_path = fallback_image.resolve()
    timeline: list[BackgroundClip] = []

    for scene, image_path in zip(scenes, scene_backgrounds, strict=True):
        duration = max(0.0, scene.end - scene.start)
        if duration <= 0:
            continue

        resolved_image = image_path.resolve() if image_path is not None else fallback_path
        if timeline and timeline[-1].path == resolved_image:
            previous_clip = timeline[-1]
            timeline[-1] = BackgroundClip(path=previous_clip.path, duration=previous_clip.duration + duration)
        else:
            timeline.append(BackgroundClip(path=resolved_image, duration=duration))

    if not timeline:
        timeline.append(BackgroundClip(path=fallback_path, duration=0.1))

    return timeline


def build_background_ffconcat_content(timeline: list[BackgroundClip]) -> str:
    if not timeline:
        fail("Background timeline must contain at least one clip")

    lines = ["ffconcat version 1.0"]
    for clip in timeline:
        lines.append(f"file {shlex.quote(str(clip.path))}")
        lines.append(f"duration {clip.duration:.6f}")

    # Repeat the final file so ffmpeg honors the last duration entry.
    lines.append(f"file {shlex.quote(str(timeline[-1].path))}")
    return "\n".join(lines) + "\n"


def escape_subtitles_filter_path(path: Path) -> str:
    return path.as_posix().replace("\\", r"\\").replace(":", r"\:").replace("'", r"\'")


def build_image_maps(images_dir: Path) -> tuple[dict[int, Path], dict[int, Path]]:
    block_map: dict[int, Path] = {}
    sequence_map: dict[int, Path] = {}
    if not images_dir.exists() or not images_dir.is_dir():
        return block_map, sequence_map

    for candidate in sorted(images_dir.iterdir(), key=natural_sort_key):
        if not candidate.is_file():
            continue

        block_match = IMAGE_BLOCK_FILE_RE.fullmatch(candidate.name)
        if block_match:
            block_index = int(block_match.group(1))
            block_map.setdefault(block_index, candidate)
            continue

        sequence_match = IMAGE_SEQUENCE_FILE_RE.fullmatch(candidate.name)
        if sequence_match:
            sequence_index = int(sequence_match.group(1))
            sequence_map.setdefault(sequence_index, candidate)

    return block_map, sequence_map


def build_prompt_order_by_raw_index(
    segments: list[ScriptSegment],
    segment_raw_indices: list[int],
) -> dict[int, int]:
    prompt_order_by_raw_index: dict[int, int] = {}
    prompt_order = 0
    for segment, raw_index in zip(segments, segment_raw_indices, strict=True):
        if not segment.has_image:
            continue
        prompt_order += 1
        prompt_order_by_raw_index[raw_index] = prompt_order
    return prompt_order_by_raw_index


def resolve_scene_backgrounds(
    scenes: list[SceneChunk],
    segments: list[ScriptSegment],
    segment_raw_indices: list[int],
    images_dir: Path,
) -> list[Path | None]:
    if not scenes:
        return []

    block_images, sequence_images = build_image_maps(images_dir)
    if not block_images and not sequence_images:
        return [None for _ in scenes]

    segment_by_raw_index = {
        raw_index: segment
        for segment, raw_index in zip(segments, segment_raw_indices, strict=True)
    }
    prompt_order_by_raw_index = build_prompt_order_by_raw_index(segments, segment_raw_indices)

    scene_backgrounds: list[Path | None] = []
    for scene in scenes:
        raw_index = scene.raw_segment_index
        if raw_index is None:
            scene_backgrounds.append(None)
            continue

        segment = segment_by_raw_index.get(raw_index)
        if segment is None or not segment.has_image:
            scene_backgrounds.append(None)
            continue

        block_index = raw_index + 1
        image_path = block_images.get(block_index)
        if image_path is None:
            prompt_order = prompt_order_by_raw_index.get(raw_index)
            if prompt_order is not None:
                image_path = sequence_images.get(prompt_order)

        scene_backgrounds.append(image_path)

    return scene_backgrounds


def build_background_filter(
    input_label: str,
    output_label: str,
    width: int,
    height: int,
    fps: int,
    duration: float | None = None,
) -> str:
    filter_parts = [
        f"{input_label}"
        f"fps={fps},"
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},"
        f"setsar=1,"
        f"format=yuv420p"
    ]
    if duration is not None:
        filter_parts.append(f",trim=duration={duration:.6f}")
    filter_parts.append(f",setpts=PTS-STARTPTS{output_label}")
    return "".join(filter_parts)


def resolve_transition_durations(
    timeline: list[BackgroundClip],
    fade_duration: float,
) -> list[float]:
    if len(timeline) < 2 or fade_duration <= 0:
        return []

    transition_durations = [fade_duration for _ in range(len(timeline) - 1)]
    transition_durations[-1] = min(transition_durations[-1], timeline[-1].duration)
    return transition_durations


def run_ffmpeg(
    concat_file: Path,
    background_timeline: list[BackgroundClip],
    background_concat_file: Path,
    subtitle_file: Path,
    output_file: Path,
    width: int,
    height: int,
    fps: int,
    codec: str,
    preset: str,
    crf: str,
    audio_bitrate: str,
    fade_transition: bool,
    fade_duration: float,
    filter_threads: int,
    filter_complex_threads: int,
) -> None:
    command = [
        "ffmpeg",
        "-y",
        "-filter_threads",
        str(filter_threads),
        "-filter_complex_threads",
        str(filter_complex_threads),
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat_file),
    ]

    filter_parts: list[str] = []
    use_fade_transition = fade_transition and len(background_timeline) > 1 and fade_duration > 0
    if use_fade_transition:
        transition_durations = resolve_transition_durations(background_timeline, fade_duration)
        for clip_index, clip in enumerate(background_timeline):
            clip_duration = clip.duration
            if clip_index < len(transition_durations):
                clip_duration += transition_durations[clip_index]
            command.extend([
                "-loop",
                "1",
                "-t",
                f"{clip_duration:.6f}",
                "-i",
                str(clip.path),
            ])
            filter_parts.append(
                build_background_filter(
                    input_label=f"[{clip_index + 1}:v]",
                    output_label=f"[bg{clip_index}]",
                    width=width,
                    height=height,
                    fps=fps,
                    duration=clip_duration,
                )
            )

        current_label = "bg0"
        cumulative_offset = background_timeline[0].duration
        for clip_index in range(1, len(background_timeline)):
            output_label = "base" if clip_index == len(background_timeline) - 1 else f"bgxf{clip_index}"
            filter_parts.append(
                f"[{current_label}][bg{clip_index}]"
                f"xfade=transition=fade:duration={transition_durations[clip_index - 1]:.6f}:"
                f"offset={cumulative_offset:.6f}[{output_label}]"
            )
            current_label = output_label
            cumulative_offset += background_timeline[clip_index].duration
    else:
        command.extend([
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(background_concat_file),
        ])
        filter_parts.append(
            build_background_filter(
                input_label="[1:v]",
                output_label="[base]",
                width=width,
                height=height,
                fps=fps,
            )
        )

    subtitle_path = escape_subtitles_filter_path(subtitle_file)
    filter_parts.append(f"[base]subtitles='{subtitle_path}'[vout]")

    command.extend([
        "-filter_complex",
        ";".join(filter_parts),
        "-map",
        "[vout]",
        "-map",
        "0:a:0",
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
    ])
    try:
        subprocess.run(command, check=True)
    except FileNotFoundError as exc:
        raise SystemExit("Error: ffmpeg is required but was not found in PATH") from exc


def main() -> None:
    options = parse_args(sys.argv[1:])

    script_path = resolve_path(options["script"], DEFAULTS["script"])
    audio_dir = resolve_path(options["audio-dir"], DEFAULTS["audio-dir"])
    images_dir = resolve_path(options["images-dir"], DEFAULTS["images-dir"])
    output_file = resolve_path(options["output"], DEFAULTS["output"])
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
    fade_transition = parse_bool("fade-transition", options["fade-transition"])
    fade_duration = parse_non_negative_float("fade-duration", options["fade-duration"])
    seperate_text_by_seperatorline = parse_bool(
        "seperate-text-by-seperatorline",
        options["seperate-text-by-seperatorline"],
    )
    limit = parse_limit(options["limit"])
    filter_threads = parse_positive_int("filter-threads", options["filter-threads"])
    filter_complex_threads = parse_positive_int(
        "filter-complex-threads",
        options["filter-complex-threads"],
    )

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

    raw_segments, non_empty_segments, non_empty_raw_indices = load_script_segments(script_path)
    segments, segment_raw_indices = resolve_script_segments(
        raw_segments,
        non_empty_segments,
        non_empty_raw_indices,
        wav_files,
    )

    subtitle_content, _, scenes = build_subtitle_content(
        segments=segments,
        wav_files=wav_files,
        segment_raw_indices=segment_raw_indices,
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
    scene_backgrounds = resolve_scene_backgrounds(
        scenes=scenes,
        segments=segments,
        segment_raw_indices=segment_raw_indices,
        images_dir=images_dir,
    )

    image_scene_count = sum(1 for image in scene_backgrounds if image is not None)
    if image_scene_count:
        print(f"Using generated images for {image_scene_count} scene(s) from {images_dir}")
    else:
        print(f"No matching scene images found in {images_dir}. Falling back to solid background.")
    if fade_transition and fade_duration > 0:
        print(f"Applying fade transitions with duration {fade_duration:.2f}s")

    concat_content = build_ffconcat_content(wav_files)

    output_file.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="generate_video_") as temp_dir:
        temp_path = Path(temp_dir)
        concat_file = temp_path / "audio.ffconcat"
        background_file = temp_path / "background.png"
        background_concat_file = temp_path / "backgrounds.ffconcat"
        subtitle_file = temp_path / "subtitles.ass"
        concat_file.write_text(concat_content, encoding="utf-8")
        fallback_width, fallback_height = resolve_fallback_background_dimensions(
            scene_backgrounds=scene_backgrounds,
            width=width,
            height=height,
        )
        write_solid_png_image(
            background_file,
            parse_color_rgb(background),
            width=fallback_width,
            height=fallback_height,
        )
        background_timeline = build_background_timeline(
            scenes=scenes,
            scene_backgrounds=scene_backgrounds,
            fallback_image=background_file,
        )
        background_concat_file.write_text(
            build_background_ffconcat_content(background_timeline),
            encoding="utf-8",
        )
        subtitle_file.write_text(subtitle_content, encoding="utf-8")

        try:
            run_ffmpeg(
                concat_file=concat_file,
                background_timeline=background_timeline,
                background_concat_file=background_concat_file,
                subtitle_file=subtitle_file,
                output_file=output_file,
                width=width,
                height=height,
                fps=fps,
                codec=codec,
                preset=preset,
                crf=crf,
                audio_bitrate=audio_bitrate,
                fade_transition=fade_transition,
                fade_duration=fade_duration,
                filter_threads=filter_threads,
                filter_complex_threads=filter_complex_threads,
            )
        except subprocess.CalledProcessError as exc:
            raise SystemExit(f"Error: ffmpeg failed with exit code {exc.returncode}") from exc

    print(f"Created {output_file}")


if __name__ == "__main__":
    main()
