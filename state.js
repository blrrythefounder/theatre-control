/*
 * Theatre Control — persistent show state.
 *
 * Everything the operator configures (cue names, hotkeys, credits slides,
 * settings) is autosaved to localStorage. Media files are NOT saved: browsers
 * don't allow a page to reopen a file from disk on its own, so videos and music
 * must be re-selected each session. Their file names are remembered so the UI
 * can say exactly which file to pick.
 */
(function (TC) {
  'use strict';

  const STORAGE_KEY = 'theatre-control:v3';
  const SLIDE_TYPES = ['names', 'title', 'blank'];
  const END_MODES = ['black', 'loop', 'freeze'];
  const SCALES = ['contain', 'cover', 'fill'];
  const str = (v) => (v == null ? '' : String(v));
  const obj = (v) => (v && typeof v === 'object' ? v : {});
  const oneOf = (v, list, d) => (list.includes(v) ? v : d);
  const ids = (list) => list.map((x) => x[0]);

  TC.newSlide = (type) => ({
    type, sectionTitle: '', names: [], bigTitle: type === 'title' ? 'THE CAST' : '', subtitle: '',
    color: 'white', bg: 'black', fontSize: 'medium',
  });

  TC.normalizeSlide = function (raw) {
    const s = obj(raw);
    return {
      type: oneOf(s.type, SLIDE_TYPES, 'names'),
      sectionTitle: str(s.sectionTitle),
      names: Array.isArray(s.names) ? s.names.map(str) : typeof s.names === 'string' ? s.names.split('\n') : [],
      bigTitle: str(s.bigTitle),
      subtitle: str(s.subtitle),
      color: oneOf(s.color, ids(TC.STYLE.colors), 'white'),
      bg: oneOf(s.bg, ids(TC.STYLE.bgs), 'black'),
      fontSize: oneOf(s.fontSize, ids(TC.STYLE.fontSizes), 'medium'),
    };
  };

  TC.newCue = (name, key) => ({
    id: TC.uid(), name: name || 'New cue', key: key || '', end: 'black', scale: 'contain', volume: 100, fileName: '',
  });

  TC.normalizeCue = function (raw) {
    const c = obj(raw);
    return {
      id: /^[\w-]{1,40}$/.test(c.id) ? c.id : TC.uid(),
      name: str(c.name).slice(0, 60) || 'Untitled cue',
      key: TC.reservedReason(c.key) ? '' : TC.normKey(str(c.key)),
      end: oneOf(c.end, END_MODES, 'black'),
      scale: oneOf(c.scale, SCALES, 'contain'),
      volume: TC.clamp(Number(c.volume), 0, 100, 100),
      fileName: str(c.fileName),
    };
  };

  TC.defaults = () => ({
    version: 3,
    settings: { videoFade: 0.5, creditsFade: 0.6, stopOthers: true, confirmClose: true },
    // The two cues from v2, now just entries in a list.
    cues: [
      Object.assign(TC.newCue('Newspaper', ' '), { id: 'newspaper' }),
      Object.assign(TC.newCue('Flashback', ''), { id: 'flashback' }),
    ],
    slides: [],
    music: { volume: 80, loop: true, fade: true, fadeSeconds: 3, fileName: '' },
    roll: { speed: 8, withMusic: true },
  });

  /** Turn anything (saved state, an imported show file) into valid state. */
  TC.hydrate = function (data) {
    const d = TC.defaults();
    if (!data || typeof data !== 'object') return d;
    const s = Object.assign({}, d.settings, obj(data.settings));
    const m = Object.assign({}, d.music, obj(data.music));
    const r = Object.assign({}, d.roll, obj(data.roll));
    let cues = Array.isArray(data.cues) && data.cues.length ? data.cues.map(TC.normalizeCue) : d.cues;
    const seen = new Set();
    cues = cues.map((c) => { if (seen.has(c.id)) c.id = TC.uid(); seen.add(c.id); return c; });
    // Two cues can't share a hotkey; keep it on the first one.
    const keys = new Set();
    cues.forEach((c) => { if (c.key && keys.has(c.key)) c.key = ''; if (c.key) keys.add(c.key); });
    return {
      version: 3,
      settings: {
        videoFade: TC.clamp(Number(s.videoFade), 0, 5, d.settings.videoFade),
        creditsFade: TC.clamp(Number(s.creditsFade), 0, 5, d.settings.creditsFade),
        stopOthers: s.stopOthers !== false,
        confirmClose: s.confirmClose !== false,
      },
      cues,
      slides: Array.isArray(data.slides) ? data.slides.map(TC.normalizeSlide) : [],
      music: {
        volume: TC.clamp(Number(m.volume), 0, 100, 80),
        loop: m.loop !== false,
        fade: m.fade !== false,
        fadeSeconds: TC.clamp(Number(m.fadeSeconds), 0.5, 15, 3),
        fileName: str(m.fileName),
      },
      roll: { speed: TC.clamp(Number(r.speed), 2, 30, 8), withMusic: r.withMusic !== false },
    };
  };

  function readStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  TC.state = TC.hydrate(readStorage());

  let indicatorTimer;
  TC.saveNow = function () {
    let ok = true;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(TC.state)); } catch (e) { ok = false; }
    const ind = document.getElementById('save-indicator');
    if (ind) {
      ind.textContent = ok ? 'Saved' : 'Autosave unavailable';
      ind.className = 'save-indicator show' + (ok ? '' : ' warn');
      clearTimeout(indicatorTimer);
      indicatorTimer = setTimeout(() => ind.classList.remove('show'), ok ? 1200 : 5000);
    }
    return ok;
  };
  TC.save = TC.debounce(TC.saveNow, 400);

  /** Full show file: everything except the media itself. */
  TC.showFile = () => ({
    app: 'theatre-control', version: 3, savedAt: new Date().toISOString(),
    settings: TC.state.settings, cues: TC.state.cues, slides: TC.state.slides, music: TC.state.music, roll: TC.state.roll,
  });
})(window.TC);
