/* Scupper Jump — wiring: canvas, input, PWA install, service worker */
(function (SL) {
  'use strict';
  SL.VERSION = '1.2.0';

  const canvas = document.getElementById('game');

  function init() {
    SL.save.load();
    SL.render.setup(canvas);
    SL.ui.bindHud();
    SL.ui.bind();

    /* brand mark */
    const mark = document.getElementById('brand-mark');
    const lc = document.createElement('canvas');
    mark.appendChild(lc);
    SL.stick.logo(lc, 66);

    bindKeys();
    bindTouch();
    bindWindow();

    SL.game.showcase(SL.save.data.unlocked || 1);
    SL.game.startLoop();

    const first = !SL.save.data.seen.howto;
    SL.ui.show('title', false);

    let go = null;
    try { go = new URLSearchParams(location.search).get('go'); } catch (e) { /* ignore */ }
    if (go === 'shop' || go === 'levels') {
      SL.ui.show(go, true);
    } else if (first) {
      SL.save.data.seen.howto = true;
      SL.save.save();
      setTimeout(() => SL.ui.show('howto', true), 450);
    }
  }

  /* ---------------- keyboard ---------------- */
  const KEYS = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump', KeyJ: 'jump'
  };
  function bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (KEYS[e.code]) e.preventDefault(); return; }
      if (SL.game.awaitingRetry && e.code !== 'Escape' && e.code !== 'KeyP') {
        e.preventDefault();
        SL.game.retry();
        return;
      }
      const a = KEYS[e.code];
      if (a) {
        e.preventDefault();
        if (SL.game.mode === 'play') document.getElementById('touch').hidden = !SL.ui.touchWanted();
        SL.game.setKey(a, true);
        return;
      }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        if (SL.game.mode === 'play') SL.ui.pauseGame();
        else if (SL.game.mode === 'pause') { SL.ui.hideScreens(true); SL.game.resume(); }
        else if (SL.ui.current && SL.ui.current !== 'title') SL.ui.back();
      }
      if (e.code === 'KeyR' && (SL.game.mode === 'play' || SL.game.mode === 'pause')) {
        e.preventDefault(); SL.ui.hideScreens(true); SL.game.restart();
      }
      if (e.code === 'KeyM') { SL.save.setSetting('sfx', !SL.save.setting('sfx')); SL.audio.applySettings(); }
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      const a = KEYS[e.code];
      if (a) { e.preventDefault(); SL.game.setKey(a, false); }
    }, { passive: false });

    window.addEventListener('blur', () => {
      ['left', 'right', 'jump'].forEach(k => SL.game.setKey(k, false));
    });
  }

  /* ---------------- touch pad ---------------- */
  function bindTouch() {
    const pad = document.getElementById('touch');
    pad.querySelectorAll('.tbtn').forEach(btn => {
      const key = btn.dataset.key;
      const down = (e) => {
        e.preventDefault();
        SL.ui.noteTouch();
        btn.classList.add('on');
        SL.game.setTouch(key, true);
        if (key === 'jump' && SL.save.setting('haptic')) SL.util.vibrate(6);
      };
      const up = (e) => {
        if (e) e.preventDefault();
        btn.classList.remove('on');
        SL.game.setTouch(key, false);
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    window.addEventListener('touchstart', () => {
      SL.ui.noteTouch();
      if (SL.game.mode === 'play') document.getElementById('touch').hidden = false;
    }, { passive: true, once: true });
  }

  /* ---------------- window / lifecycle ---------------- */
  function bindWindow() {
    /* Nothing clears the body on its own. Any tap or click does — except the
       pause button and anything on an open menu. Capture phase, so the touch
       pad does not swallow it. */
    document.addEventListener('pointerdown', (e) => {
      if (!SL.game.awaitingRetry) return;
      const t = e.target;
      if (t && t.closest && t.closest('#screens, #btn-pause')) return;
      e.preventDefault();
      e.stopPropagation();
      SL.game.retry();
    }, true);

    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(() => SL.render.resize(), 60); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && SL.game.mode === 'play') SL.ui.pauseGame();
      if (document.hidden) SL.save.flush();
    });
    window.addEventListener('pagehide', () => SL.save.flush());

    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

    ['pointerdown', 'keydown'].forEach(ev =>
      window.addEventListener(ev, () => SL.audio.unlock(), { once: true }));
  }

  /* ---------------- PWA ---------------- */
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    const b = document.getElementById('btn-install');
    b.hidden = false;
    b.onclick = async () => {
      b.hidden = true;
      deferred.prompt();
      try { await deferred.userChoice; } catch (err) { /* ignore */ }
      deferred = null;
    };
  });
  window.addEventListener('appinstalled', () => {
    const b = document.getElementById('btn-install');
    if (b) b.hidden = true;
  });

  /* ?dev in the URL skips the service worker so edits show up on reload */
  const DEV = /[?&]dev\b/.test(location.search);
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !DEV) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('[sw]', err));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.SL);
