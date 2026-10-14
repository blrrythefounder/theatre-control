/*
 * Theatre Control — video cues.
 *
 * v2 had two near-identical pages ("Newspaper" and "Flashback") with copied
 * code. Here every video is a cue in a list with its own file, hotkey, end
 * behaviour, scale and volume. The defaults recreate the original two cues.
 */
(function (TC) {
  'use strict';

  const END_OPTIONS = [['black', 'Return to black'], ['loop', 'Loop video'], ['freeze', 'Freeze on last frame']];
  const SCALE_OPTIONS = [['contain', 'Fit to screen (letterbox)'], ['cover', 'Fill screen (crop edges)'], ['fill', 'Stretch to fill']];

  // Per-session runtime info (not saved): blob URL, play state, position.
  const runtime = {};
  const openPanels = new Set();
  const R = (id) => runtime[id] || (runtime[id] = { url: null, playing: false, frozen: false, t: 0, d: 0 });
  const cues = () => TC.state.cues;
  const find = (id) => cues().find((c) => c.id === id);
  const opts = (c) => ({ scale: c.scale, volume: c.volume, end: c.end });
  const isActive = (id) => R(id).playing || R(id).frozen;
  const fade = () => TC.state.settings.videoFade;

  /* ── Rendering ─────────────────────────────────── */

  function render() {
    TC.$('#cue-list').replaceChildren(...cues().map(card));
    cues().forEach((c) => updateStatus(c.id));
  }

  function card(cue, index) {
    const open = openPanels.has(cue.id);
    const root = TC.el('article', { class: 'cue-card', 'data-cue': cue.id });
    root.append(
      TC.el('div', { class: 'cue-head' },
        TC.el('span', { class: 'dot', 'data-role': 'dot' }),
        TC.el('button', { class: 'cue-go', 'data-role': 'go', onclick: () => toggle(cue.id) },
          TC.el('span', { class: 'cue-go-icon', 'data-role': 'go-icon', text: '▶' }),
          TC.el('span', { class: 'cue-go-label', 'data-role': 'go-label', text: cue.name || 'Untitled cue' })),
        TC.el('span', { class: 'key-chip', 'data-role': 'key-chip', title: 'Hotkey' }),
        TC.el('button', {
          class: 'icon-btn', title: open ? 'Hide cue settings' : 'Cue settings', 'aria-expanded': String(open),
          onclick: () => { open ? openPanels.delete(cue.id) : openPanels.add(cue.id); render(); },
        }, open ? '▴' : '⚙')),
      TC.el('div', { class: 'cue-progress' }, TC.el('div', { class: 'cue-progress-bar', 'data-role': 'bar' })),
      TC.el('div', { class: 'cue-meta' },
        TC.el('span', { 'data-role': 'status' }),
        TC.el('span', { class: 'cue-time', 'data-role': 'time' })));
    if (open) root.appendChild(settingsPanel(cue, index));
    return root;
  }

  function row(label, control) {
    return TC.el('div', { class: 'row' }, TC.el('label', { text: label }), control);
  }

  function settingsPanel(cue, index) {
    const fileInput = TC.el('input', {
      type: 'file', accept: 'video/*', 'aria-label': 'Choose video file for ' + cue.name,
      onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) setFile(cue.id, f); },
    });
    const drop = TC.el('div', { class: 'file-drop' }, fileInput,
      TC.el('div', { class: 'file-drop-text', text: 'Click or drag video file here' }),
      TC.el('div', { class: 'file-loaded', 'data-role': 'file' }));
    TC.wireDrop(drop, (f) => setFile(cue.id, f));

    const volLabel = TC.el('span', { class: 'range-value', text: String(cue.volume) });
    const listening = TC.cues.capturing === cue.id;

    return TC.el('div', { class: 'cue-settings' },
      row('Cue name', TC.el('input', {
        class: 'text-input', value: cue.name, placeholder: 'e.g. Newspaper', maxlength: '60',
        oninput: (e) => {
          cue.name = e.target.value;
          TC.$('[data-cue="' + cue.id + '"] [data-role="go-label"]').textContent = cue.name || 'Untitled cue';
          TC.save();
          TC.app.refresh();
        },
      })),
      row('Video file', drop),
      row('Hotkey', TC.el('div', { class: 'key-row' },
        TC.el('div', { class: 'key-badge', text: TC.keyLabel(cue.key) }),
        TC.el('button', { class: 'btn-small' + (listening ? ' listening' : ''), text: listening ? 'Press a key… (Esc cancels)' : 'Change key', onclick: () => startCapture(cue.id) }),
        cue.key ? TC.el('button', { class: 'btn-small', text: 'Clear', onclick: () => { cue.key = ''; TC.save(); render(); } }) : null)),
      row('After video ends', TC.select(END_OPTIONS, cue.end, (v) => { cue.end = v; changed(cue); })),
      row('Video scale', TC.select(SCALE_OPTIONS, cue.scale, (v) => { cue.scale = v; changed(cue); })),
      row('Volume', TC.el('div', { class: 'range-row' },
        TC.el('input', {
          type: 'range', min: '0', max: '100', value: String(cue.volume), 'aria-label': 'Cue volume',
          oninput: (e) => { cue.volume = +e.target.value; volLabel.textContent = cue.volume; changed(cue); },
        }),
        volLabel)),
      TC.el('div', { class: 'cue-settings-actions' },
        TC.el('button', { class: 'btn-small', text: '↑ Move up', disabled: index === 0, onclick: () => move(index, -1) }),
        TC.el('button', { class: 'btn-small', text: '↓ Move down', disabled: index === cues().length - 1, onclick: () => move(index, 1) }),
        TC.el('button', { class: 'btn-danger', text: 'Delete cue', onclick: () => remove(cue.id) })));
  }

  function updateStatus(id) {
    const cue = find(id);
    const el = document.querySelector('[data-cue="' + id + '"]');
    if (!cue || !el) return;
    const r = R(id);
    const q = (role) => el.querySelector('[data-role="' + role + '"]');
    let dot = 'nofile';
    let status;
    if (!r.url) status = cue.fileName ? 'Re-select video: ' + cue.fileName : 'No video loaded — open ⚙ to add one';
    else if (!TC.projector.isOpen()) { dot = 'nowin'; status = 'Ready — open the projector'; }
    else if (r.playing) { dot = 'playing'; status = 'Playing'; }
    else if (r.frozen) { dot = 'frozen'; status = 'Holding last frame — press again to clear'; }
    else { dot = 'ready'; status = 'Ready'; }

    q('dot').className = 'dot ' + dot;
    q('status').textContent = status;
    const go = q('go');
    go.disabled = !r.url;
    go.classList.toggle('playing', isActive(id));
    q('go-icon').textContent = isActive(id) ? '■' : '▶';
    q('key-chip').textContent = TC.keyLabel(cue.key);
    q('time').textContent = r.d
      ? TC.fmtTime(r.t) + ' / ' + TC.fmtTime(r.d) + (r.playing ? '   −' + TC.fmtTime(r.d - r.t) : '')
      : '';
    q('bar').style.width = r.d ? Math.min(100, (r.t / r.d) * 100) + '%' : '0%';
    const file = q('file');
    if (file) {
      file.textContent = r.url ? '✓ ' + cue.fileName : cue.fileName ? '⚠ Re-select ' + cue.fileName : '';
      file.classList.toggle('warn', !r.url && !!cue.fileName);
    }
    el.classList.toggle('is-live', isActive(id));
  }

  /* ── Editing ───────────────────────────────────── */

  function changed(cue) {
    TC.save();
    TC.projector.call('setCueOptions', cue.id, opts(cue));
  }

  function setFile(id, file) {
    const cue = find(id);
    if (!cue) return;
    if (!TC.isVideo(file)) { TC.toast('"' + file.name + '" doesn\'t look like a video file.', 'warn'); return; }
    const r = R(id);
    if (isActive(id)) stop(id);
    if (r.url) URL.revokeObjectURL(r.url);
    r.url = URL.createObjectURL(file);
    r.t = 0;
    r.d = 0;
    cue.fileName = file.name;
    TC.save();
    TC.projector.call('loadCue', id, r.url, opts(cue));
    updateStatus(id);
  }

  function startCapture(id) {
    TC.cues.capturing = id;
    openPanels.add(id);
    render();
    TC.keys.capture((e) => {
      TC.cues.capturing = null;
      const cue = find(id);
      if (!cue || e.key === 'Escape') { render(); return; }
      const reason = TC.reservedReason(e.key);
      if (reason) {
        TC.toast(TC.keyLabel(e.key) + ' is reserved for ' + reason + '. Pick another key.', 'warn');
        render();
        return;
      }
      const k = TC.normKey(e.key);
      cues().forEach((c) => {
        if (c !== cue && c.key === k) {
          c.key = '';
          TC.toast(TC.keyLabel(k) + ' moved from "' + c.name + '" to "' + cue.name + '".');
        }
      });
      cue.key = k;
      TC.save();
      render();
    });
  }

  function add() {
    const cue = TC.newCue('Cue ' + (cues().length + 1));
    cues().push(cue);
    openPanels.add(cue.id);
    TC.save();
    render();
    const el = document.querySelector('[data-cue="' + cue.id + '"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function remove(id) {
    const cue = find(id);
    if (!cue || !confirm('Delete cue "' + cue.name + '"?')) return;
    if (isActive(id)) stop(id);
    if (R(id).url) URL.revokeObjectURL(R(id).url);
    TC.projector.call('removeCue', id);
    delete runtime[id];
    openPanels.delete(id);
    TC.state.cues = cues().filter((c) => c.id !== id);
    TC.save();
    render();
    TC.app.refresh();
  }

  function move(i, dir) {
    const j = i + dir;
    const list = cues();
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    TC.save();
    render();
  }

  /* ── Playback ──────────────────────────────────── */

  function toggle(id) {
    const cue = find(id);
    if (!cue) return;
    if (isActive(id)) { stop(id); return; }
    const r = R(id);
    if (!r.url) { TC.toast('Load a video for "' + cue.name + '" first.', 'warn'); return; }
    if (!TC.projector.isOpen()) { TC.toast('Open the projector first.', 'warn'); return; }
    if (TC.state.settings.stopOthers) cues().forEach((c) => { if (c.id !== id && isActive(c.id)) stop(c.id); });
    TC.projector.call('setCueOptions', id, opts(cue));
    TC.projector.call('playCue', id, { fade: fade(), hideCredits: true });
    r.playing = true;
    r.frozen = false;
    TC.credits.onVideoStarted();
    if (TC.app.isBlackout()) TC.toast('Blackout is on — press B to reveal the video.', 'warn');
    updateStatus(id);
    TC.app.refresh();
  }

  function stop(id) {
    const r = R(id);
    r.playing = false;
    r.frozen = false;
    r.t = 0;
    TC.projector.call('stopCue', id, { fade: fade() });
    updateStatus(id);
    TC.app.refresh();
  }

  function stopAll() {
    let n = 0;
    cues().forEach((c) => { if (isActive(c.id)) { stop(c.id); n++; } });
    return n;
  }

  function onEnded(id) {
    const cue = find(id);
    if (!cue || !R(id).playing) return;
    if (cue.end === 'freeze') {
      R(id).playing = false;
      R(id).frozen = true;
      updateStatus(id);
      TC.app.refresh();
    } else {
      stop(id); // 'black' (loop never fires 'ended')
    }
  }

  function onTime(id, t, d) {
    const r = R(id);
    r.t = t;
    if (d && Number.isFinite(d)) r.d = d;
    updateStatus(id);
  }

  function onError(id, message) {
    const cue = find(id);
    R(id).playing = false;
    R(id).frozen = false;
    TC.toast((cue ? cue.name + ': ' : '') + message, 'error', 6000);
    updateStatus(id);
    TC.app.refresh();
  }

  function loadAllIntoProjector() {
    cues().forEach((c) => { if (R(c.id).url) TC.projector.call('loadCue', c.id, R(c.id).url, opts(c)); });
  }

  function onProjectorClosed() {
    Object.values(runtime).forEach((r) => { r.playing = false; r.frozen = false; r.t = 0; });
    cues().forEach((c) => updateStatus(c.id));
  }

  TC.cues = {
    capturing: null,
    render,
    add,
    toggle,
    stop,
    stopAll,
    onEnded,
    onTime,
    onError,
    loadAllIntoProjector,
    onProjectorClosed,
    refreshStatus: () => cues().forEach((c) => updateStatus(c.id)),
    anyActive: () => cues().some((c) => isActive(c.id)),
    activeNames: () => cues().filter((c) => isActive(c.id)).map((c) => c.name || 'Untitled cue'),
    matchKey: (key) => {
      const k = TC.normKey(key);
      const cue = k && cues().find((c) => c.key === k);
      return cue ? cue.id : null;
    },
  };
})(window.TC);
