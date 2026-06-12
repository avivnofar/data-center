# CommandFlow / Terminal Academy

An interactive, multi-platform terminal simulator for practicing CLI syntax
and network-admin commands safely — nothing here touches a real system, all
output is pre-scripted and simulated.

## Origin

CommandFlow started as an externally-built design+code export
(**Stitch + Base44**, "Terminal Academy" — see
`agents/assets/incoming/commandflow/` for the original `code.html`,
`DESIGN.md`, and `screen.png`). This folder is the cleaned-up, **owned**
standalone version: no Base44/Stitch SDK, no login walls, no external
platform dependencies. It's part of the Data Center
[asset pipeline](../../agents/reports/asset-pipeline/board.json) — the first
asset to go `returned -> tested -> optimized -> implemented`.

## What it is

- A static, zero-build, vanilla HTML/CSS/JS page (`index.html`) — open it
  directly or serve the repo root with `python -m http.server`.
- A sidebar lets you pick a platform: **Bash, PowerShell, Cisco, Cloud (AWS
  CLI), Networking, Security, Databases**. Each has its own prompt and a set
  of simulated commands.
- A "Dashboard" landing view shows stats (platform/command counts) and links
  back to the main Data Center app.
- Type a command (or click a "Command Reference" chip to fill the input),
  press Enter / **Run**. Known commands print realistic simulated output;
  unknown input prints a platform-appropriate error (e.g.
  `bash: foo: command not found`). `help` lists every command for the
  current platform; `clear`/`cls` clears the screen.

## Files

- `index.html` — the standalone "Terminal Academy" UI (full Stitch design:
  glassmorphism, Inter + JetBrains Mono, dark terminal palette).
- `commandflow-core.js` — the **shared** simulation engine (`CommandFlow`
  global): loads `commands.json`, matches input to a command, and returns
  simulated output. Dependency-free, used by both this standalone page and
  CLI mode in the main app's `index.html`.
- `commands.json` — the command database. Add new platforms or commands here
  — no code changes needed. Each platform has a `prompt`, an `unknown`
  fallback message template (`{cmd}` is replaced with the typed command
  name), and a `commands` map (full-line or first-token keys -> `output`
  array of lines).

## Relation to CLI Mode

The main Data Center app's AI Search tab has a **CLI Mode**. It loads the
same `commandflow-core.js` + `commands.json` from this folder, so recognized
commands are simulated locally (instant, zero API cost) while anything else
falls through to Claude (`data-center-api`) for an AI-assisted answer. The
**look** differs on purpose:

- This standalone = full Stitch "Terminal Academy" design (its own identity).
- In-app CLI Mode = Data Center's terminal aesthetic (green-on-black,
  `C:\>` prompt). Same underlying logic, different skin.

## Adding platforms or commands

Edit `commands.json` only:

```jsonc
"newplatform": {
  "label_he": "...", "label_en": "...", "icon": "terminal",
  "prompt": "newplatform>",
  "unknown": "{cmd}: command not found",
  "commands": {
    "some command": { "output": ["line 1", "line 2"] }
  }
}
```

`help` and `clear`/`cls` are handled generically by `commandflow-core.js` for
every platform — don't add them to `commands`.
