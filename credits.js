/*
 * Theatre Control — credits slides and rolling credits.
 *
 * Two pointers:
 *   live    — the slide that is (or will be, when you press Show) on the projector
 *   editing — the slide open in the editor / preview
 * Arrow keys move `live`. Changes only reach the projector while credits are
 * actually showing (v2 pushed slides on screen whenever an arrow was pressed).
 */
(function (TC) {
  'use strict';

  const TYPE_LABEL = { names: 'Names', title: 'Title', blank: 'Blank' };
  const slides = () => TC.state.slides;
  const fade = () => TC.state.settings.creditsFade;
  let live = 0;
  let editing = -1;
  let showing = false;
  let rolling = false;

  function init() {
    TC.$('#nav-prev').onclick = prev;
    TC.$('#nav-next').onclick = next;
    TC.$('#show-credits-btn').onclick = show;
    TC.$('#hide-credits-btn').onclick = hide;
    TC.$('#roll-btn').onclick = roll;
    TC.$('#add-names').onclick = () => add('names');
    TC.$('#add-title').onclick = () => add('title');
    TC.$('#add-blank').onclick = () => add('blank');
    TC.$('#export-credits').onclick = exportCredits;
    TC.$('#import-credits').onclick = () => TC.$('#import-credits-input').click();
    TC.$('#import-credits-input').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); };
    ['#editor-section', '#editor-names', '#editor-big-title', '#editor-subtitle'].forEach((sel) => { TC.$(sel).oninput = fromEditor; });

    const speed = TC.$('#roll-speed');
    speed.oninput = () => {
      TC.state.roll.speed = +speed.value;
      TC.$('#roll-speed-label').textContent = speed.value;
      TC.projector.call('setRollSpeed', TC.state.roll.speed);
      TC.save();
    };
    TC.$('#roll-music').onchange = (e) => { TC.state.roll.withMusic = e.target.checked; TC.save(); };

    buildStyleRows();
    syncFromState();
  }

  function syncFromState() {
    live = 0;
    editing = slides().length ? 0 : -1;
    showing = false;
    rolling = false;
    TC.$('#roll-speed').value = TC.state.roll.speed;
    TC.$('#roll-speed-label').textContent = TC.state.roll.speed;
    TC.$('#roll-music').checked = TC.state.roll.withMusic;
    openEditor();
    refresh();
  }

  /* ── Style buttons ─────────────────────────────── */

  function buildStyleRows() {
    const groups = { color: TC.STYLE.colors, bg: TC.STYLE.bgs, fontSize: TC.STYLE.fontSizes };
    Object.entries(groups).forEach(([prop, options]) => {
      TC.$('.style-row[data-prop="' + prop + '"]').replaceChildren(...options.map(([value, label, hex]) =>
        TC.el('button', { class: 'type-btn', 'data-value': value, onclick: () => setStyle(prop, value) },
          hex ? TC.el('span', { class: 'swatch', style: { background: hex } }) : null, label)));
    });
  }

  function setStyle(prop, value) {
    const s = slides()[editing];
    if (!s) return;
    s[prop] = value;
    changed();
  }

  // Each row only looks at its own property (v2 cleared the font-size highlight here).
  function markStyle() {
    const s = slides()[editing];
    if (!s) return;
    TC.$$('.style-row').forEach((rowEl) => {
      rowEl.querySelectorAll('.type-btn').forEach((b) => b.classList.toggle('active', b.dataset.value === s[rowEl.dataset.prop]));
    });
  }

  /* ── Editing ───────────────────────────────────── */

  function changed() {
    TC.save();
    renderList();
    markStyle();
    renderPreview();
    if (showing && editing === live) send();
  }

  function fromEditor() {
    const s = slides()[editing];
    if (!s) return;
    if (s.type === 'names') {
      s.sectionTitle = TC.$('#editor-section').value;
      s.names = TC.$('#editor-names').value.split('\n');
    } else if (s.type === 'title') {
      s.bigTitle = TC.$('#editor-big-title').value;
      s.subtitle = TC.$('#editor-subtitle').value;
    }
    changed();
  }

  function openEditor() {
    const ed = TC.$('#slide-editor');
    const s = slides()[editing];
    if (!s) { ed.hidden = true; renderPreview(); return; }
    ed.hidden = false;
    TC.$('#editor-title').textContent = 'Editing slide ' + (editing + 1) + ' — ' + TYPE_LABEL[s.type];
    TC.$('#editor-names-fields').hidden = s.type !== 'names';
    TC.$('#editor-title-fields').hidden = s.type !== 'title';
    TC.$('#editor-blank-fields').hidden = s.type !== 'blank';
    TC.$('#editor-style').hidden = s.type === 'blank';
    if (s.type === 'names') {
      TC.$('#editor-section').value = s.sectionTitle;
      TC.$('#editor-names').value = s.names.join('\n');
    } else if (s.type === 'title') {
      TC.$('#editor-big-title').value = s.bigTitle;
      TC.$('#editor-subtitle').value = s.subtitle;
    }
    markStyle();
    renderPreview();
  }

  function edit(i) {
    editing = i;
    openEditor();
    renderList();
  }

  function add(type) {
    slides().push(TC.newSlide(type));
    editing = slides().length - 1;
    if (slides().length === 1) live = 0;
    TC.save();
    openEditor();
    refresh();
    const first = type === 'names' ? '#editor-section' : type === 'title' ? '#editor-big-title' : null;
    if (first) TC.$(first).focus();
  }

  function remove(i) {
    if (!confirm('Delete slide ' + (i + 1) + '?')) return;
    const wasLive = i === live;
    slides().splice(i, 1);
    const n = slides().length;
    if (live > i) live--;
    if (editing > i) editing--;
    live = Math.min(live, Math.max(0, n - 1));
    editing = n ? Math.min(Math.max(editing, 0), n - 1) : -1;
    TC.save();
    if (!n && showing) hide();
    else if (showing && wasLive) send();
    openEditor();
    refresh();
  }

  function duplicate(i) {
    slides().splice(i + 1, 0, JSON.parse(JSON.stringify(slides()[i])));
    if (live > i) live++;
    editing = i + 1;
    TC.save();
    openEditor();
    refresh();
  }

  function move(i, dir) {
    const j = i + dir;
    const list = slides();
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const swap = (x) => (x === i ? j : x === j ? i : x);
    editing = swap(editing);
    live = swap(live);
    TC.save();
    openEditor();
    refresh();
  }

  function goLive(i) {
    live = i;
    if (showing) send();
    refresh();
  }

  /* ── Rendering ─────────────────────────────────── */

  function previewText(s) {
    if (s.type === 'blank') return '[Blank — black screen]';
    if (s.type === 'title') return s.bigTitle || '[Title slide]';
    const names = s.names.map((n) => n.trim()).filter(Boolean);
    return (s.sectionTitle ? s.sectionTitle + ': ' : '') +
      (names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ' +' + (names.length - 3) + ' more' : '') : '[No names yet]');
  }

  function renderList() {
    TC.$('#slide-list').replaceChildren(...slides().map((s, i) => {
      const onAir = showing && i === live;
      const btn = (text, title, fn, extra) => TC.el('button', { class: 'slide-btn' + (extra || ''), title, 'aria-label': title, text, onclick: fn });
      return TC.el('div', {
        class: 'slide-item' + (i === editing ? ' editing' : '') + (onAir ? ' on-air' : ''),
        onclick: (e) => { if (!e.target.closest('.slide-actions')) edit(i); },
      },
        TC.el('span', { class: 'slide-num', text: String(i + 1) }),
        TC.el('span', { class: 'slide-flag', text: onAir ? 'ON AIR' : i === live ? 'CUED' : '' }),
        TC.el('span', { class: 'slide-preview-text', text: previewText(s) }),
        TC.el('div', { class: 'slide-actions' },
          btn('▶', 'Make this the live slide', () => goLive(i)),
          btn('↑', 'Move up', () => move(i, -1)),
          btn('↓', 'Move down', () => move(i, 1)),
          btn('⧉', 'Duplicate', () => duplicate(i)),
          btn('✕', 'Delete', () => remove(i), ' slide-btn-danger')));
    }));
  }

  function renderPreview() {
    const frame = TC.$('#preview');
    const tag = TC.$('#preview-tag');
    const s = slides()[editing];
    frame.replaceChildren();
    const onAir = showing && editing === live;
    tag.classList.toggle('on-air', onAir);
    if (!s) {
      frame.style.background = '';
      frame.appendChild(TC.el('div', { class: 'preview-empty', text: 'No slides yet — add one below' }));
      tag.textContent = 'Preview';
      return;
    }
    frame.style.background = TC.bgHex(s.bg);
    if (s.type === 'blank') frame.appendChild(TC.el('div', { class: 'preview-empty', text: 'Black screen' }));
    else {
      const b = TC.buildSlide(s, 'cqh');
      frame.appendChild(b);
      TC.fitBlock(frame, b);
    }
    tag.textContent = onAir ? '● On air — slide ' + (editing + 1) : 'Preview — slide ' + (editing + 1);
  }

  function refreshNav() {
    const n = slides().length;
    const open = TC.projector.isOpen();
    TC.$('#slide-counter').textContent = n ? 'Slide ' + (live + 1) + ' of ' + n : 'No slides';
    TC.$('#nav-prev').disabled = !n || live <= 0;
    TC.$('#nav-next').disabled = !n || live >= n - 1;
    const sb = TC.$('#show-credits-btn');
    sb.disabled = !open || !n;
    sb.textContent = showing ? '● On Air' : 'Show on Projector';
    sb.classList.toggle('on-air', showing);
    TC.$('#hide-credits-btn').disabled = !open || (!showing && !rolling);
    const rb = TC.$('#roll-btn');
    rb.disabled = !open || !n;
    rb.textContent = rolling ? '■ Stop Roll' : '▶ Roll Credits';
  }

  function refresh() {
    refreshNav();
    renderList();
    renderPreview();
    if (TC.app) TC.app.refresh();
  }

  /* ── Projector ─────────────────────────────────── */

  function send() {
    const s = slides()[live];
    if (s) TC.projector.call('showSlide', s, { fade: fade() });
  }

  function show() {
    if (!TC.projector.isOpen()) { TC.toast('Open the projector first.', 'warn'); return; }
    if (!slides().length) { TC.toast('Add a slide first.', 'warn'); return; }
    send();
    showing = true;
    rolling = false;
    refresh();
  }

  function hide() {
    TC.projector.call('hideCredits', { fade: fade() });
    showing = false;
    rolling = false;
    refresh();
  }

  function next() {
    if (live >= slides().length - 1) return;
    live++;
    if (showing) send();
    refresh();
  }

  function prev() {
    if (live <= 0) return;
    live--;
    if (showing) send();
    refresh();
  }

  function roll() {
    if (rolling) {
      TC.projector.call('stopRoll', { fade: fade() });
      rolling = false;
      refresh();
      return;
    }
    if (!TC.projector.isOpen()) { TC.toast('Open the projector first.', 'warn'); return; }
    if (!slides().length) { TC.toast('Add some slides first.', 'warn'); return; }
    const firstReal = slides().find((s) => s.type !== 'blank');
    TC.projector.call('roll', slides(), { speed: TC.state.roll.speed, fade: fade(), bg: firstReal ? firstReal.bg : 'black' });
    rolling = true;
    showing = false;
    if (TC.state.roll.withMusic && TC.music.hasFile() && !TC.music.isPlaying()) TC.music.play();
    refresh();
  }

  function onRollEnded() {
    rolling = false;
    if (TC.state.roll.withMusic && TC.music.isPlaying()) TC.music.stop(true);
    TC.toast('Rolling credits finished.', 'ok');
    refresh();
  }

  /* ── Save / load ───────────────────────────────── */

  function exportCredits() {
    if (!slides().length) { TC.toast('No slides to save yet.', 'warn'); return; }
    // version:1 + slides keeps files loadable by v2.
    TC.download('credits-' + TC.dateStamp() + '.json', JSON.stringify({ app: 'theatre-control', version: 1, slides: slides() }, null, 2));
  }

  async function importFile(file) {
    let data;
    try { data = JSON.parse(await TC.readText(file)); } catch (e) { TC.toast('That file isn\'t valid JSON.', 'error'); return; }
    if (!data || !Array.isArray(data.slides)) { TC.toast('No slides found in that file.', 'error'); return; }
    if (slides().length && !confirm('Replace your ' + slides().length + ' current slide(s) with ' + data.slides.length + ' from "' + file.name + '"?')) return;
    replaceSlides(data.slides.map(TC.normalizeSlide));
    TC.toast('Loaded ' + data.slides.length + ' slide(s).', 'ok');
  }

  function replaceSlides(list) {
    if (showing || rolling) hide();
    TC.state.slides = list;
    TC.save();
    syncFromState();
  }

  TC.credits = {
    init,
    syncFromState,
    replaceSlides,
    next,
    prev,
    show,
    hide,
    toggleShow: () => (showing || rolling ? hide() : show()),
    renderPreview,
    refresh,
    onRollEnded,
    onVideoStarted: () => { if (showing || rolling) { showing = false; rolling = false; refresh(); } },
    onProjectorClosed: () => { showing = false; rolling = false; refresh(); },
    isShowing: () => showing,
    isRolling: () => rolling,
  };
})(window.TC);
