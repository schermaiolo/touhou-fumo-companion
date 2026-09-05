#!/usr/bin/env python3
"""@file sync_characters.py
@brief Validate and synchronize sprite assets into both editors.

Platform : Python 3 repository tooling
Author   : Daniel Fridman (schermaiolo)

Source sheets remain under assets/characters. Editor copies, frame splits and
asset manifests are deterministic outputs produced from that input.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path
from typing import Any

try:
    from PIL import Image
except ImportError as exc:
    raise SystemExit(
        "Install Pillow first:\n"
        "  sudo pacman -S --needed python-pillow"
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "shared" / "characters" / "characters.json"

DESTINATIONS = {
    "vscode": ROOT / "editors" / "vscode" / "media",
    "pragtical": (
        ROOT
        / "editors"
        / "pragtical"
        / "assets"
    ),
}

ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


def repository_path(path_text: str, label: str) -> Path:
    """Resolve a path while preventing escape from the repository."""

    if not isinstance(path_text, str) or not path_text:
        raise ValueError(f"{label} must be a non-empty string")

    requested = Path(path_text)

    if requested.is_absolute():
        raise ValueError(f"{label} must be repository-relative")

    resolved = (ROOT / requested).resolve()

    try:
        resolved.relative_to(ROOT.resolve())
    except ValueError as exc:
        raise ValueError(
            f"{label} escapes the repository: {path_text}"
        ) from exc

    return resolved


def safe_asset_path(value: Any, label: str) -> str:
    """Validate a path stored below an editor asset directory."""

    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be a non-empty string")

    path = Path(value)

    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"{label} must be a safe relative path")

    return value


def merge_section(
    defaults: dict[str, Any],
    character: dict[str, Any],
    section: str,
) -> dict[str, Any]:
    """Apply character-level overrides to one defaults section."""

    result = dict(defaults.get(section, {}))
    override = character.get(section, {})

    if not isinstance(override, dict):
        raise ValueError(f"{character.get('id')}.{section} must be an object")

    result.update(override)
    return result


# Load and validate the canonical manifest before touching editor-local assets.
def load_specs() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Load and validate the manifest and inspect source images."""

    if not MANIFEST.is_file():
        raise ValueError(f"manifest not found: {MANIFEST}")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))

    if not isinstance(manifest, dict):
        raise ValueError("manifest root must be an object")

    if manifest.get("schemaVersion") != 1:
        raise ValueError("schemaVersion must be 1")

    defaults = manifest.get("defaults", {})

    if not isinstance(defaults, dict):
        raise ValueError("defaults must be an object")

    characters = manifest.get("characters")

    if not isinstance(characters, list) or not characters:
        raise ValueError("characters must be a non-empty array")

    specifications: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    seen_asset_directories: set[str] = set()

    for character in characters:
        if not isinstance(character, dict):
            raise ValueError("every character must be an object")

        character_id = character.get("id")

        if (
            not isinstance(character_id, str)
            or not ID_PATTERN.fullmatch(character_id)
        ):
            raise ValueError(f"invalid character id: {character_id!r}")

        if character_id in seen_ids:
            raise ValueError(f"duplicate character id: {character_id}")

        seen_ids.add(character_id)

        source = repository_path(
            character.get("sourceSheet"),
            f"{character_id}.sourceSheet",
        )

        if not source.is_file():
            raise ValueError(
                f"missing source sheet for {character_id}: {source}"
            )

        assets = character.get("assets")

        if not isinstance(assets, dict):
            raise ValueError(f"{character_id}.assets must be an object")

        asset_directory = safe_asset_path(
            assets.get("directory"),
            f"{character_id}.assets.directory",
        )
        sheet_filename = safe_asset_path(
            assets.get("sheet"),
            f"{character_id}.assets.sheet",
        )
        frames_directory = safe_asset_path(
            assets.get("framesDirectory", "frames"),
            f"{character_id}.assets.framesDirectory",
        )

        if asset_directory in seen_asset_directories:
            raise ValueError(
                f"duplicate asset directory: {asset_directory}"
            )

        seen_asset_directories.add(asset_directory)

        sprite_sheet = merge_section(
            defaults,
            character,
            "spriteSheet",
        )

        if sprite_sheet.get("layout") != "grid":
            raise ValueError(
                f"{character_id}: only grid layout is currently supported"
            )

        columns = sprite_sheet.get("columns")
        rows = sprite_sheet.get("rows")

        for value, label in (
            (columns, "columns"),
            (rows, "rows"),
        ):
            if (
                not isinstance(value, int)
                or isinstance(value, bool)
                or value <= 0
            ):
                raise ValueError(
                    f"{character_id}.{label} must be a positive integer"
                )

        with Image.open(source) as image:
            width, height = image.size
            image.verify()

        if width % columns != 0 or height % rows != 0:
            raise ValueError(
                f"{character_id}: sheet {width}x{height} is not "
                f"divisible by grid {columns}x{rows}"
            )

        frame_width = width // columns
        frame_height = height // rows
        frame_count = columns * rows

        animations = merge_section(
            defaults,
            character,
            "animations",
        )

        if not animations:
            raise ValueError(
                f"{character_id}.animations must not be empty"
            )

        for animation_name, animation in animations.items():
            if not isinstance(animation, dict):
                raise ValueError(
                    f"{character_id}.{animation_name} must be an object"
                )

            frames = animation.get("frames")

            if not isinstance(frames, list) or not frames:
                raise ValueError(
                    f"{character_id}.{animation_name}.frames "
                    "must be a non-empty array"
                )

            for frame in frames:
                if (
                    not isinstance(frame, int)
                    or isinstance(frame, bool)
                    or not 0 <= frame < frame_count
                ):
                    raise ValueError(
                        f"{character_id}.{animation_name} references "
                        f"invalid frame {frame}; valid range is "
                        f"0..{frame_count - 1}"
                    )

        specifications.append(
            {
                "id": character_id,
                "source": source,
                "assetDirectory": asset_directory,
                "sheetFilename": sheet_filename,
                "framesDirectory": frames_directory,
                "columns": columns,
                "rows": rows,
                "frameWidth": frame_width,
                "frameHeight": frame_height,
                "frameCount": frame_count,
                "sheetWidth": width,
                "sheetHeight": height,
            }
        )

    return manifest, specifications


# Split a horizontal sprite sheet into per-frame PNGs required by VS Code decorations.
def split_sheet(specification: dict[str, Any], output: Path) -> None:
    """Split one source sheet in row-major order."""

    frames_directory = (
        output / specification["framesDirectory"]
    )
    frames_directory.mkdir(parents=True, exist_ok=True)

    with Image.open(specification["source"]) as image:
        image.load()

        frame_index = 0

        for row in range(specification["rows"]):
            for column in range(specification["columns"]):
                left = column * specification["frameWidth"]
                top = row * specification["frameHeight"]

                frame = image.crop(
                    (
                        left,
                        top,
                        left + specification["frameWidth"],
                        top + specification["frameHeight"],
                    )
                )

                frame.save(
                    frames_directory
                    / f"frame-{frame_index:02d}.png",
                    format="PNG",
                )

                frame_index += 1


# Copy one canonical sheet/manifest entry into both editor asset layouts.
def sync_character(
    specification: dict[str, Any],
    destination: Path,
) -> None:
    """Build a character directory and replace the old one."""

    target = destination / specification["assetDirectory"]
    temporary = (
        destination
        / f'.{specification["assetDirectory"]}.sync-tmp'
    )

    shutil.rmtree(temporary, ignore_errors=True)
    temporary.mkdir(parents=True, exist_ok=True)

    shutil.copy2(
        specification["source"],
        temporary / specification["sheetFilename"],
    )

    split_sheet(specification, temporary)

    shutil.rmtree(target, ignore_errors=True)
    temporary.rename(target)


# In --check mode compare expected outputs; in --sync mode rewrite them deterministically.
def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Validate or sync Touhou Fumo character assets."
        )
    )

    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument(
        "--check",
        action="store_true",
        help="validate the manifest and source sheets",
    )
    actions.add_argument(
        "--dry-run",
        action="store_true",
        help="show which generated directories would be replaced",
    )
    actions.add_argument(
        "--sync",
        action="store_true",
        help="copy sheets and regenerate split frames",
    )

    arguments = parser.parse_args()

    try:
        _, specifications = load_specs()

        for specification in specifications:
            print(
                f'OK  {specification["id"]:<18} '
                f'sheet={specification["sheetWidth"]}x'
                f'{specification["sheetHeight"]} '
                f'frame={specification["frameWidth"]}x'
                f'{specification["frameHeight"]} '
                f'frames={specification["frameCount"]}'
            )

        if arguments.check:
            print(
                f"Validated {len(specifications)} character(s); "
                "no files changed."
            )
            return 0

        if arguments.dry_run:
            for editor, destination in DESTINATIONS.items():
                for specification in specifications:
                    target = (
                        destination
                        / specification["assetDirectory"]
                    )

                    print(
                        f"WOULD REPLACE {editor:<9} "
                        f"{target.relative_to(ROOT)}"
                    )

                manifest_target = destination / "characters.json"

                print(
                    f"WOULD COPY    {editor:<9} "
                    f"{manifest_target.relative_to(ROOT)}"
                )

            print("Dry run complete; no files changed.")
            return 0

        for editor, destination in DESTINATIONS.items():
            destination.mkdir(parents=True, exist_ok=True)

            for specification in specifications:
                sync_character(specification, destination)
                print(
                    f'SYNC {editor:<9} '
                    f'{specification["id"]}'
                )

            shutil.copy2(
                MANIFEST,
                destination / "characters.json",
            )

            print(f"SYNC {editor:<9} characters.json")

        print(
            f"Synced {len(specifications)} character(s) "
            "into both editors."
        )
        return 0

    except (
        KeyError,
        OSError,
        TypeError,
        ValueError,
        json.JSONDecodeError,
    ) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
