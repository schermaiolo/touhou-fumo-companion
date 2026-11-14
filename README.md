# Touhou Fumo Companion

<p align="center">

[![Touhou Project](https://img.shields.io/badge/Touhou-Project-D0005E?style=for-the-badge)](https://en.touhouwiki.net/)
[![Fumo Companion](https://img.shields.io/badge/Fumo-Companion-8B5CF6?style=for-the-badge)](https://github.com/schermaiolo/touhou-fumo-companion)
[![Open Source](https://img.shields.io/badge/Open-Source-3DA639?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)

</p>

<p align="center">

[![VS Code Marketplace](https://img.shields.io/badge/VS_Code-Marketplace-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=schermaiolo.touhou-fumo-companion)
[![Open VSX Registry](https://img.shields.io/open-vsx/v/schermaiolo/touhou-fumo-companion?style=for-the-badge&label=Open%20VSX)](https://open-vsx.org/extension/schermaiolo/touhou-fumo-companion)
[![Pragtical Plugin](https://img.shields.io/badge/Pragtical-Official%20Plugin-5B5BD6?style=for-the-badge)](https://github.com/pragtical/plugins/pull/47)

</p>

Reactive Touhou fumo companions for **VS Code**, **Open VSX / Code-OSS compatible editors**, and **Pragtical**.

<p align="center">
  <img
    src="https://raw.githubusercontent.com/schermaiolo/touhou-fumo-companion/main/editors/vscode/images/spin-showcase.gif?v=2.0.0"
    alt="Touhou Fumo Spin"
  >
</p>

Animated fumos can react to editor events, spin, perform character-specific animations, and be configured independently.

- [VS Code documentation](editors/vscode/README.md)
- [Pragtical documentation](editors/pragtical/README.md)
- [Architecture](docs/architecture.md)

---

## New features — Grab, throw, and customize!

No new Fumo this time. Instead, the whole crew has learned a few new tricks.

- **VS Code: Throw your Fumos across the editor!** Grab and flick a Fumo from the Explorer or Bottom Panel, with gravity and bouncy landings. Optionally enable **Bounce inside the code editor** to send her flying through your code before she returns home.
- **Pragtical: Grab & throw too!** Drag a stage Fumo around the Pragtical window, flick to launch, and watch her bounce before returning home. Enabled by default on fresh installs, with ordinary click reactions still intact.
- **VS Code: A friendlier Settings page.** Customize everything in one place, with clear **Basics**, **Fumos**, **Movement**, **Reaction Rules**, and **Advanced** tabs — including a sprite preview for each Fumo. Changes are saved as you make them.

In VS Code, open **Touhou Fumo Companion: Open Settings → Movement → Grab & throw**. Both physics options start disabled. In Pragtical, **Grab & Throw** is enabled by default for new installations and can be disabled under **Settings → Plugins → Touhou Fumo Companion**.

**VS Code drag-and-throw demonstration:**

<p align="center">
  <img src="https://raw.githubusercontent.com/schermaiolo/touhou-fumo-companion/main/editors/vscode/images/drag-and-throw.gif" alt="Fumos bouncing through the VS Code editor" width="900">
</p>

**Pragtical grab-and-throw demonstration:**

<p align="center">
  <img src="https://raw.githubusercontent.com/schermaiolo/touhou-fumo-companion/main/editors/pragtical/images/pragtical-grab-and-throw.gif" alt="Dragging, throwing, and bouncing Fumos across the Pragtical window" width="900">
</p>

**New VS Code settings:**

| Movement | Individual Fumos |
| :---: | :---: |
| <img src="https://raw.githubusercontent.com/schermaiolo/touhou-fumo-companion/main/editors/vscode/images/settings-movement.png" alt="Movement settings" width="480"> | <img src="https://raw.githubusercontent.com/schermaiolo/touhou-fumo-companion/main/editors/vscode/images/settings-fumos.png" alt="Character settings and preview" width="480"> |

---

## Install

### Visual Studio Code

[![Install from Visual Studio Marketplace](https://img.shields.io/badge/Visual%20Studio%20Marketplace-Install-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=schermaiolo.touhou-fumo-companion)

Install **Touhou Fumo Companion** directly from the Visual Studio Marketplace.

### Open VSX / Code-OSS

[![Install from Open VSX](https://img.shields.io/badge/Open%20VSX-Install-C160EF?style=for-the-badge)](https://open-vsx.org/extension/schermaiolo/touhou-fumo-companion)

Install the extension from the **Open VSX Registry** for compatible editors using the Open VSX ecosystem.

### Pragtical

[![Pragtical Plugin](https://img.shields.io/badge/Pragtical-Plugin%20Manager-5B5BD6?style=for-the-badge)](https://github.com/pragtical/plugins)

Install **Touhou Fumo Companion** through the official Pragtical Plugin Manager:

```bash
ppm install touhou_fumo_companion
```

---

## Feedback and fumo requests

Bug reports, feedback, animation ideas, and **requests for new fumos** are welcome through GitHub Issues.

<p align="center">
  <img src="https://raw.githubusercontent.com/schermaiolo/touhou-fumo-companion/main/editors/vscode/images/vscode-writing-reactions.gif"
       alt="Writing reactions">
</p>

---

## Credits

Big thanks to **ZUN** for creating Touhou Project and its world.

Special thanks to **@Tim_M** ([itch.io](https://tim-m.itch.io/)) for the base fumo pack used as the starting point for this project, you can find them at https://fumofumos.com/.

So, starting from the base idle fumo: animation ideas, additional animation frames, and the rotation/spin views were created and edited manually by me, pixel by pixel. Building the animated turnaround sets was a long manual process.

Help on fixing them/adding new ones is always welcome!

![Hand-edited animation and rotation sheet](assets/characters/youmu/youmu-sheet.png)

---

## License

Source code and original documentation are released under the [MIT License](LICENSE). 

Touhou Fumo Companion is an unofficial fan project and is not affiliated with or endorsed by Team Shanghai Alice, ZUN, Gift, Visual Studio Code, Microsoft, or the Pragtical project.

The MIT license in this repository applies to the project source code and original documentation. It does **not** automatically grant rights to Touhou character names/designs, third-party trademarks, or artwork derived from third-party material.