/*
 * Theatre Control — projector window.
 *
 * The control page opens a blank pop-up and writes the projector document into
 * it. Writing into about:blank (rather than opening projector.html) keeps both
 * windows on the same origin even when running from file://, which is what
 * lets the control page call functions in the projector and hand it blob: URLs
 * for local video files.
 *
 * `projectorRuntime` below is a plain function that is serialized with
 * toString() and executed inside the pop-up. It must not reference anything
 * outside its own body except the CFG argument.
 */
(function (TC) {
  'use strict';

  let win = null;
  let ready = false;
  let watcher = null;

  /* ───────────── runs INSIDE the projector window ───────────── */
  function projectorRuntime(CFG) {
    'use strict';
    var emit = function () {};
    var videos = {};
    var credits = document.getElementById('credits');
    var roll = document.getElementById('roll');
    var rollInner = document.getElementById('roll-inner');
    var black = document.getElementById('black');
    var creditsToken = 0;
    var rollState = { raf: 0, running: false, offset: 0, last: null, speed: 8 };

    function fade(el, on, seconds) {
      el.style.transitionDuration = Math.max(0, seconds || 0) + 's';
      el.classList.toggle('on', !!on);
    }

    // Fade a video's audio alongside its picture.
    function ramp(v, to, seconds, done) {
      clearInterval(v._ramp);
      if (!seconds) { v.volume = to; if (done) done(); return; }
      var from = v.volume, t0 = performance.now();
      v._ramp = setInterval(function () {
        var k = Math.min(1, (performance.now() - t0) / (seconds * 1000));
        v.volume = from + (to - from) * k;
        if (k >= 1) { clearInterval(v._ramp); if (done) done(); }
      }, 30);
    }

    function line(parent, cls, text, size) {
      var d = document.createElement('div');
      d.className = cls;
      d.textContent = text;
      d.style.fontSize = size + 'vh';
      parent.appendChild(d);
    }

    function build(slide) {
      var sizes = CFG.sizes[slide.fontSize] || CFG.sizes.medium;
      var b = document.createElement('div');
      b.className = 'slide-block';
      b.style.color = CFG.colors[slide.color] || '#ffffff';
      if (slide.type === 'title') {
        line(b, 'sl-title', slide.bigTitle || '', sizes.title);
        if (slide.subtitle) line(b, 'sl-subtitle', slide.subtitle, sizes.subtitle);
      } else if (slide.type === 'names') {
        if (slide.sectionTitle) line(b, 'sl-section', slide.sectionTitle, sizes.section);
        (slide.names || []).forEach(function (n) { n = String(n).trim(); if (n) line(b, 'sl-name', n, sizes.name); });
      }
      return b;
    }

    function fit(frame, block) {
      block.style.transform = '';
      var s = Math.min(1, (frame.clientHeight * 0.9) / block.scrollHeight);
      if (s < 1) block.style.transform = 'scale(' + s + ')';
    }

    function video(id) {
      var v = videos[id];
      if (v) return v;
      v = document.createElement('video');
      v.className = 'layer';
      v.playsInline = true;
      v.preload = 'auto';
      v._target = 1;
      document.body.insertBefore(v, document.body.firstChild);
      v.addEventListener('ended', function () { emit({ type: 'ended', id: id }); });
      v.addEventListener('loadedmetadata', function () { emit({ type: 'time', id: id, t: 0, d: v.duration || 0 }); });
      var last = 0;
      v.addEventListener('timeupdate', function () {
        var now = Date.now();
        if (now - last < 250) return;
        last = now;
        emit({ type: 'time', id: id, t: v.currentTime, d: v.duration || 0 });
      });
      v.addEventListener('error', function () {
        if (v.getAttribute('src')) emit({ type: 'error', id: id, message: 'This browser can\'t play that video file (try MP4/H.264 or WebM).' });
      });
      videos[id] = v;
      return v;
    }

    function stopRoll(seconds) {
      rollState.running = false;
      cancelAnimationFrame(rollState.raf);
      fade(roll, false, seconds);
    }

    window.Projector = {
      connect: function (fn) {
        emit = function (e) { try { fn(e); } catch (err) { console.error(err); } };
      },

      /* Video cues */
      loadCue: function (id, url, opts) {
        var v = video(id);
        if (v.getAttribute('data-url') !== url) {
          v.src = url;
          v.setAttribute('data-url', url);
          v.load();
        }
        this.setCueOptions(id, opts);
      },
      setCueOptions: function (id, opts) {
        var v = videos[id];
        if (!v || !opts) return;
        v.style.objectFit = opts.scale || 'contain';
        v._target = Math.max(0, Math.min(1, (opts.volume == null ? 100 : opts.volume) / 100));
        if (!v._ramp || v.paused) v.volume = v._target;
        v.loop = opts.end === 'loop';
      },
      removeCue: function (id) {
        var v = videos[id];
        if (!v) return;
        v.pause();
        v.removeAttribute('src');
        v.load();
        v.remove();
        delete videos[id];
      },
      playCue: function (id, opts) {
        var v = videos[id];
        if (!v) return false;
        opts = opts || {};
        Object.keys(videos).forEach(function (k) { videos[k].style.zIndex = k === id ? 11 : 10; });
        try { v.currentTime = 0; } catch (e) { /* not loaded yet */ }
        v.volume = opts.fade ? 0 : v._target;
        var p = v.play();
        if (p && p.catch) p.catch(function (err) { emit({ type: 'error', id: id, message: (err && err.message) || String(err) }); });
        ramp(v, v._target, opts.fade);
        fade(v, true, opts.fade);
        if (opts.hideCredits) {
          creditsToken++;
          fade(credits, false, opts.fade);
          stopRoll(opts.fade);
        }
        return true;
      },
      stopCue: function (id, opts) {
        var v = videos[id];
        if (!v) return;
        opts = opts || {};
        fade(v, false, opts.fade);
        ramp(v, 0, opts.fade, function () {
          v.pause();
          try { v.currentTime = 0; } catch (e) { /* ignore */ }
          v.volume = v._target;
        });
      },

      /* Credits */
      showSlide: function (slide, opts) {
        opts = opts || {};
        var token = ++creditsToken;
        var secs = opts.fade || 0;
        var wasOn = credits.classList.contains('on');
        stopRoll(secs);
        function swap() {
          if (token !== creditsToken) return; // a newer slide was requested meanwhile
          credits.innerHTML = '';
          credits.style.background = CFG.bgs[slide.bg] || '#000000';
          // A blank slide is a black card that covers any video underneath.
          if (slide.type !== 'blank') {
            var b = build(slide);
            credits.appendChild(b);
            fit(credits, b);
          }
          fade(credits, true, wasOn ? secs / 2 : secs);
        }
        if (wasOn && secs > 0) { fade(credits, false, secs / 2); setTimeout(swap, secs * 500); } else swap();
      },
      hideCredits: function (opts) {
        var secs = (opts || {}).fade || 0;
        creditsToken++;
        fade(credits, false, secs);
        stopRoll(secs);
      },
      roll: function (slides, opts) {
        opts = opts || {};
        creditsToken++;
        stopRoll(0);
        rollInner.innerHTML = '';
        slides.forEach(function (s) {
          if (s.type === 'blank') {
            var gap = document.createElement('div');
            gap.style.height = '30vh';
            rollInner.appendChild(gap);
          } else {
            rollInner.appendChild(build(s));
          }
        });
        roll.style.background = CFG.bgs[opts.bg] || '#000000';
        fade(credits, false, opts.fade);
        fade(roll, true, opts.fade);
        rollInner.style.transform = 'translateY(0)';
        rollState.offset = 0;
        rollState.last = null;
        rollState.speed = opts.speed || 8;
        rollState.running = true;
        var distance = rollInner.offsetHeight + window.innerHeight;
        function step(ts) {
          if (!rollState.running) return;
          if (rollState.last == null) rollState.last = ts;
          rollState.offset += ((ts - rollState.last) / 1000) * rollState.speed * window.innerHeight / 100;
          rollState.last = ts;
          rollInner.style.transform = 'translateY(' + -rollState.offset + 'px)';
          if (rollState.offset >= distance) { rollState.running = false; emit({ type: 'rollEnded' }); return; }
          rollState.raf = requestAnimationFrame(step);
        }
        rollState.raf = requestAnimationFrame(step);
      },
      setRollSpeed: function (speed) { rollState.speed = speed; },
      stopRoll: function (opts) { stopRoll((opts || {}).fade); },

      /* Whole screen */
      blackout: function (on, opts) { fade(black, on, (opts || {}).fade); },
    };

    function toggleFullscreen() {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
    }
    document.addEventListener('dblclick', toggleFullscreen);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); return; }
      if (e.key === 'F11') return;
      if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].indexOf(e.key) !== -1) e.preventDefault();
      // If the operator clicked into this window, keys still drive the show.
      emit({ type: 'key', key: e.key, repeat: e.repeat, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey });
    });
    window.addEventListener('resize', function () { var b = credits.firstChild; if (b) fit(credits, b); });
    setTimeout(function () { document.getElementById('hint').style.opacity = 0; }, 6000);
  }
  /* ───────────── end projector runtime ───────────── */

  function template() {
    const cfg = JSON.stringify({
      colors: Object.fromEntries(TC.STYLE.colors.map((c) => [c[0], c[2]])),
      bgs: Object.fromEntries(TC.STYLE.bgs.map((b) => [b[0], b[2]])),
      sizes: TC.STYLE.sizes,
    });
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Projector — Theatre Control</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden;cursor:none;font-family:Georgia,serif}
.layer{position:fixed;inset:0;opacity:0;visibility:hidden;transition-property:opacity,visibility;transition-timing-function:ease}
.layer.on{opacity:1;visibility:visible}
video.layer{width:100%;height:100%;object-fit:contain;background:#000;z-index:10}
#credits{z-index:20;display:flex;align-items:center;justify-content:center;padding:5vh 6vw}
#roll{z-index:21;overflow:hidden}
#roll-inner{position:absolute;left:0;right:0;top:100%;display:flex;flex-direction:column;align-items:center;gap:14vh;padding:0 6vw;will-change:transform}
#black{z-index:100;background:#000}
.slide-block{display:flex;flex-direction:column;align-items:center;gap:1.6vh;text-align:center;transform-origin:center;max-width:100%}
.sl-section{letter-spacing:.35em;text-transform:uppercase;opacity:.7;font-family:'Courier New',monospace;margin-bottom:.4em}
.sl-name{letter-spacing:.06em;line-height:1.4}
.sl-title{letter-spacing:.08em;text-transform:uppercase}
.sl-subtitle{letter-spacing:.18em;text-transform:uppercase;opacity:.6;margin-top:.45em;font-family:'Courier New',monospace}
#hint{position:fixed;bottom:18px;left:0;right:0;text-align:center;color:#444;font:12px/1 'Courier New',monospace;letter-spacing:2px;z-index:200;transition:opacity 1.5s;pointer-events:none}
</style></head><body>
<div id="credits" class="layer"></div>
<div id="roll" class="layer"><div id="roll-inner"></div></div>
<div id="black" class="layer"></div>
<div id="hint">PROJECTOR — DRAG TO THE PROJECTOR SCREEN, THEN DOUBLE-CLICK OR PRESS F FOR FULLSCREEN</div>
<script>(${projectorRuntime.toString()})(${cfg});<\/script>
</body></html>`;
  }

  function startWatching() {
    clearInterval(watcher);
    watcher = setInterval(() => {
      if (!win || win.closed) {
        clearInterval(watcher);
        win = null;
        ready = false;
        TC.onProjectorClosed();
      }
    }, 500);
  }

  TC.projector = {
    isOpen: () => !!(ready && win && !win.closed),

    open() {
      if (this.isOpen()) { win.focus(); return true; }
      win = window.open('', 'TheatreControlProjector',
        'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes');
      if (!win) {
        TC.toast('Pop-up blocked — allow pop-ups for this page, then click Open Projector again.', 'error', 7000);
        return false;
      }
      // Always rewrite: a window left over from an earlier session holds dead blob URLs.
      win.document.open();
      win.document.write(template());
      win.document.close();
      if (!win.Projector) {
        TC.toast('The projector window failed to start.', 'error');
        return false;
      }
      win.Projector.connect((e) => TC.onProjectorEvent(e));
      ready = true;
      startWatching();
      TC.onProjectorOpened();
      return true;
    },

    close() {
      clearInterval(watcher);
      if (win && !win.closed) win.close();
      win = null;
      ready = false;
      TC.onProjectorClosed();
    },

    /** Call a Projector method if the window is open. Returns false if not. */
    call(method, ...args) {
      if (!this.isOpen()) return false;
      try {
        win.Projector[method](...args);
        return true;
      } catch (err) {
        console.error('Projector.' + method + ' failed', err);
        return false;
      }
    },
  };
})(window.TC);
