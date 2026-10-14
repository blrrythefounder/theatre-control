# Architecture

This document breaks down how Theatre Control works: first the original single-file v2, then the v3 structure that replaced it, and finally every bug fixed along the way.

---

## 1. The original: `theatre system v2.html`

v2 (kept in [`legacy/theatre-system-v2.html`](../legacy/theatre-system-v2.html)) is one ~950-line HTML file with three tabs:

| Tab | What it did |
| --- | --- |
| 🎬 **Video Cue** ("Newspaper Cue") | Load one video, pick a trigger key (default Space), choose end behaviour and scale, then play it on the projector. |
| 🎭 **Credits** | Build a list of slides (Names / Title / Blank), style them, step through them with arrows, plus a credits music player. Save/load slides as `credits.json`. |
| 📽 **Flashback** | A second video cue, click-only, with its own video element on the projector. |

### The core trick: a written-in projector window

```js
projWindow = window.open('', 'ProjectorWindow', '...');
projWindow.document.write(projectorHTML);   // a whole HTML page held in a JS string
```

Opening `about:blank` and writing into it keeps the pop-up on the **same origin** as the control page, even from `file://`. That lets the control page:

- call functions the projector defines on its `window` (`projWindow.playVideo()`, `projWindow.showCredits(slide)`),
- pass `blob:` URLs created from local files with `URL.createObjectURL(file)`.

The projector calls back via `window.opener.onProjectorEnded()` when a video finishes.

### v2's projector layers

```
z 20  #credits-layer   (credits text on a coloured background)
z 11  #pv2             (flashback video)
z 10  #pv              (newspaper video)
      body: black
```

Layers were shown/hidden with `display: none` / a `.visible` class — instant cuts, no fades.

### v2's state

Plain globals: `videoObjectURL`, `isPlaying`, `triggerKey`, `slides[]`, `currentSlideIndex`, `editingSlideIndex`, `fbVideoObjectURL`, `fbIsPlaying`, `creditsAudio`… Nothing persisted except via the manual Save Credits button.

---

## 2. v3 structure

### Files

```
index.html          markup only (no inline handlers)
css/control.css     control panel styles
js/util.js          TC.el() DOM builder, toasts, key labels, slide style tables, slide builder
js/state.js         defaults, validation (hydrate/normalize), autosave to localStorage
js/projector.js     projector window: open/close/call + the runtime that runs inside it
js/cues.js          video cue list UI, file loading, play/stop/freeze, progress
js/credits.js       slide list, editor, preview, show/hide, rolling credits, credits files
js/music.js         credits music with timed fade
js/settings.js      settings tab, show file save/load, reset
js/keyboard.js      global shortcuts, hotkey capture, focus handling
js/app.js           tabs, show bar, projector lifecycle/event routing, startup
```

**Why classic scripts and not ES modules?** Chrome refuses to load `<script type="module">` from `file://` (CORS). The app must work by double-clicking `index.html`, so every file is a classic script that adds to one namespace, `window.TC`. Load order in `index.html` matters: `util → state → projector → cues → credits → music → settings → keyboard → app`. Modules only *define* things at load time; `app.js` wires everything up on `DOMContentLoaded`.

### Data model (`TC.state`, autosaved)

```js
{
  version: 3,
  settings: { videoFade: 0.5, creditsFade: 0.6, stopOthers: true, confirmClose: true },
  cues: [
    { id: 'newspaper', name: 'Newspaper', key: ' ', end: 'black'|'loop'|'freeze',
      scale: 'contain'|'cover'|'fill', volume: 0-100, fileName: 'clip.mp4' },
    ...
  ],
  slides: [
    { type: 'names'|'title'|'blank', sectionTitle, names: [], bigTitle, subtitle,
      color, bg, fontSize },
    ...
  ],
  music: { volume, loop, fade, fadeSeconds, fileName },
  roll:  { speed /* % of screen height per second */, withMusic }
}
```

Anything loaded — from localStorage, a show file, or a v2 credits file — goes through `TC.hydrate()` / `TC.normalizeSlide()` / `TC.normalizeCue()`, which fill defaults, clamp numbers, reject unknown values, de-duplicate cue IDs and hotkeys. Bad input can't break the UI.

**Not saved:** blob URLs and play state live in per-module runtime objects (e.g. `runtime[cueId]` in `cues.js`). Browsers can't reopen a disk file without the user picking it, so `fileName` is remembered only to tell the operator which file to re-select.

### The projector protocol

`js/projector.js` contains `projectorRuntime(CFG)` — an ordinary function, written and syntax-checked like the rest of the code, that is serialized with `toString()` and executed inside the pop-up. It installs `window.Projector`:

| Method | Purpose |
| --- | --- |
| `connect(fn)` | Register the control page's event handler |
| `loadCue(id, url, opts)` / `setCueOptions(id, opts)` / `removeCue(id)` | Manage one `<video>` per cue (created lazily) |
| `playCue(id, {fade, hideCredits})` / `stopCue(id, {fade})` | Fade picture and audio in/out |
| `showSlide(slide, {fade})` / `hideCredits({fade})` | Credits card with crossfade between slides |
| `roll(slides, {speed, fade, bg})` / `setRollSpeed(n)` / `stopRoll({fade})` | Rolling credits via `requestAnimationFrame` |
| `blackout(on, {fade})` | Top-most black layer |

Events back to the control page (`TC.onProjectorEvent`):

| Event | When |
| --- | --- |
| `{type:'time', id, t, d}` | Metadata loaded, then ~4×/s while playing |
| `{type:'ended', id}` | A non-looping video finished |
| `{type:'error', id, message}` | Unplayable file or play() rejected |
| `{type:'rollEnded'}` | Rolling credits scrolled off the top |
| `{type:'key', key, repeat, …}` | A key was pressed while the projector had focus |

Control code never touches the projector DOM directly; it goes through `TC.projector.call(method, ...args)`, which is a no-op returning `false` when the window is closed.

### v3 projector layers

```
z 100  #black       blackout
z 21   #roll        rolling credits
z 20   #credits     credits card (blank slide = black card)
z 11   <video>      the cue most recently played
z 10   <video>…     other cues
       body: black
```

Layers use `opacity` + `visibility` with a per-call `transition-duration`, so every change can fade. Text sizes are in `vh` so slides look the same at any projector resolution; the control preview uses the same numbers in `cqh` (container-query height) so it's to scale.

### Play-state flow for a cue

```
           press hotkey / ▶                 video ends
  READY ───────────────────▶ PLAYING ───────────────────┐
    ▲                          │                         │ end = 'black'  → stop → READY
    │        press again / Esc │                         │ end = 'freeze' → FROZEN
    └──────────────────────────┘                         │ end = 'loop'   → keeps playing
    ▲                                                    ▼
    └─────────────── press again / Esc ─────────────  FROZEN (last frame held)
```

With *"Starting a cue stops any other cue"* on (default), playing a cue stops whatever else is on screen. Playing a cue also takes credits/rolling credits down.

### Credits pointers

- `live` — the slide that is on the projector (or will be when you press Show). Arrow keys move this.
- `editing` — the slide in the editor and preview.

Edits reach the projector only when `showing && editing === live`.

---

## 3. Bugs fixed from v2

| # | v2 behaviour | Fix |
| --- | --- | --- |
| 1 | Pressing **Space while typing names** in the credits editor triggered the video. Arrow keys changed slides mid-typing. | `keyboard.js` ignores shortcuts while focus is in a text field. |
| 2 | **Arrow keys pushed credits onto the projector** even when credits were hidden (e.g. mid-scene). | Slides are only sent while credits are showing. |
| 3 | **Holding a key** re-fired the cue repeatedly (play/stop/play…). | Repeat key events are ignored. |
| 4 | After clicking ▶ with the mouse, **Space "clicked" the focused button and fired the hotkey** — play then instantly stop. | Buttons/dropdowns release focus after use. |
| 5 | Selecting a slide **lost the Font Size highlight** (the colour loop cleared all buttons). | Each style row is marked from its own property. |
| 6 | Slide text was inserted with `innerHTML` — names containing `<` or `&` broke the preview/list. | All text is set with `textContent`. |
| 7 | **"Blank" slide hid the credits layer**, revealing any video underneath instead of showing black. | Blank renders a black card. |
| 8 | Flashback **"Freeze on last frame" hid the video** when it ended. | Freeze holds the frame for every cue; pressing again clears it. |
| 9 | A frozen flashback (z 11) **hid the newspaper video** when it played next. | The most recently played cue is always on top. |
| 10 | **"Show on Projector" stayed disabled** after opening the projector until you switched tabs (dead `origUpdateWindowStatus` code). | Central `refresh()` updates every control on open/close. |
| 11 | Projector start relied on a **400 ms `setTimeout`**. | Runtime is ready synchronously after `document.write`; no timer. |
| 12 | **Dropping a file outside a drop zone** navigated the control page away mid-show. | Window-level drop is swallowed. |
| 13 | Clicking music **Stop twice stacked fade timers** fighting over the volume. | One fade at a time; a second click cuts immediately. |
| 14 | `audio.play()` / `video.play()` rejections were unhandled (silent failure). | Errors surface as a toast with the reason. |
| 15 | Loaded `credits.json` wasn't validated — a malformed slide could throw. | `normalizeSlide()` validates every field. |
| 16 | Font sizes were fixed px tuned for a 1280×720 window. | `vh` units scale with the projector; long lists auto-shrink. |
| 17 | Closing/reloading the control tab lost everything not manually saved. | Autosave + optional "are you sure" while the projector is open. |
| 18 | Newspaper and Flashback were **two copies of the same code**. | One cue list; add as many cues as the show needs. |
