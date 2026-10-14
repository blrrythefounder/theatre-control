# 🎭 Theatre Control

Browser-based show control for small theatre. Run video cues, credits slides, rolling credits and credits music on a projector from one laptop — no install, no internet, no server. Open `index.html` in Chrome or Edge and go.

![Theatre Control panel with the Newspaper cue playing](docs/screenshot.png)

## Features

- **Video cues** — any number of cues, each with its own video, hotkey, volume, scale and end behaviour (return to black, loop, or freeze on the last frame). Ships with *Newspaper* (Space) and *Flashback* cues.
- **Live status** — progress bar, elapsed / total / remaining time for the playing cue, and a show bar that always says what's on the projector.
- **Fades** — configurable fade in/out for video (picture *and* sound), credits and blackout. Set to 0 for hard cuts.
- **Blackout** — one key (`B`) fades the whole projector to black over anything that's playing.
- **Credits slides** — Names, Title and Blank slides with colour, background and font-size options; a to-scale 16:9 preview; long name lists shrink automatically to fit.
- **Rolling credits** — scroll every slide up the screen like a film crawl, with adjustable speed and optional music start/fade.
- **Credits music** — play / pause / stop with a timed fade-out, loop and volume.
- **Autosave** — cues, hotkeys, slides and settings survive a page reload or crash.
- **Show files** — save/load your whole show (or just credits) as JSON to move between computers.
- **Keyboard-first** — hotkeys work from either window, are ignored while typing, and presentation clickers (PgUp/PgDn) step through credits.

## Quick start

1. **Download** — click **Code → Download ZIP** on GitHub and unzip it (or `git clone`).
2. **Open** `index.html` in **Chrome** or **Edge** (double-click it).
3. Click **Open Projector**. If the browser blocks the pop-up, allow pop-ups for the page and click again.
4. Drag the projector window onto the projector screen and **double-click it** (or press `F`) to go fullscreen.
5. On the **Video Cues** tab, open a cue's ⚙ settings and choose its video file.
6. Press the cue's hotkey (default **Space** for *Newspaper*) — or click its ▶ button — to play. Press again to stop.

> **Tip:** set your laptop display to *Extend* (not *Mirror*) so the control page stays on your screen and only the projector window shows on the projector.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Cue hotkey | Play / stop that cue (default `Space` = Newspaper) |
| `Esc` | Stop all video |
| `B` | Blackout on / off |
| `C` | Show / hide credits |
| `→` `↓` `PgDn` | Next credits slide |
| `←` `↑` `PgUp` | Previous credits slide |
| `?` | Shortcut help |
| `F` / double-click | Fullscreen (in the projector window) |

Shortcuts pause while you're typing in a text box. They also work when the projector window has focus. Holding a key down never re-triggers a cue.

## Using it on show day

See **[docs/SHOW-DAY-CHECKLIST.md](docs/SHOW-DAY-CHECKLIST.md)** for a printable pre-show checklist.

**Important:** browsers don't let a web page reopen files from your disk by itself, so **video and music files must be re-selected every time you open the page**. Everything else is remembered. Cues whose file needs re-selecting show an amber ⚠ with the exact file name.

Keep all your show media in one folder next to the app so it's quick to pick them again.

## Credits files

Credits are saved as JSON. You can write or edit them by hand — see [`examples/credits.example.json`](examples/credits.example.json).

```json
{
  "version": 1,
  "slides": [
    { "type": "title", "bigTitle": "The Cast", "subtitle": "in order of appearance" },
    { "type": "names", "sectionTitle": "Directed by", "names": ["Riley Brennan"], "color": "gold", "fontSize": "large" },
    { "type": "blank" }
  ]
}
```

| Field | Values |
| --- | --- |
| `type` | `names`, `title`, `blank` |
| `color` | `white`, `gold`, `cream`, `red` |
| `bg` | `black`, `dark`, `navy` |
| `fontSize` | `small`, `medium`, `large`, `xlarge` |

Files saved by the original v2 (`credits.json`) load unchanged.

## Browser support

Built and tested for **Chrome and Edge** (desktop). Firefox should work. Safari is not recommended for shows (stricter pop-up and autoplay rules).

Video formats are whatever the browser supports — **MP4 (H.264/AAC)** and **WebM** are the safe choices. If a video won't play, re-export it as H.264 MP4.

## How it works

The control page opens a blank pop-up and writes the projector page into it. Because both windows share an origin, the control page can call functions in the projector directly and hand it local video files as `blob:` URLs — which is what makes it work from `file://` with no server.

For a full breakdown of the code, the data model, the projector protocol, and every bug fixed since v2, read **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

```
theatre-control/
├── index.html              Control panel markup
├── css/control.css         Control panel styles
├── js/
│   ├── util.js             DOM builder, toasts, key names, slide styles
│   ├── state.js            Saved state, validation, autosave
│   ├── projector.js        Opens the projector window; its runtime code
│   ├── cues.js             Video cue list and playback
│   ├── credits.js          Slides, editor, preview, rolling credits
│   ├── music.js            Credits music
│   ├── settings.js         Settings tab, show file save/load, reset
│   ├── keyboard.js         Shortcuts and hotkey capture
│   └── app.js              Tabs, show bar, startup
├── examples/               Sample credits file
├── docs/                   Architecture notes, show-day checklist
└── legacy/                 The original single-file v2, for reference
```

## Development

There's no build step and no dependencies. Edit the files and reload.

Everything is a classic `<script>` sharing a `window.TC` namespace rather than ES modules, because browsers block module scripts on `file://` pages. Please keep it that way so the app keeps working by double-click.

To test over HTTP instead (optional):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Hosting on GitHub Pages

The repo includes a workflow (`.github/workflows/pages.yml`) that publishes the app to GitHub Pages on every push to `main`. Enable it under **Settings → Pages → Source: GitHub Actions**. The hosted version works the same, but for shows a local copy is safer — no Wi-Fi required.

## Roadmap ideas

- Still-image cues (logos, title cards)
- Audio-only sound cues with their own hotkeys
- Cue notes / "GO" list order with a standby indicator
- MIDI / OSC triggers from a lighting desk
- Bundled fonts for fully offline styling

## License

[MIT](LICENSE)
