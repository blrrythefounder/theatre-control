/*
 * Theatre Control — keyboard.
 *
 * Fixes from v2:
 *  - Hotkeys are ignored while typing in a text field (v2: pressing Space in the
 *    names box fired the video; arrow keys changed slides mid-sentence).
 *  - Held keys don't re-trigger (v2: holding Space flapped play/stop).
 *  - Buttons and dropdowns give up focus after use, so Space can't "click" a
 *    focused button at the same moment it fires a cue.
 *  - Keys pressed while the projector window has focus are forwarded here.
 *  - PageUp / PageDown work, so a presentation clicker can drive credits.
 */
(function (TC) {
  'use strict';

  let captureFn = null;

  function isTyping(t) {
    if (!t || !t.tagName) return false;
    if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
    if (t.tagName === 'INPUT') return !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'].includes(t.type);
    return false;
  }

  function handle(e) {
    if (captureFn) {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
      e.preventDefault();
      const fn = captureFn;
      captureFn = null;
      fn(e);
      return;
    }

    const t = e.target;
    if (e.key === 'Escape') {
      if (TC.app.helpOpen()) { TC.app.toggleHelp(false); return; }
      if (isTyping(t)) { t.blur(); return; }
      TC.app.stopAll();
      return;
    }
    if (isTyping(t) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (t && t.type === 'range' && e.key.startsWith('Arrow')) return;

    const cueId = TC.cues.matchKey(e.key);
    if (cueId) {
      e.preventDefault();
      if (!e.repeat) TC.cues.toggle(cueId);
      return;
    }

    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown':
        e.preventDefault(); TC.credits.next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
        e.preventDefault(); TC.credits.prev(); break;
      case 'b': case 'B':
        if (!e.repeat) TC.app.toggleBlackout(); break;
      case 'c': case 'C':
        if (!e.repeat) TC.credits.toggleShow(); break;
      case '?':
        TC.app.toggleHelp(); break;
      default:
    }
  }

  document.addEventListener('keydown', handle);

  document.addEventListener('pointerup', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (b) setTimeout(() => b.blur(), 0);
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('select, input[type=checkbox], input[type=range], input[type=file]')) e.target.blur();
  });

  TC.keys = {
    capture: (fn) => { captureFn = fn; },
    handleRemote: (msg) => handle({
      key: msg.key, repeat: !!msg.repeat, ctrlKey: msg.ctrlKey, metaKey: msg.metaKey, altKey: msg.altKey,
      target: null, preventDefault() {},
    }),
  };
})(window.TC);
