# Architecture

This page gives a high-level technical overview of Touhou Fumo Companion and the shared data flow used by both editor integrations.

## High-Level View

```text
assets/characters/
        │
        │ canonical sprite sheets
        ▼
shared/characters/characters.json
        │
        ├── tools/sync_characters.py
        │      ├── VS Code media/ + split frames
        │      └── Pragtical assets/
        │
        └── tools/generate_characters.py
               ├── generated/characters.ts
               ├── generated/characters.lua
               └── generated VS Code settings

VS Code / Code-OSS                   Pragtical
──────────────────                   ─────────
extension.ts                         init.lua
    │                                    │
    ├── CharacterSettingsController      ├── config proxy/settings
    ├── ReactionRulesController          ├── reaction rules
    ├── Explorer/Bottom stages           ├── priority state machine
    ├── Coding Session                   ├── animation thread
    └── Editor Pet                       ├── one RootView:draw wrapper
                                         └── mouse hit-testing/editor pet
```

The manifest is the canonical source for character metadata. Generated editor files should not be edited by hand.

---

## Project Structure

```text
.
├── assets/characters/             Canonical sprite sheets and source art
├── shared/characters/             Canonical character manifest
├── editors/
│   ├── vscode/                    VS Code / Code-OSS extension
│   └── pragtical/     Pragtical plugin
├── tools/
│   ├── add_character.py           Import/update one character
│   ├── sync_characters.py         Validate/copy sheets and split frames
│   ├── generate_characters.py     Generate TS/Lua/settings metadata
│   └── validate_project.sh        Pre-release static validation
├── docs/                          Project documentation
└── README.md                      Minimal project entry point
```

---

## Character Runtime

A character definition contains the render size, sprite-sheet geometry, animation frames, optional spin sequence, random-behavior timing, and the default manual message.

Both editor integrations resolve those definitions into runtime pets and use the same conceptual animation priority model. The standard preset is:

```text
Manual > Editor Reaction > Crazy Spin > Spin > Unique Animation > Blink
```

Higher-priority actions may preempt lower-priority actions. Random actions are intentionally discarded/rescheduled instead of building an animation backlog. Software bob/hop movement is independent from sprite-frame animation.

---

## VS Code Surfaces

The extension exposes several surfaces backed by the same character data:

- **Explorer Stage** — webview view in the Explorer sidebar.
- **Bottom Panel Stage** — integrated panel view using the same modern stage runtime.
- **Coding Session** — a large webview editor below the source editor, also using the modern stage runtime.
- **Editor Pet** — a small decoration-based character near the active line.

`explorerPetsHtml.ts` owns the shared webview state machine used by the stage surfaces. `explorerPets.ts` translates generated character metadata and effective user settings into the serializable definitions consumed by that webview.

---

## Pragtical Integration

Pragtical keeps the plugin in one `init.lua` because its native plugin/configuration APIs are compact and the runtime is tightly coupled to RootView/DocView hooks. The file is separated into explicit sections for configuration, state, reactions, drawing, mouse input, and commands.

A critical constraint is that `RootView:draw()` is wrapped **exactly once during plugin load**. Commands must never reinstall that hook. Mouse input is handled independently through `RootView:on_mouse_pressed`.

---

## Generated vs. Hand-Written Files

Do not manually edit:

- `editors/vscode/src/generated/characters.ts`
- `editors/pragtical/generated/characters.lua`
- generated character/settings sections in `editors/vscode/package.json`
- synced copies below the editor asset directories

Change the canonical manifest/assets and rerun the tools instead.
