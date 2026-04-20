"""Clear generated project outputs while preserving designed audios by default."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil


def resolve_project_root(default_root: Path) -> Path:
	override = os.getenv("SEALED_NECTOR_PROJECT_ROOT", "").strip()
	if not override:
		return default_root
	return Path(override).expanduser().resolve()


PROJECT_ROOT = resolve_project_root(Path(__file__).resolve().parents[1])
OUTPUTS_ROOT = PROJECT_ROOT / "outputs"
GENERATED_AUDIO_DIR = OUTPUTS_ROOT / "audios" / "generated"
DESIGNED_AUDIO_DIR = OUTPUTS_ROOT / "audios" / "designed"
IMAGES_DIR = OUTPUTS_ROOT / "images"
VIDEOS_DIR = OUTPUTS_ROOT / "videos"


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(
		description=(
			"Clear generated audios, images, and videos. "
			"Designed audios are preserved unless explicitly requested."
		)
	)
	parser.add_argument(
		"--clear-designed-audios",
		"--clear-designed",
		action="store_true",
		dest="clear_designed_audios",
		help="Also clear outputs/audios/designed",
	)
	parser.add_argument(
		"scope",
		nargs="?",
		choices=["audios"],
		help=argparse.SUPPRESS,
	)
	return parser.parse_args()


def clear_directory_contents(directory: Path) -> int:
	"""Delete all top-level entries in a directory and return removed count."""
	directory.mkdir(parents=True, exist_ok=True)

	if not directory.is_dir():
		raise NotADirectoryError(f"Expected a directory: {directory}")

	removed_count = 0
	for entry in directory.iterdir():
		if entry.is_dir():
			shutil.rmtree(entry)
		else:
			entry.unlink()
		removed_count += 1
	return removed_count


def rel(path: Path) -> str:
	try:
		return str(path.relative_to(PROJECT_ROOT))
	except ValueError:
		return str(path)


def main() -> None:
	args = parse_args()

	targets = [
		GENERATED_AUDIO_DIR,
		IMAGES_DIR,
		VIDEOS_DIR,
	]
	if args.clear_designed_audios:
		targets.append(DESIGNED_AUDIO_DIR)

	total_removed = 0
	for target in targets:
		removed = clear_directory_contents(target)
		total_removed += removed
		print(f"Cleared {removed} item(s) from {rel(target)}")

	print(f"Done. Total removed: {total_removed} item(s)")


if __name__ == "__main__":
	main()


