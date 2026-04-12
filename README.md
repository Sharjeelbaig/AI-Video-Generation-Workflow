# Sealed Nector TTS

Turn a marked-up script into narrated audio segments and a subtitle video.

This repo is a small production pipeline built around `mlx-audio` and `ffmpeg`:

1. Write your script in `script.txt`
2. Split scenes with `---`
3. Optionally mark titles with `<Heading>` and `<SubHeading>`
4. Generate WAV files for each script segment
5. Render a video with styled subtitles

It is designed for fast documentary-style narration workflows and supports mixed English text with Arabic subtitle rendering.

## What It Does

- Generates a designed reference voice sample
- Generates per-segment narration from `script.txt`
- Builds a subtitle video from the generated WAV files
- Supports word-based scene chunking for long subtitle segments
- Supports heading and subheading styling in the video
- Strips markup tags from TTS input so tags are never spoken
- Uses a separate Arabic subtitle font for Arabic text in captions

## Project Files

- [script.txt](/Users/shazi/Projects/sealed-nector-tts/script.txt:1): source script
- [voice-design.py](/Users/shazi/Projects/sealed-nector-tts/voice-design.py:1): creates `designed_voice_000.wav`
- [voice-generate.py](/Users/shazi/Projects/sealed-nector-tts/voice-generate.py:1): generates narration using the reference voice sample
- [voice-design-generate.py](/Users/shazi/Projects/sealed-nector-tts/voice-design-generate.py:1): generates narration directly from an instruction prompt
- [generate-video.py](/Users/shazi/Projects/sealed-nector-tts/generate-video.py:1): builds the final subtitle video
- [output](/Users/shazi/Projects/sealed-nector-tts/output): generated WAV files

## Requirements

- macOS with Python 3.12+
- Apple Silicon is strongly recommended because this project uses `mlx`
- `ffmpeg` and `ffprobe` installed and available in `PATH`
- A Python environment with the dependencies from [pyproject.toml](/Users/shazi/Projects/sealed-nector-tts/pyproject.toml:1)

## Installation

### 1. Create the environment

```bash
uv sync
```

### 2. Activate it

```bash
source .venv/bin/activate
```

If you prefer, you can skip activation and run everything with `uv run python ...`.

### 3. Install ffmpeg

On macOS with Homebrew:

```bash
brew install ffmpeg
```

Check it:

```bash
ffmpeg -version
ffprobe -version
```

## Script Format

The script is read from `script.txt`.

### Scene separator

Use `---` to split the script into narration segments:

```text
This is the first spoken segment.
---
This is the second spoken segment.
---
This is the third spoken segment.
```

Each segment normally maps to one generated WAV file.

### Heading and subheading markup

Use `<Heading>` and `<SubHeading>` for visual styling in the video:

```text
<Heading>Location and Nature of Arab Tribes.</Heading>
---
<SubHeading>LOCATION OF THE ARABS:</SubHeading>
---
The Arabian Peninsula is enclosed in the west by the Red Sea and Sinai.
```

Behavior:

- Heading text is shown in the video with heading styling
- Subheading text is shown in the video with subheading styling
- These tags are removed before TTS generation
- `<` and `>` are not spoken
- Normal text is unchanged

## Quick Start

### Option A: Create a reference voice, then narrate with it

```bash
python voice-design.py
python voice-generate.py
python generate-video.py
```

### Option B: Generate narration directly from the voice instruction

```bash
python voice-design-generate.py
python generate-video.py
```

The final video is written to `output.mp4` by default.

## Voice Generation Workflows

### 1. `voice-design.py`

This script creates a sample reference voice file:

```bash
python voice-design.py
```

Output:

- `designed_voice_000.wav`

This file is then used by [voice-generate.py](/Users/shazi/Projects/sealed-nector-tts/voice-generate.py:1) as `REF_AUDIO`.

### 2. `voice-generate.py`

This script:

- reads `script.txt`
- splits it by `---`
- removes all markup tags like `<Heading>` and `<SubHeading>`
- generates one WAV per segment into `output/`
- uses `designed_voice_000.wav` as the voice reference

Run it:

```bash
python voice-generate.py
```

Important:

- `REF_TEXT` inside [voice-generate.py](/Users/shazi/Projects/sealed-nector-tts/voice-generate.py:6) should match the spoken text in `designed_voice_000.wav`
- If you change the text in [voice-design.py](/Users/shazi/Projects/sealed-nector-tts/voice-design.py:1), update `REF_TEXT` too

### 3. `voice-design-generate.py`

This script skips reference voice cloning and generates speech directly from an instruction prompt:

```bash
python voice-design-generate.py
```

It also:

- reads `script.txt`
- splits by `---`
- removes markup tags before TTS
- writes WAV files into `output/`

Use this if you want a faster instruction-only workflow.

## Video Generation

Generate a video from the WAV files in `output/`:

```bash
python generate-video.py
```

Default behavior:

- script source: `script.txt`
- audio source: `output/`
- output video: `output.mp4`
- font: `Helvetica`
- Arabic font: `Geeza Pro`
- text color: white
- background: black
- words per scene: 10
- separator-line splitting: enabled

### Video command examples

Basic:

```bash
python generate-video.py
```

Black background, white text, 20 words per screen:

```bash
python generate-video.py font-color=white background=black words-per-scene=20
```

Ignore `---` boundaries and chunk strictly by word count:

```bash
python generate-video.py \
  font=Helvetica \
  arabic-font="Geeza Pro" \
  font-color=white \
  background=black \
  words-per-scene=20 \
  seperate-text-by-seperatorline=no
```

Show up to 100 words on one screen:

```bash
python generate-video.py \
  font=Helvetica \
  arabic-font="Geeza Pro" \
  font-color=white \
  background=black \
  words-per-scene=100 \
  seperate-text-by-seperatorline=no
```

Preview only the first 3 segments:

```bash
python generate-video.py limit=3
```

Custom heading and subheading styles:

```bash
python generate-video.py \
  font=Helvetica \
  heading-font="Helvetica-Bold" \
  subheading-font=Helvetica \
  font-color=white \
  heading-font-color=yellow \
  subheading-font-color=orange \
  background=black
```

## `generate-video.py` Options

All options use `key=value`.

```text
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
```

Notes:

- `heading-font` defaults to the normal `font`
- `subheading-font` defaults to the normal `font`
- heading size is automatically 2x the subheading size
- subheading size is the normal `font-size`
- normal body text keeps the normal font and color
- `seperate-text-by-seperatorline=no` ignores `---` when deciding subtitle screen breaks
- `heading-color` and `subheading-color` are also accepted as aliases

## Tutorials

## Tutorial 1: Fastest End-to-End Run

1. Put your script into `script.txt` and separate narration blocks with `---`.
2. Generate a designed voice sample:

```bash
python voice-design.py
```

3. Generate all narration WAV files:

```bash
python voice-generate.py
```

4. Render the video:

```bash
python generate-video.py
```

5. Open `output.mp4`.

## Tutorial 2: Use Headings and Subheadings

Example `script.txt`:

```text
<Heading>The Rise of Civilization</Heading>
---
<SubHeading>Early Settlements</SubHeading>
---
The first urban centers grew near rivers and trade routes.
```

Render with custom title styling:

```bash
python voice-generate.py
python generate-video.py \
  heading-font="Helvetica-Bold" \
  subheading-font="Helvetica" \
  heading-font-color=yellow \
  subheading-font-color=cyan
```

Result:

- heading appears larger than subheading
- both title types can have their own font and color
- the spoken audio contains only the actual title text, not the markup tags

## Tutorial 3: Ignore Script Breaks and Chunk by Word Count

If your `script.txt` contains many short `---` segments but you want larger subtitle blocks on screen, disable separator-line splitting:

```bash
python generate-video.py \
  words-per-scene=20 \
  seperate-text-by-seperatorline=no
```

This makes subtitle screens based on word count instead of strict `---` boundaries.

Use 100 words per screen:

```bash
python generate-video.py \
  words-per-scene=100 \
  seperate-text-by-seperatorline=no
```

## Tutorial 4: Quick Debug Run

Use `limit` to test only a small portion:

```bash
python generate-video.py limit=5
```

This is useful when checking:

- font choices
- subtitle layout
- Arabic font rendering
- heading/subheading styling
- ffmpeg performance

## Common Workflow Rules

- After changing `script.txt`, regenerate the WAV files before rendering the video
- The number of non-empty `---` segments must match the number of WAV files
- If you change the script but keep old WAV files, video generation can fail
- Headings and subheadings are for display styling only
- Use installed font names exactly as your system knows them

## Troubleshooting

### Error: script segment count does not match WAV file count

Cause:

- `script.txt` was edited after WAVs were generated
- old audio files are still in `output/`

Fix:

```bash
rm -f output/*.wav
python voice-generate.py
```

Or:

```bash
rm -f output/*.wav
python voice-design-generate.py
```

Then rerun:

```bash
python generate-video.py
```

### Error: `ffmpeg` or `ffprobe` not found

Install ffmpeg and make sure it is in your shell `PATH`:

```bash
brew install ffmpeg
```

### Arabic text is not rendering correctly

Try an Arabic-compatible subtitle font:

```bash
python generate-video.py arabic-font="Geeza Pro"
```

### Wrong font is showing in subtitles

The font name must match an installed system font exactly. On macOS, common examples are:

- `Helvetica`
- `Helvetica-Bold`
- `Geeza Pro`

### TTS is speaking markup or angle brackets

Current behavior strips all `<...>` tags before TTS. If that happens, make sure you regenerated audio after updating the scripts:

```bash
rm -f output/*.wav
python voice-generate.py
```

## Development Notes

- `voice-generate.py` uses a reference audio workflow
- `voice-design-generate.py` uses direct instruction-based generation
- `generate-video.py` uses ASS subtitles rendered through `ffmpeg`
- Arabic spans in subtitles are switched to the configured Arabic font

## Recommended Command Set

If you want the most practical day-to-day commands, these are the ones to remember:

```bash
uv sync
source .venv/bin/activate
python voice-design.py
python voice-generate.py
python generate-video.py
```

For word-count-only subtitle chunking:

```bash
python generate-video.py words-per-scene=20 seperate-text-by-seperatorline=no
```
