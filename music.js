/*
 * Theatre Control — credits music.
 * Plays through the control computer's audio output (not the projector window).
 */
(function (TC) {
  'use strict';

  let url = null;
  let audio = null;
  let fadeTimer = null;
  const ui = {};
  const M = () => TC.state.music;

  function init() {
    ['drop', 'input', 'file', 'play', 'stop', 'volume', 'vol-label', 'loop', 'fade', 'fade-secs', 'time'].forEach((k) => {
      ui[k] = TC.$('#music-' + k);
    });
    ui.input.onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) setFile(f); };
    TC.wireDrop(ui.drop, setFile);
    ui.play.onclick = () => (isPlaying() ? pause() : play());
    ui.stop.onclick = () => stop();
    ui.volume.oninput = () => {
      M().volume = +ui.volume.value;
      ui['vol-label'].textContent = M().volume;
      if (audio && !fadeTimer) audio.volume = M().volume / 100;
      TC.save();
    };
    ui.loop.onchange = () => { M().loop = ui.loop.checked; if (audio) audio.loop = M().loop; TC.save(); };
    ui.fade.onchange = () => { M().fade = ui.fade.checked; TC.save(); };
    ui['fade-secs'].onchange = () => {
      M().fadeSeconds = TC.clamp(parseFloat(ui['fade-secs'].value), 0.5, 15, 3);
      ui['fade-secs'].value = M().fadeSeconds;
      TC.save();
    };
    sync();
  }

  function sync() {
    ui.volume.value = M().volume;
    ui['vol-label'].textContent = M().volume;
    ui.loop.checked = M().loop;
    ui.fade.checked = M().fade;
    ui['fade-secs'].value = M().fadeSeconds;
    if (audio) { audio.loop = M().loop; if (!fadeTimer) audio.volume = M().volume / 100; }
    updateUI();
  }

  function setFile(file) {
    if (!TC.isAudio(file)) { TC.toast('"' + file.name + '" doesn\'t look like an audio file.', 'warn'); return; }
    if (audio) { cancelFade(); audio.pause(); }
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(file);
    audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = M().volume / 100;
    audio.loop = M().loop;
    ['play', 'pause', 'ended'].forEach((ev) => audio.addEventListener(ev, updateUI));
    ['timeupdate', 'loadedmetadata'].forEach((ev) => audio.addEventListener(ev, updateTime));
    audio.addEventListener('error', () => TC.toast('This browser can\'t play "' + file.name + '".', 'error'));
    M().fileName = file.name;
    TC.save();
    updateUI();
  }

  function play() {
    if (!audio) { TC.toast('Load a music file first.', 'warn'); return; }
    cancelFade();
    audio.volume = M().volume / 100;
    audio.loop = M().loop;
    const p = audio.play();
    if (p && p.catch) p.catch((err) => TC.toast('Music could not play: ' + err.message, 'error'));
  }

  function pause() {
    if (!audio) return;
    cancelFade();
    audio.pause();
  }

  /** Stop, fading out if enabled. Pressing Stop again during a fade cuts immediately. */
  function stop(forceFade) {
    if (!audio) return;
    const useFade = forceFade != null ? forceFade : M().fade;
    if (fadeTimer || !useFade || audio.paused) { hardStop(); return; }
    const from = audio.volume;
    const ms = M().fadeSeconds * 1000;
    const t0 = performance.now();
    fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      audio.volume = from * (1 - k);
      if (k >= 1) hardStop();
    }, 40);
    updateUI();
  }

  function cancelFade() {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }

  function hardStop() {
    cancelFade();
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = M().volume / 100;
    updateUI();
    updateTime();
  }

  function isPlaying() {
    return !!audio && !audio.paused;
  }

  function updateUI() {
    ui.play.disabled = !audio;
    ui.play.textContent = isPlaying() ? '⏸ Pause' : '▶ Play';
    ui.stop.disabled = !audio;
    ui.stop.textContent = fadeTimer ? 'Fading… (click to cut)' : '■ Stop';
    ui.file.textContent = audio ? '✓ ' + M().fileName : M().fileName ? '⚠ Re-select ' + M().fileName : '';
    ui.file.classList.toggle('warn', !audio && !!M().fileName);
  }

  function updateTime() {
    ui.time.textContent = audio && Number.isFinite(audio.duration)
      ? TC.fmtTime(audio.currentTime) + ' / ' + TC.fmtTime(audio.duration)
      : '';
  }

  TC.music = { init, sync, play, pause, stop, isPlaying, hasFile: () => !!audio };
})(window.TC);
