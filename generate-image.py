from __future__ import annotations

import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import NoReturn

import requests
from dotenv import load_dotenv


MODEL_PATH = "@cf/stabilityai/stable-diffusion-xl-base-1.0"
DEFAULTS = {
    "script": "script.txt",
    "output-dir": "images_output",
    "width": None,
    "height": None,
    "max-workers": None,
}
OPTION_ALIASES = {
    "output": "output-dir",
    "workers": "max-workers",
    "image-width": "width",
    "image-height": "height",
}
USAGE = """Usage:
  python generate-image.py
  python generate-image.py width=1920 height=1080

Optional key=value arguments:
  script=script.txt
  output-dir=images_output
  width=1920
  height=1080
  max-workers=8
"""

SCRIPT_BLOCK_SEPARATOR = "---"
TAG_RE = re.compile(r"<[^>]*>")
IMAGE_BLOCK_TAG_RE = re.compile(r"<\s*image\s*>(.*?)<\s*/\s*image\s*>", re.IGNORECASE | re.DOTALL)
REQUEST_TIMEOUT_SECONDS = 120
MAX_RETRIES = 2


@dataclass(frozen=True)
class GenerationResult:
    block_index: int
    output_path: Path | None
    error: str | None


@dataclass(frozen=True)
class ImagePrompt:
    block_index: int
    prompt: str


def fail(message: str) -> NoReturn:
    raise SystemExit(f"Error: {message}")


def parse_args(argv: list[str]) -> dict[str, str | None]:
    if any(arg in {"-h", "--help", "help"} for arg in argv):
        print(USAGE)
        raise SystemExit(0)

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
    raw_value = value
    if raw_value is None or raw_value == "":
        fail(f"{name} is required")
    try:
        parsed = int(raw_value)
    except ValueError as exc:
        raise SystemExit(f"Error: {name} must be an integer, got {value!r}") from exc
    if parsed <= 0:
        fail(f"{name} must be greater than 0")
    return parsed


def parse_optional_positive_int(name: str, value: str | None) -> int | None:
    if value in {None, ""}:
        return None
    return parse_positive_int(name, value)


def clean_prompt(value: str) -> str:
    return " ".join(TAG_RE.sub(" ", value).split())


def load_prompts(script_path: Path) -> list[ImagePrompt]:
    if not script_path.exists():
        fail(f"Script file not found: {script_path}")

    script_content = script_path.read_text(encoding="utf-8")
    prompts: list[ImagePrompt] = []
    for block_index, block_text in enumerate(script_content.split(SCRIPT_BLOCK_SEPARATOR), start=1):
        cleaned_block_prompts = [
            clean_prompt(prompt_text)
            for prompt_text in IMAGE_BLOCK_TAG_RE.findall(block_text)
        ]
        cleaned_block_prompts = [prompt for prompt in cleaned_block_prompts if prompt]
        if not cleaned_block_prompts:
            continue

        prompts.append(ImagePrompt(block_index=block_index, prompt=cleaned_block_prompts[0]))
        if len(cleaned_block_prompts) > 1:
            print(
                f"[block {block_index:03}] multiple <image> tags found; using the first one"
            )
    return prompts


def get_api_context() -> tuple[str, dict[str, str]]:
    account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")
    api_token = os.getenv("CLOUDFLARE_API_TOKEN")

    if not account_id:
        fail("CLOUDFLARE_ACCOUNT_ID is missing")
    if not api_token:
        fail("CLOUDFLARE_API_TOKEN is missing")

    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{MODEL_PATH}"
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    }
    return url, headers


def preview(value: str, limit: int = 60) -> str:
    if len(value) <= limit:
        return value
    return value[: limit - 3].rstrip() + "..."


def extension_from_content_type(content_type: str) -> str:
    base_type = content_type.split(";", 1)[0].strip().lower()
    if "/" not in base_type:
        return "png"
    ext = base_type.split("/", 1)[1]
    if ext == "jpeg":
        return "jpg"
    return ext or "png"


def should_retry(status_code: int) -> bool:
    return status_code in {429, 500, 502, 503, 504}


def remove_existing_block_images(output_dir: Path, block_index: int) -> None:
    for existing_path in output_dir.glob(f"image_block_{block_index:04d}.*"):
        existing_path.unlink(missing_ok=True)


def request_image(
    url: str,
    headers: dict[str, str],
    image_prompt: ImagePrompt,
    output_dir: Path,
    width: int | None,
    height: int | None,
) -> GenerationResult:
    payload: dict[str, object] = {"prompt": image_prompt.prompt}
    if width is not None and height is not None:
        payload["width"] = width
        payload["height"] = height

    last_error: str | None = None

    for attempt in range(1, MAX_RETRIES + 2):
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT_SECONDS)
        except requests.RequestException as exc:
            last_error = f"request error: {exc}"
            if attempt <= MAX_RETRIES:
                continue
            return GenerationResult(block_index=image_prompt.block_index, output_path=None, error=last_error)

        content_type = response.headers.get("content-type", "")
        if response.ok and content_type.lower().startswith("image/"):
            ext = extension_from_content_type(content_type)
            remove_existing_block_images(output_dir, image_prompt.block_index)
            output_path = output_dir / f"image_block_{image_prompt.block_index:04d}.{ext}"
            output_path.write_bytes(response.content)
            return GenerationResult(block_index=image_prompt.block_index, output_path=output_path, error=None)

        body = response.text.strip().replace("\n", " ")
        if len(body) > 200:
            body = body[:197] + "..."
        last_error = (
            f"status={response.status_code} content-type={content_type or 'unknown'} "
            f"body={body or '<empty>'}"
        )
        if attempt <= MAX_RETRIES and should_retry(response.status_code):
            continue
        return GenerationResult(block_index=image_prompt.block_index, output_path=None, error=last_error)

    return GenerationResult(
        block_index=image_prompt.block_index,
        output_path=None,
        error=last_error or "unknown error",
    )


def resolve_max_workers(total_prompts: int, option_value: str | None) -> int:
    env_value = os.getenv("IMAGE_MAX_WORKERS", "").strip()
    configured_value = option_value if option_value not in {None, ""} else env_value
    if configured_value in {None, ""}:
        return total_prompts

    parsed = parse_positive_int("max-workers", configured_value)
    return min(parsed, total_prompts)


def resolve_dimensions(options: dict[str, str | None]) -> tuple[int | None, int | None]:
    width = parse_optional_positive_int("width", options["width"])
    height = parse_optional_positive_int("height", options["height"])

    if (width is None) != (height is None):
        fail("Set both width and height together")

    return width, height


def main() -> None:
    options = parse_args(sys.argv[1:])
    script_path = Path(options["script"] or DEFAULTS["script"])
    output_dir = Path(options["output-dir"] or DEFAULTS["output-dir"])

    load_dotenv()
    width, height = resolve_dimensions(options)

    url, headers = get_api_context()
    prompts = load_prompts(script_path)

    if not prompts:
        fail(f"No <image>...</image> prompts found in {script_path}")

    output_dir.mkdir(parents=True, exist_ok=True)

    max_workers = resolve_max_workers(len(prompts), options["max-workers"])
    print(f"Found {len(prompts)} image prompt block(s) in {script_path}")
    print(f"Generating in parallel with {max_workers} concurrent request(s)")
    if width is not None and height is not None:
        print(f"Requested output dimensions: {width}x{height}")
    else:
        print("Using model default image dimensions")

    results: list[GenerationResult] = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                request_image,
                url,
                headers,
                image_prompt,
                output_dir,
                width,
                height,
            ): image_prompt
            for image_prompt in prompts
        }
        for future in as_completed(futures):
            image_prompt = futures[future]
            result = future.result()
            results.append(result)
            if result.error is None and result.output_path is not None:
                print(
                    f"[block {image_prompt.block_index:03}] "
                    f"saved {result.output_path.name}"
                )
            else:
                print(
                    f"[block {image_prompt.block_index:03}] "
                    f"failed for prompt {preview(image_prompt.prompt)!r}: {result.error}"
                )

    successes = sum(1 for result in results if result.error is None)
    failures = len(results) - successes
    print(f"Done. success={successes}, failed={failures}, output_dir={output_dir}")


if __name__ == "__main__":
    main()