/*
 * Theatre Control — settings tab and whole-show save/load.
 */
(function (TC) {
  'use strict';

  const S = () => TC.state.settings;

  function init() {
    bindNumber('#set-video-fade', 'videoFade', 0, 5);
    bindNumber('#set-credits-fade', 'creditsFade', 0, 5);
    bindCheck('#set-stop-others', 'stopOthers');
    bindCheck('#set-confirm-close', 'confirmClose');
    TC.$('#export-show').onclick = () => TC.download('show-' + TC.dateStamp() + '.json', JSON.stringify(TC.showFile(), null, 2));
    TC.$('#import-show').onclick = () => TC.$('#import-show-input').click();
    TC.$('#import-show-input').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importShow(f); };
    TC.$('#reset-all').onclick = resetAll;
    sync();
  }

  function bindNumber(sel, key, min, max) {
    const input = TC.$(sel);
    input.onchange = () => {
      S()[key] = TC.clamp(parseFloat(input.value), min, max, TC.defaults().settings[key]);
      input.value = S()[key];
      TC.save();
    };
  }

  function bindCheck(sel, key) {
    const input = TC.$(sel);
    input.onchange = () => { S()[key] = input.checked; TC.save(); };
  }

  function sync() {
    TC.$('#set-video-fade').value = S().videoFade;
    TC.$('#set-credits-fade').value = S().creditsFade;
    TC.$('#set-stop-others').checked = S().stopOthers;
    TC.$('#set-confirm-close').checked = S().confirmClose;
  }

  async function importShow(file) {
    let data;
    try { data = JSON.parse(await TC.readText(file)); } catch (e) { TC.toast('That file isn\'t valid JSON.', 'error'); return; }
    if (!data || typeof data !== 'object') { TC.toast('Not a Theatre Control file.', 'error'); return; }

    // A credits-only file (from v2 or "Save Credits") — just load the slides.
    if (!Array.isArray(data.cues)) {
      if (!Array.isArray(data.slides)) { TC.toast('Not a Theatre Control file.', 'error'); return; }
      if (TC.state.slides.length && !confirm('That\'s a credits file. Replace your current slides with it?')) return;
      TC.credits.replaceSlides(data.slides.map(TC.normalizeSlide));
      TC.toast('Loaded ' + data.slides.length + ' slide(s).', 'ok');
      return;
    }

    if (!confirm('Load "' + file.name + '"? This replaces your cues, credits and settings.')) return;
    TC.cues.stopAll();
    TC.credits.hide();
    TC.state = TC.hydrate(data);
    TC.saveNow();
    TC.app.renderAll();
    TC.toast('Show loaded. Re-select any videos or music marked ⚠.', 'ok', 6000);
  }

  function resetAll() {
    if (!confirm('Reset everything? This clears all cues, credits slides and settings saved in this browser.\n\nTip: use "Save Show File" first if you want a backup.')) return;
    TC.cues.stopAll();
    TC.credits.hide();
    TC.state = TC.defaults();
    TC.saveNow();
    TC.app.renderAll();
    TC.toast('Reset to defaults.');
  }

  TC.settings = { init, sync };
})(window.TC);
