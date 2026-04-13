from __future__ import annotations

import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

import requests
from dotenv import load_dotenv


SCRIPT_PATH = Path("script.txt")
OUTPUT_DIR = Path("images_output")
MODEL_PATH = "@cf/stabilityai/stable-diffusion-xl-base-1.0"
BLOCK_SEPARATOR = "---"
TAG_RE = re.compile(r"<[^>]*>")
REQUEST_TIMEOUT_SECONDS = 120
MAX_RETRIES = 2


@dataclass(frozen=True)
class GenerationResult:
    index: int
    output_path: Path | None
    error: str | None


def clean_prompt(value: str) -> str:
    return " ".join(TAG_RE.sub(" ", value).split())


def load_prompts(script_path: Path) -> list[str]:
    if not script_path.exists():
        raise SystemExit(f"Error: Script file not found: {script_path}")

    prompts = [clean_prompt(piece) for piece in script_path.read_text(encoding="utf-8").split(BLOCK_SEPARATOR)]
    return [prompt for prompt in prompts if prompt]


def get_api_context() -> tuple[str, dict[str, str]]:
    account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")
    api_token = os.getenv("CLOUDFLARE_API_TOKEN")

    if not account_id:
        raise SystemExit("Error: CLOUDFLARE_ACCOUNT_ID is missing")
    if not api_token:
        raise SystemExit("Error: CLOUDFLARE_API_TOKEN is missing")

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


def request_image(url: str, headers: dict[str, str], prompt: str, index: int) -> GenerationResult:
    payload = {"prompt": prompt}
    last_error: str | None = None

    for attempt in range(1, MAX_RETRIES + 2):
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT_SECONDS)
        except requests.RequestException as exc:
            last_error = f"request error: {exc}"
            if attempt <= MAX_RETRIES:
                continue
            return GenerationResult(index=index, output_path=None, error=last_error)

        content_type = response.headers.get("content-type", "")
        if response.ok and content_type.lower().startswith("image/"):
            ext = extension_from_content_type(content_type)
            output_path = OUTPUT_DIR / f"image_{index:04d}.{ext}"
            output_path.write_bytes(response.content)
            return GenerationResult(index=index, output_path=output_path, error=None)

        body = response.text.strip().replace("\n", " ")
        if len(body) > 200:
            body = body[:197] + "..."
        last_error = (
            f"status={response.status_code} content-type={content_type or 'unknown'} "
            f"body={body or '<empty>'}"
        )
        if attempt <= MAX_RETRIES and should_retry(response.status_code):
            continue
        return GenerationResult(index=index, output_path=None, error=last_error)

    return GenerationResult(index=index, output_path=None, error=last_error or "unknown error")


def resolve_max_workers(total_prompts: int) -> int:
    env_value = os.getenv("IMAGE_MAX_WORKERS", "").strip()
    if not env_value:
        return total_prompts

    try:
        parsed = int(env_value)
    except ValueError as exc:
        raise SystemExit("Error: IMAGE_MAX_WORKERS must be an integer") from exc

    if parsed <= 0:
        raise SystemExit("Error: IMAGE_MAX_WORKERS must be greater than 0")

    return min(parsed, total_prompts)


def main() -> None:
    load_dotenv()
    url, headers = get_api_context()
    prompts = load_prompts(SCRIPT_PATH)

    if not prompts:
        raise SystemExit(f"Error: No prompt blocks found in {SCRIPT_PATH}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    max_workers = resolve_max_workers(len(prompts))
    print(f"Found {len(prompts)} prompts in {SCRIPT_PATH}")
    print(f"Generating in parallel with {max_workers} concurrent request(s)")

    results: list[GenerationResult] = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(request_image, url, headers, prompt, index): (index, prompt)
            for index, prompt in enumerate(prompts, start=1)
        }
        for future in as_completed(futures):
            index, prompt = futures[future]
            result = future.result()
            results.append(result)
            if result.error is None and result.output_path is not None:
                print(f"[{index:03}] saved {result.output_path.name}")
            else:
                print(f"[{index:03}] failed for prompt {preview(prompt)!r}: {result.error}")

    successes = sum(1 for result in results if result.error is None)
    failures = len(results) - successes
    print(f"Done. success={successes}, failed={failures}, output_dir={OUTPUT_DIR}")


if __name__ == "__main__":
    main()