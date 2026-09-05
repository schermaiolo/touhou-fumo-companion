# Adding Characters

Character assets are imported once into the canonical `assets/characters/` tree and then generated/synced into both editor integrations.

---

## Sprite sheet Layout

Spin-capable sheets currently use:

```text
0   idle / spin 0°
1   blink
2   unique animation A
3   unique animation B
4   spin 45°
5   spin 90°
6   spin 135°
7   spin 180°
8   spin 225°
9   spin 270°
10  spin 315°
```

The spin sequence is `0,4,5,6,7,8,9,10`. Characters without spin frames remain valid; spin/crazy-spin actions simply do nothing.

## Import Example

```bash
python tools/add_character.py \
  --id marisa \
  --name "Marisa Kirisame" \
  --source /absolute/path/to/marisa.png \
  --columns 11 \
  --idle-frames 0 \
  --blink-frames 1 \
  --special-frames 2,3 \
  --spin-frames 0,4,5,6,7,8,9,10 \
  --spin-frame-ms 90 \
  --spin-loops 3 \
  --motion-mode occasional-hop \
  --motion-strength 3 \
  --random-special on \
  --random-spin off
```

Use `--replace` when intentionally replacing an existing character. The importer creates local backups under `.local-backups/`, which is intentionally ignored by Git.

---

## Manual Messages

The default click/manual text lives in the canonical manifest as `manualText`. An empty user-configured manual message means the animation still runs but no bubble is shown.

Current standard defaults include:

- Youmu: `Myon!`
- Reimu: `Donate plz`
- Koishi: `Do you see me?`

---

## Validate After Import

```bash
python tools/sync_characters.py --check
python tools/generate_characters.py --check
./tools/validate_project.sh
```
