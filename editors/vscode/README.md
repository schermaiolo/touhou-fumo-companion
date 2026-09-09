# Touhou Fumo Companion — VS Code

Reactive Touhou fumo companions for VS Code, with character-specific animations, editor reactions, configurable behavior, and multiple display surfaces.

Feedback, bug reports, animation ideas, and **requests for new fumos are welcome**.

<p align="center">
  <img src="https://raw.githubusercontent.com/schermaiolo/touhou-fumo-companion/main/editors/vscode/images/spin-showcase.gif"
       alt="Touhou Fumo VS Code">
</p>

---

## New Fumo Section: Fujiwara no Mokou

The immortal joins the stage.

<p align="center">
  <img
    src="https://raw.githubusercontent.com/schermaiolo/touhou-fumo-companion/main/editors/vscode/images/mokou.gif"
    alt="Fujiwara no Mokou"
  >
</p>

---

## Features

- Multiple independently configurable Touhou fumos.
- Explorer sidebar stage.
- Integrated bottom-panel stage.
- Large Coding Session below the source editor.
- Small Editor Pet near the active line.
- Click/manual reactions with per-character messages.
- Typing, newline, save, build, debug, exact-text, and custom reaction rules.
- Blink, software movement (hops), unique animations, normal spin, and crazy spin.
- Priority presets so manual/editor reactions win over lower-priority random behavior.
- Characters without optional spin frames are handled safely and simply do not spin.

---

## Current characters

- Youmu Konpaku
- Koishi Komeiji
- Reimu Hakurei
- Seija Kijin — no spin
- Sanae Kochiya — no spin
- Reimu Hakurei — Lost Word — no spin

Default manual messages include:

- Youmu — `Myon!`
- Reimu — `Donate plz`
- Koishi — `Do you see me?`

Leave a character's manual message empty to keep the animation while suppressing the speech bubble.

---

## Fumo showcase

These are only some of the available animations and behaviors.

### Crazy spin

<p align="center">
  <img src="https://raw.githubusercontent.com/schermaiolo/touhou-fumo-companion/main/editors/vscode/images/crazy-spin.gif"
       alt="Crazy spin">
</p>

### Editor Pet

<p align="center">
  <img src="https://raw.githubusercontent.com/schermaiolo/touhou-fumo-companion/main/editors/vscode/images/vscode-editor-pet.gif"
       alt="Editor Pet">
</p>

### Click reactions

<p align="center">
  <img src="https://raw.githubusercontent.com/schermaiolo/touhou-fumo-companion/main/editors/vscode/images/vscode-click-reactions.gif"
       alt="Click reactions">
</p>

### Writing reactions

<p align="center">
  <img src="https://raw.githubusercontent.com/schermaiolo/touhou-fumo-companion/main/editors/vscode/images/vscode-writing-reactions.gif"
       alt="Writing reactions">
</p>

---

## Commands

The following commands are available:

- **Touhou Fumo Companion: React Selected Fumo**
- **Touhou Fumo Companion: Spin Selected Fumo**
- **Touhou Fumo Companion: Crazy Spin Selected Fumo**
- **Touhou Fumo Companion: Open Settings**
- **Touhou Fumo Companion: Start Coding Session**
- **Touhou Fumo Companion: Close Coding Session**
- **Touhou Fumo Companion: Move Coding Session Below**
- **Touhou Fumo Companion: Run Custom Reaction 1–4**

The Explorer and Bottom Panel title buttons expose the same React, Spin, Crazy Spin, and Settings actions.

---

## Settings

General defaults cover size, idle movement, random unique animations, random spin, crazy spin, and animation priority.

The **Selected Character** section lets each fumo override those defaults, including its enabled state and manual message.

Reaction Rules provide reusable event/action slots that can target all enabled fumos, one character, or a random enabled character.

---

## Feedback and fumo requests

Bug reports, feedback, animation ideas, and **requests for new fumos** are welcome through GitHub Issues.

If you create or improve animation frames, contributions are welcome as well.

---

## Credits

Big thanks to **ZUN** for creating Touhou Project and its world.

Special thanks to **Tim_M** ([itch.io](https://tim-m.itch.io/)) for the base fumo sprite pack used as the starting point for this project. You can find the original collection at [fumofumos.com](https://fumofumos.com/).

Animation ideas, additional animation frames, and the rotation/spin views used by this project were created and edited manually by me, pixel by pixel. Building the animated turnaround sets was a long manual process.

Help with improving existing sprites and adding new fumos is always welcome.

---

## License

Source code and original documentation are released under the [MIT License](LICENSE).

Touhou Fumo Companion is an unofficial fan project and is not affiliated with or endorsed by Team Shanghai Alice, ZUN, Gift, Visual Studio Code, Microsoft, or the Pragtical project.

The MIT License in this repository applies to the project source code and original documentation. It does **not** automatically grant rights to Touhou character names/designs, third-party trademarks, or artwork derived from third-party material.