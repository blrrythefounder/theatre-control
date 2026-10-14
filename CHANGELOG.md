# Changelog

## [3.0.0] — 2026-10-14

Split the single-file v2 into a structured project and expanded it. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full breakdown.

### Added
- **Cue list**: unlimited video cues, each with its own file, hotkey, end behaviour, scale and volume (replaces the separate Newspaper and Flashback tabs; both remain as default cues).
- Progress bar and elapsed / total / remaining time for each cue.
- Configurable **fades** for video (picture and audio), credits and blackout.
- **Blackout** (`B`) over everything on the projector.
- **Rolling credits** with live speed control and optional music start / fade-out at the end.
- To-scale 16:9 credits preview with "on air" indicator; long name lists auto-shrink to fit.
- Duplicate slide, and "make live" button per slide.
- **Autosave** of cues, hotkeys, slides, music and settings; remembered media file names.
- **Show files**: save/load the whole show as JSON (credits-only files still supported).
- Settings tab and reset.
- Show bar with projector status on every tab; toasts for errors and confirmations.
- Keyboard: `C` show/hide credits, `?` help, `PgUp`/`PgDn` for clickers, `F`/double-click fullscreen in the projector, shortcuts forwarded from the projector window.
- Music: timed fade length, elapsed / total time.
- Example credits file, show-day checklist, GitHub Pages workflow.

### Fixed
- Space / arrow keys fired while typing in the credits editor.
- Arrow keys put credits on the projector while credits were hidden.
- Holding a key repeatedly toggled a cue.
- Space activated a focused button *and* the hotkey.
- Font Size highlight cleared when selecting a slide.
- Slide text injected as HTML.
- Blank slide revealed underlying video instead of black.
- Flashback "freeze on last frame" hid the video.
- A frozen flashback covered the newspaper video.
- "Show on Projector" stayed disabled after opening the projector.
- Projector startup race (400 ms timer).
- Dropping a file outside a drop zone navigated away from the page.
- Music fade timers could stack.
- Unhandled play() failures; unvalidated credits imports.
- Fixed-px slide text didn't scale to projector resolution.

## [2.0.0]

Original single-file version (`legacy/theatre-system-v2.html`): Newspaper video cue, credits slides with music, and Flashback video cue.
