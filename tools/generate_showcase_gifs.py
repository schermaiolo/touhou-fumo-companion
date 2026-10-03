#!/usr/bin/env python3
"""Generate the README showcase GIFs for Touhou Fumo Companion.

Release progression
-------------------
For each new fumo release:

* The main roster GIF contains the established spin-capable fumos.
* The newest fumo gets a dedicated GIF showing:
    1. frame 1 (idle)
    2. frame 2 (blink)
    3. frame 3 (special frame A)
    4. frame 4 (special frame B)
    5. three complete spins

Example for the Alice release:

    python tools/generate_showcase_gifs.py \
      --latest alice \
      --roster youmu koishi reimu mokou

The defaults intentionally mimic the dark editor-style showcase:
* background: #1d1f1f
* fumos slightly overlap in the roster
* nearest-neighbour rendering preserves pixel art
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

try:
    from PIL import Image
except ImportError as exc:
    raise SystemExit(
        "Pillow is required.\n"
        "Arch Linux: sudo pacman -S --needed python-pillow"
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "shared" / "characters" / "characters.json"
DEFAULT_IMAGE_DIR = ROOT / "editors" / "vscode" / "images"

# Matches the dark background used by the existing public showcase screenshot.
DEFAULT_BACKGROUND = "#1d1f1f"

# Native sprite pixels. The public showcase places the fumos close enough that
# their silhouettes overlap slightly, like the editor stage.
DEFAULT_OVERLAP = 18
DEFAULT_PADDING = 10


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """Recursively merge manifest defaults with a character override."""
    result = json.loads(json.dumps(base))
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def parse_hex_color(value: str) -> tuple[int, int, int, int]:
    """Parse RRGGBB / #RRGGBB into an opaque RGBA tuple."""
    text = value.strip().lstrip("#")
    if len(text) != 6:
        raise ValueError(
            f"invalid background color {value!r}; expected RRGGBB or #RRGGBB"
        )

    try:
        red = int(text[0:2], 16)
        green = int(text[2:4], 16)
        blue = int(text[4:6], 16)
    except ValueError as exc:
        raise ValueError(
            f"invalid background color {value!r}; expected hexadecimal RRGGBB"
        ) from exc

    return red, green, blue, 255


def load_manifest() -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))

    defaults = manifest.get("defaults", {})
    characters = manifest.get("characters", [])

    if not isinstance(defaults, dict):
        raise ValueError("manifest defaults must be an object")
    if not isinstance(characters, list) or not characters:
        raise ValueError("manifest contains no characters")

    by_id: dict[str, dict[str, Any]] = {}

    for character in characters:
        if not isinstance(character, dict):
            raise ValueError("manifest character entry is not an object")

        character_id = character.get("id")
        if not isinstance(character_id, str) or not character_id:
            raise ValueError("character without a valid id")

        if character_id in by_id:
            raise ValueError(f"duplicate character id: {character_id}")

        by_id[character_id] = character

    return defaults, by_id


def animation_for(
    defaults: dict[str, Any],
    character: dict[str, Any],
    animation_name: str,
) -> dict[str, Any]:
    """Return one animation with character values overriding defaults."""
    default_animations = defaults.get("animations", {})
    character_animations = character.get("animations", {})

    if not isinstance(default_animations, dict):
        default_animations = {}
    if not isinstance(character_animations, dict):
        character_animations = {}

    base = default_animations.get(animation_name, {})
    override = character_animations.get(animation_name, {})

    if not isinstance(base, dict):
        base = {}
    if not isinstance(override, dict):
        raise ValueError(
            f"{character['id']}: invalid {animation_name} animation"
        )

    return deep_merge(base, override)


def sheet_info(character: dict[str, Any]) -> tuple[Path, int, int]:
    """Return canonical sheet path, columns and rows."""
    character_id = character["id"]

    source = character.get("sourceSheet")
    if not isinstance(source, str) or not source:
        raise ValueError(f"{character_id}: missing sourceSheet")

    sprite_sheet = character.get("spriteSheet", {})
    if not isinstance(sprite_sheet, dict):
        raise ValueError(f"{character_id}: invalid spriteSheet")

    columns = sprite_sheet.get("columns")
    rows = sprite_sheet.get("rows", 1)

    if not isinstance(columns, int) or columns <= 0:
        raise ValueError(f"{character_id}: invalid spriteSheet.columns")
    if not isinstance(rows, int) or rows <= 0:
        raise ValueError(f"{character_id}: invalid spriteSheet.rows")

    path = ROOT / source
    if not path.is_file():
        raise ValueError(f"{character_id}: missing sheet: {path}")

    return path, columns, rows


def load_frames(character: dict[str, Any]) -> list[Image.Image]:
    """Slice the canonical sprite sheet into RGBA frames."""
    character_id = character["id"]
    path, columns, rows = sheet_info(character)

    with Image.open(path) as source:
        sheet = source.convert("RGBA")

    if sheet.width % columns != 0:
        raise ValueError(
            f"{character_id}: sheet width {sheet.width} "
            f"is not divisible by {columns}"
        )

    if sheet.height % rows != 0:
        raise ValueError(
            f"{character_id}: sheet height {sheet.height} "
            f"is not divisible by {rows}"
        )

    frame_width = sheet.width // columns
    frame_height = sheet.height // rows

    frames: list[Image.Image] = []

    for row in range(rows):
        for column in range(columns):
            left = column * frame_width
            top = row * frame_height

            frames.append(
                sheet.crop(
                    (
                        left,
                        top,
                        left + frame_width,
                        top + frame_height,
                    )
                )
            )

    return frames


def validate_indices(
    character_id: str,
    frames: list[Image.Image],
    indices: list[int],
) -> None:
    for index in indices:
        if (
            not isinstance(index, int)
            or isinstance(index, bool)
            or not 0 <= index < len(frames)
        ):
            raise ValueError(
                f"{character_id}: frame {index!r} outside "
                f"0..{len(frames) - 1}"
            )


def scale_nearest(image: Image.Image, factor: int) -> Image.Image:
    if factor == 1:
        return image

    return image.resize(
        (image.width * factor, image.height * factor),
        Image.Resampling.NEAREST,
    )


def place_on_background(
    sprite: Image.Image,
    background: tuple[int, int, int, int],
    padding: int,
) -> Image.Image:
    """Put one transparent sprite on the dark showcase background."""
    canvas = Image.new(
        "RGBA",
        (
            sprite.width + (padding * 2),
            sprite.height + (padding * 2),
        ),
        background,
    )
    canvas.alpha_composite(sprite, (padding, padding))
    return canvas


def save_gif(
    path: Path,
    frames: list[Image.Image],
    durations_ms: list[int],
) -> None:
    if not frames:
        raise ValueError("cannot save an empty GIF")
    if len(frames) != len(durations_ms):
        raise ValueError("GIF frame/duration count mismatch")

    path.parent.mkdir(parents=True, exist_ok=True)

    # Backgrounds are fully opaque, so GitHub/README theme cannot turn them white.
    frames[0].save(
        path,
        save_all=True,
        append_images=frames[1:],
        duration=durations_ms,
        loop=0,
        disposal=2,
        optimize=False,
    )


def build_latest_showcase(
    defaults: dict[str, Any],
    character: dict[str, Any],
    scale: int,
    background: tuple[int, int, int, int],
    padding: int,
) -> tuple[list[Image.Image], list[int]]:
    """Frames 1-4, followed by exactly three complete spins."""
    character_id = character["id"]
    source_frames = load_frames(character)

    if len(source_frames) < 4:
        raise ValueError(
            f"{character_id}: latest showcase requires at least four frames"
        )

    idle = animation_for(defaults, character, "idle")
    blink = animation_for(defaults, character, "blink")
    special = animation_for(defaults, character, "special")
    spin = animation_for(defaults, character, "spin")

    spin_indices = spin.get("frames", [])
    if not isinstance(spin_indices, list) or not spin_indices:
        raise ValueError(
            f"{character_id}: latest showcase requires a spin animation"
        )

    # The release showcase intentionally always starts with physical source
    # frames 1,2,3,4, irrespective of animation metadata aliases.
    opening_indices = [0, 1, 2, 3]

    validate_indices(character_id, source_frames, opening_indices)
    validate_indices(character_id, source_frames, spin_indices)

    idle_ms = max(1, int(idle.get("frameDurationMs", 650)))
    blink_ms = max(1, int(blink.get("frameDurationMs", 170)))
    special_ms = max(1, int(special.get("frameDurationMs", 250)))
    special_hold_ms = max(0, int(special.get("holdLastFrameMs", 0)))
    spin_ms = max(1, int(spin.get("frameDurationMs", 90)))

    indices: list[int] = opening_indices.copy()
    durations: list[int] = [
        idle_ms,
        blink_ms,
        special_ms,
        special_ms + special_hold_ms,
    ]

    # Exactly three spins, by design, even if runtime metadata later changes
    # the number of loops used in the editor.
    for _ in range(3):
        indices.extend(spin_indices)
        durations.extend([spin_ms] * len(spin_indices))

    # Return to idle briefly before the GIF loops.
    indices.append(0)
    durations.append(min(max(idle_ms, 500), 1000))

    output_frames = [
        scale_nearest(
            place_on_background(
                source_frames[index],
                background,
                padding,
            ),
            scale,
        )
        for index in indices
    ]

    return output_frames, durations


def build_roster_showcase(
    defaults: dict[str, Any],
    characters: list[dict[str, Any]],
    scale: int,
    background: tuple[int, int, int, int],
    overlap: int,
    padding: int,
    loops: int,
) -> tuple[list[Image.Image], list[int]]:
    """Composite established fumos side-by-side with slight overlap."""
    loaded: list[
        tuple[dict[str, Any], list[Image.Image], dict[str, Any]]
    ] = []

    for character in characters:
        frames = load_frames(character)
        spin = animation_for(defaults, character, "spin")
        spin_indices = spin.get("frames", [])

        if not isinstance(spin_indices, list) or not spin_indices:
            raise ValueError(
                f"{character['id']}: roster showcase requires spin frames"
            )

        validate_indices(character["id"], frames, spin_indices)
        loaded.append((character, frames, spin))

    if not loaded:
        raise ValueError("roster cannot be empty")

    # We advance by each fumo's width minus overlap. Later fumos are composited
    # after earlier ones, so they naturally sit slightly in front where sprites
    # touch, matching the crowded editor-stage look.
    advances: list[int] = []

    for _character, frames, _spin in loaded[:-1]:
        advances.append(max(1, frames[0].width - overlap))

    content_width = (
        sum(advances)
        + loaded[-1][1][0].width
    )
    content_height = max(frames[0].height for _, frames, _ in loaded)

    canvas_width = content_width + (padding * 2)
    canvas_height = content_height + (padding * 2)

    max_phases = max(len(spin["frames"]) for _, _, spin in loaded)

    output_frames: list[Image.Image] = []
    durations: list[int] = []

    for _ in range(loops):
        for phase in range(max_phases):
            canvas = Image.new(
                "RGBA",
                (canvas_width, canvas_height),
                background,
            )

            x = padding
            phase_durations: list[int] = []

            for item_index, (_character, frames, spin) in enumerate(loaded):
                spin_indices: list[int] = spin["frames"]
                frame_index = spin_indices[phase % len(spin_indices)]
                frame = frames[frame_index]

                # Bottom-align characters just like stage sprites standing on
                # the same baseline.
                y = padding + (content_height - frame.height)
                canvas.alpha_composite(frame, (x, y))

                phase_durations.append(
                    max(1, int(spin.get("frameDurationMs", 90)))
                )

                if item_index < len(loaded) - 1:
                    x += max(1, frame.width - overlap)

            output_frames.append(scale_nearest(canvas, scale))
            durations.append(max(phase_durations))

    # End on the normal front-facing roster before looping.
    idle_canvas = Image.new(
        "RGBA",
        (canvas_width, canvas_height),
        background,
    )

    x = padding
    for item_index, (_character, frames, _spin) in enumerate(loaded):
        frame = frames[0]
        y = padding + (content_height - frame.height)
        idle_canvas.alpha_composite(frame, (x, y))

        if item_index < len(loaded) - 1:
            x += max(1, frame.width - overlap)

    output_frames.append(scale_nearest(idle_canvas, scale))
    durations.append(500)

    return output_frames, durations


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Generate the main roster GIF and latest-fumo GIF "
            "from shared/characters/characters.json."
        )
    )

    parser.add_argument(
        "--latest",
        required=True,
        help="newest fumo ID, e.g. alice",
    )
    parser.add_argument(
        "--roster",
        nargs="+",
        required=True,
        help="established fumo IDs shown in the main spin GIF",
    )
    parser.add_argument(
        "--background",
        default=DEFAULT_BACKGROUND,
        help=(
            "opaque GIF background as RRGGBB/#RRGGBB "
            f"(default: {DEFAULT_BACKGROUND})"
        ),
    )
    parser.add_argument(
        "--overlap",
        type=int,
        default=DEFAULT_OVERLAP,
        help=(
            "native-pixel overlap between adjacent roster fumos "
            f"(default: {DEFAULT_OVERLAP})"
        ),
    )
    parser.add_argument(
        "--padding",
        type=int,
        default=DEFAULT_PADDING,
        help=(
            "native-pixel padding around GIF contents "
            f"(default: {DEFAULT_PADDING})"
        ),
    )
    parser.add_argument(
        "--scale",
        type=int,
        default=1,
        help="nearest-neighbour output scale (default: 1)",
    )
    parser.add_argument(
        "--roster-loops",
        type=int,
        default=3,
        help="number of main-roster spins (default: 3)",
    )
    parser.add_argument(
        "--latest-output",
        help=(
            "override newest-fumo output path; default is "
            "editors/vscode/images/<latest>.gif"
        ),
    )
    parser.add_argument(
        "--roster-output",
        default="editors/vscode/images/spin-showcase.gif",
        help=(
            "main roster output path "
            "(default: editors/vscode/images/spin-showcase.gif)"
        ),
    )

    args = parser.parse_args()

    if args.scale <= 0:
        raise SystemExit("--scale must be > 0")
    if args.overlap < 0:
        raise SystemExit("--overlap must be >= 0")
    if args.padding < 0:
        raise SystemExit("--padding must be >= 0")
    if args.roster_loops <= 0:
        raise SystemExit("--roster-loops must be > 0")

    try:
        background = parse_hex_color(args.background)
        defaults, by_id = load_manifest()
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise SystemExit(str(exc)) from exc

    if args.latest not in by_id:
        raise SystemExit(f"unknown latest fumo: {args.latest}")

    missing_roster = [
        character_id
        for character_id in args.roster
        if character_id not in by_id
    ]
    if missing_roster:
        raise SystemExit(
            "unknown roster fumo(s): " + ", ".join(missing_roster)
        )

    latest_output = (
        ROOT / args.latest_output
        if args.latest_output
        else DEFAULT_IMAGE_DIR / f"{args.latest}.gif"
    )
    roster_output = ROOT / args.roster_output

    try:
        latest_frames, latest_durations = build_latest_showcase(
            defaults=defaults,
            character=by_id[args.latest],
            scale=args.scale,
            background=background,
            padding=args.padding,
        )

        roster_frames, roster_durations = build_roster_showcase(
            defaults=defaults,
            characters=[by_id[cid] for cid in args.roster],
            scale=args.scale,
            background=background,
            overlap=args.overlap,
            padding=args.padding,
            loops=args.roster_loops,
        )

        save_gif(
            latest_output,
            latest_frames,
            latest_durations,
        )
        save_gif(
            roster_output,
            roster_frames,
            roster_durations,
        )
    except (OSError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc

    print(
        f"WROTE {latest_output.relative_to(ROOT)} "
        f"({len(latest_frames)} frames)"
    )
    print(
        f"WROTE {roster_output.relative_to(ROOT)} "
        f"({len(roster_frames)} frames)"
    )
    print(f"BACKGROUND {args.background}")
    print(f"ROSTER OVERLAP {args.overlap}px")
    print(f"PADDING {args.padding}px")
    print(f"SCALE {args.scale}x")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
