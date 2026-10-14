/*
 * Theatre Control — shared helpers.
 *
 * Every file is a classic <script> (not an ES module) on purpose: browsers block
 * module scripts on file:// pages, and this app must work by double-clicking
 * index.html on a booth laptop with no internet and no web server.
 */
window.TC = window.TC || {};

(function (TC) {
  'use strict';

  /* ── DOM ─────────────────────────────────────────── */

  TC.$ = (sel, root) => (root || document).querySelector(sel);
  TC.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /**
   * Tiny element builder. Text always goes through textContent, so names typed
   * into the credits editor can never inject HTML (v2 used innerHTML).
   */
  TC.el = function (tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value == null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else if (key === 'value') node.value = value;
        else if (typeof value === 'boolean') node[key] = value;
        else node.setAttribute(key, value);
      }
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  };

  TC.select = function (options, value, onChange) {
    const s = TC.el('select', { onchange: (e) => onChange(e.target.value) },
      options.map(([v, label]) => TC.el('option', { value: v, text: label })));
    s.value = value;
    return s;
  };

  /** Make a .file-drop zone accept dropped files. */
  TC.wireDrop = function (zone, onFile) {
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    });
  };

  TC.toast = function (message, kind, ms) {
    const host = document.getElementById('toasts');
    if (!host) { console.log('[toast]', message); return; }
    const t = TC.el('div', { class: 'toast toast-' + (kind || 'info'), role: 'status', text: message });
    host.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms || 3500);
  };

  /* ── Files ───────────────────────────────────────── */

  TC.isVideo = (f) => /^video\//.test(f.type) || /\.(mp4|m4v|webm|mov|ogv|mkv)$/i.test(f.name);
  TC.isAudio = (f) => /^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus)$/i.test(f.name);

  TC.readText = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });

  TC.download = function (filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = TC.el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  TC.dateStamp = () => new Date().toISOString().slice(0, 10);

  /* ── Misc ────────────────────────────────────────── */

  TC.uid = () => 'c' + Math.random().toString(36).slice(2, 9);

  TC.clamp = (n, min, max, fallback) => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback);

  TC.debounce = function (fn, ms) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  };

  TC.fmtTime = function (s) {
    if (!Number.isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  /* ── Keys ────────────────────────────────────────── */

  const KEY_LABELS = {
    ' ': 'SPACE', Enter: 'ENTER', Tab: 'TAB', Backspace: 'BKSP', Delete: 'DEL',
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    Escape: 'ESC', PageUp: 'PG UP', PageDown: 'PG DN', Home: 'HOME', End: 'END',
  };
  /** Letters are stored lowercase so Shift / Caps Lock don't break a hotkey. */
  TC.normKey = (k) => (k && k.length === 1 ? k.toLowerCase() : k || '');
  TC.keyLabel = (k) => (!k ? 'NONE' : KEY_LABELS[k] || k.toUpperCase());

  const RESERVED = {
    escape: 'stops all video', b: 'blackout', c: 'show / hide credits', '?': 'help',
    f: 'projector fullscreen', arrowleft: 'credits slides', arrowright: 'credits slides',
    arrowup: 'credits slides', arrowdown: 'credits slides', pageup: 'credits slides / clickers',
    pagedown: 'credits slides / clickers', tab: 'moving between controls',
  };
  TC.reservedReason = (k) => RESERVED[String(k).toLowerCase()] || null;

  /* ── Slide look ──────────────────────────────────── */

  TC.STYLE = {
    colors: [['white', 'White', '#ffffff'], ['gold', 'Gold', '#d4af37'], ['cream', 'Cream', '#f5e6c8'], ['red', 'Red', '#c0392b']],
    bgs: [['black', 'Black', '#000000'], ['dark', 'Dark Gray', '#111111'], ['navy', 'Navy', '#0a0a1a']],
    fontSizes: [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['xlarge', 'X-Large']],
    // Percent of screen height, so text scales with the projector's resolution.
    // (v2 used fixed px tuned for a 1280×720 window.)
    sizes: {
      small: { section: 1.7, name: 3.9, title: 6.1, subtitle: 2.2 },
      medium: { section: 2.2, name: 6.7, title: 10, subtitle: 3.1 },
      large: { section: 2.8, name: 8.9, title: 13.3, subtitle: 3.9 },
      xlarge: { section: 3.3, name: 11.1, title: 16.7, subtitle: 4.7 },
    },
  };
  TC.colorHex = (id) => (TC.STYLE.colors.find((c) => c[0] === id) || TC.STYLE.colors[0])[2];
  TC.bgHex = (id) => (TC.STYLE.bgs.find((b) => b[0] === id) || TC.STYLE.bgs[0])[2];

  /**
   * Build a slide's text block. `unit` is 'vh' on the projector and 'cqh'
   * (container height) in the control preview, so the preview is to scale.
   * The projector runs a mirrored copy of this in js/projector.js.
   */
  TC.buildSlide = function (slide, unit) {
    const sizes = TC.STYLE.sizes[slide.fontSize] || TC.STYLE.sizes.medium;
    const block = TC.el('div', { class: 'slide-block', style: { color: TC.colorHex(slide.color), gap: 1.6 + unit } });
    const line = (cls, text, size) => block.appendChild(TC.el('div', { class: cls, text, style: { fontSize: size + unit } }));
    if (slide.type === 'title') {
      line('sl-title', slide.bigTitle || '', sizes.title);
      if (slide.subtitle) line('sl-subtitle', slide.subtitle, sizes.subtitle);
    } else if (slide.type === 'names') {
      if (slide.sectionTitle) line('sl-section', slide.sectionTitle, sizes.section);
      slide.names.forEach((n) => { n = String(n).trim(); if (n) line('sl-name', n, sizes.name); });
    }
    return block;
  };

  /** Shrink a block that's too tall for its frame (e.g. 14 names at X-Large). */
  TC.fitBlock = function (frame, block) {
    block.style.transform = '';
    const scale = Math.min(1, (frame.clientHeight * 0.9) / block.scrollHeight);
    if (scale < 1) block.style.transform = 'scale(' + scale + ')';
  };
})(window.TC);
