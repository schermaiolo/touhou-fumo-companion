# Touhou Fumo Companion — Pragtical

Reactive Touhou fumo companions for Pragtical, with native settings, stage animations, editor reactions, and a small cursor-following Editor Pet.

Feedback, bug reports, animation ideas, and **requests for new fumos are welcome**.

<p align="center">
  <img src="https://raw.githubusercontent.com/schermaiolo/touhou-fumo-companion/main/editors/vscode/images/spin-showcase.gif"
       alt="Touhou Fumo VS Code">
</p>

---

## Features

- Multiple enabled characters on the stage.
- Optional small Editor Pet near the active cursor/line.
- Per-character size and behavior settings.
- Click/manual reactions with configurable messages.
- Typing, newline, save, exact-text, and custom reaction rules that can be added to generate specific behavior from the fumo.
- Unique animations, normal spin, crazy spin, blink, and software movement (hops).
- Priority presets for competing animations.
- Spin-capable and non-spin characters can coexist safely.

---

## Current characters

- Youmu Konpaku
- Koishi Komeiji
- Reimu Hakurei
- Seija Kijin
- Sanae Kochiya
- Reimu Hakurei — Lost Word

Default manual messages include:

- Youmu — `Myon!`
- Reimu — `Donate plz`
- Koishi — `Do you see me?`

An empty manual message keeps the animation but suppresses the bubble.

---

## Fumo showcase (not all animations)

### Crazy Spin

<p align="center">
  <img src="https://raw.githubusercontent.com/schermaiolo/touhou-fumo-companion/main/editors/pragtical/images/pragtical-crazy-spin.gif"
       alt="Crazy spin">
</p>


### Editor Pet

<p align="center">
  <img src="https://raw.githubusercontent.com/schermaiolo/touhou-fumo-companion/main/editors/pragtical/images/pragtical-editor-pet.gif"
       alt="Fumo editor pet">
</p>


### Click reactions

<p align="center">
  <img src="https://raw.githubusercontent.com/schermaiolo/touhou-fumo-companion/main/editors/pragtical/images/pragtical-click-reactions.gif"
       alt="Fumo click reactions">
</p>

---

## Installation for development

From the repository root:

```bash
mkdir -p ~/.config/pragtical/plugins/touhou_fumo

rsync -avc --delete \
  editors/pragtical/ \
  ~/.config/pragtical/plugins/touhou_fumo/
```

Restart Pragtical completely after modifying the plugin.

---

## Settings

Open:

```text
Settings → Plugins → Touhou Fumo Companion
```

The settings page exposes general defaults, a selected-character configuration proxy, Editor Pet controls, and reusable reaction-rule slots.

---

## Commands

Release-facing Pragtical commands include:

- `touhou-fumo:toggle`
- `touhou-fumo:react`
- `touhou-fumo:spin`
- `touhou-fumo:crazy-spin`
- `touhou-fumo:custom-reaction-1`
- `touhou-fumo:custom-reaction-2`
- `touhou-fumo:custom-reaction-3`
- `touhou-fumo:custom-reaction-4`

---

## Feedback and fumo requests

Bug reports, feedback, animation ideas, and **requests for new fumos** are welcome through GitHub Issues

---

## Credits

Naturally, big thanks for ZUN for creating Gensokyo and Touhou universe.

Special thanks to **@Tim_M** (I didn't find him on git, but here https://tim-m.itch.io/)for the base fumo pack used as the starting point for this project, you can find them at https://fumofumos.com/.

Animation ideas, additional animation frames, and the rotation/spin views were created and edited manually by me, pixel by pixel. Building the animated turnaround sets was a long manual process.

Help on fixing them/adding new ones is always welcome!

---

## Runtime note

`RootView:draw()` is wrapped exactly once during plugin load. Commands never reinstall the draw hook. Mouse hit-testing and the Editor Pet reuse the same plugin-owned runtime state.

---

## Architecture

See the repository-level [Architecture](../../docs/architecture.md).

---

## License

Source code and original documentation are released under the [MIT License](LICENSE). 

Touhou Fumo Companion is an unofficial fan project and is not affiliated with or endorsed by Team Shanghai Alice, ZUN, Gift, Visual Studio Code, Microsoft, or the Pragtical project.

The MIT license in this repository applies to the project source code and original documentation. It does **not** automatically grant rights to Touhou character names/designs, third-party trademarks, or artwork derived from third-party material.
