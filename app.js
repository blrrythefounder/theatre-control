/*
 * Theatre Control — app shell: tabs, show bar, projector events, startup.
 */
(function (TC) {
  'use strict';

  let blackout = false;

  function init() {
    TC.$$('.tab').forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
    TC.$('#proj-btn').onclick = () => (TC.projector.isOpen() ? closeProjector() : TC.projector.open());
    TC.$('#blackout-btn').onclick = toggleBlackout;
    TC.$('#stopall-btn').onclick = stopAll;
    TC.$('#help-btn').onclick = () => toggleHelp();
    TC.$('#help-modal').addEventListener('click', (e) => {
      if (e.target.id === 'help-modal' || e.target.closest('[data-close]')) toggleHelp(false);
    });
    TC.$('#add-cue-btn').onclick = () => TC.cues.add();

    // A file dropped outside a drop zone would make the browser navigate away
    // from the control page mid-show. Swallow it.
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    window.addEventListener('beforeunload', (e) => {
      TC.saveNow();
      if (TC.projector.isOpen() && TC.state.settings.confirmClose) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    TC.cues.render();
    TC.credits.init();
    TC.music.init();
    TC.settings.init();

    let tab = 'cues';
    try { tab = sessionStorage.getItem('tc-tab') || 'cues'; } catch (e) { /* ignore */ }
    switchTab(TC.$('.tab[data-tab="' + tab + '"]') ? tab : 'cues');
    refresh();
  }

  function switchTab(name) {
    TC.$$('.tab').forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    TC.$$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + name));
    if (name === 'credits') TC.credits.renderPreview(); // needs layout to fit text
    try { sessionStorage.setItem('tc-tab', name); } catch (e) { /* ignore */ }
  }

  function closeProjector() {
    if (TC.cues.anyActive() && !confirm('A cue is on screen. Close the projector anyway?')) return;
    TC.projector.close();
  }

  function toggleBlackout() {
    if (!TC.projector.isOpen()) { TC.toast('Open the projector first.', 'warn'); return; }
    blackout = !blackout;
    TC.projector.call('blackout', blackout, { fade: TC.state.settings.videoFade });
    refresh();
  }

  function stopAll() {
    if (TC.cues.stopAll()) TC.toast('All video stopped.');
  }

  function toggleHelp(force) {
    const m = TC.$('#help-modal');
    const open = force == null ? m.hidden : force;
    m.hidden = !open;
    if (open) TC.$('#help-close').focus();
  }

  function refresh() {
    const open = TC.projector.isOpen();
    const pb = TC.$('#proj-btn');
    pb.textContent = open ? 'Close Projector' : 'Open Projector';
    pb.classList.toggle('active', open);
    const bb = TC.$('#blackout-btn');
    bb.disabled = !open;
    bb.classList.toggle('active', blackout);
    bb.textContent = blackout ? 'Blackout On' : 'Blackout';
    TC.$('#stopall-btn').disabled = !TC.cues.anyActive();

    let dot = 'nowin';
    let text = 'Projector closed';
    if (open) {
      const onScreen = TC.cues.activeNames();
      if (blackout) { dot = 'blackout'; text = 'Blackout — press B to reveal'; }
      else if (onScreen.length) { dot = 'playing'; text = 'On screen: ' + onScreen.join(', '); }
      else if (TC.credits.isRolling()) { dot = 'playing'; text = 'Credits rolling'; }
      else if (TC.credits.isShowing()) { dot = 'playing'; text = 'Credits on screen'; }
      else { dot = 'ready'; text = 'Projector open — screen is black'; }
    }
    TC.$('#proj-dot').className = 'dot ' + dot;
    TC.$('#proj-text').textContent = text;
  }

  function renderAll() {
    TC.cues.render();
    TC.cues.loadAllIntoProjector();
    TC.credits.syncFromState();
    TC.music.sync();
    TC.settings.sync();
    refresh();
  }

  /* ── Projector lifecycle (called by js/projector.js) ── */

  TC.onProjectorOpened = () => {
    blackout = false;
    TC.cues.loadAllIntoProjector();
    TC.cues.refreshStatus();
    TC.credits.refresh();
    refresh();
    TC.toast('Projector open. Drag it to the projector screen, then double-click it (or press F) for fullscreen.', 'ok', 7000);
  };

  TC.onProjectorClosed = () => {
    blackout = false;
    TC.cues.onProjectorClosed();
    TC.credits.onProjectorClosed();
    refresh();
  };

  TC.onProjectorEvent = (e) => {
    switch (e.type) {
      case 'time': TC.cues.onTime(e.id, e.t, e.d); break;
      case 'ended': TC.cues.onEnded(e.id); break;
      case 'error': TC.cues.onError(e.id, e.message); break;
      case 'rollEnded': TC.credits.onRollEnded(); break;
      case 'key': TC.keys.handleRemote(e); break;
      default:
    }
  };

  TC.app = {
    refresh,
    renderAll,
    toggleBlackout,
    stopAll,
    toggleHelp,
    helpOpen: () => !TC.$('#help-modal').hidden,
    isBlackout: () => blackout,
  };

  document.addEventListener('DOMContentLoaded', init);
})(window.TC);
