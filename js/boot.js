/* Scupper Jump — wiring: canvas, input, PWA install, service worker */
(function (SL) {
  'use strict';
  SL.VERSION = '1.12.1';

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
    bindGrab();
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
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump', KeyJ: 'jump',
    KeyF: 'attack', KeyX: 'attack', ShiftLeft: 'attack'
  };
  /* Stick Ops reads its own keys — the climbing map has no strafe or turn */
  const OPS_KEYS = {
    KeyW: 'fwd', ArrowUp: 'fwd',
    KeyS: 'back', ArrowDown: 'back',
    KeyA: 'left', KeyQ: 'turnL', ArrowLeft: 'turnL',
    KeyD: 'right', KeyE: 'turnR', ArrowRight: 'turnR',
    Space: 'fire', KeyF: 'fire', KeyX: 'fire', ShiftLeft: 'fire'
  };
  function opsKey(code, down) {
    const a = OPS_KEYS[code];
    if (!a) return false;
    if (a === 'fire') SL.fps.setFire(down);
    else SL.fps.key(a, down);
    return true;
  }

  function bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (KEYS[e.code]) e.preventDefault(); return; }
      if (SL.game.awaitingRetry && e.code !== 'Escape' && e.code !== 'KeyP') {
        e.preventDefault();
        SL.game.retry();
        return;
      }
      if (SL.game.mode === 'fps') {
        if (opsKey(e.code, true)) { e.preventDefault(); return; }
        if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
          e.preventDefault(); SL.fps.pickGun(+e.code.slice(5) - 1); return;
        }
        if (e.code === 'KeyG' || e.code === 'Tab') { e.preventDefault(); SL.fps.cycleGun(1); return; }
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
        if (SL.game.mode === 'play' || SL.game.mode === 'lab' || SL.game.mode === 'fps') SL.ui.pauseGame();
        else if (SL.game.mode === 'pause') { SL.ui.hideScreens(true); SL.game.resume(); }
        else if (SL.ui.current && SL.ui.current !== 'title') SL.ui.back();
      }
      if (e.code === 'KeyR' && SL.game.mode !== 'fps') {   // ragdoll (restart lives in the pause menu)
        e.preventDefault(); SL.game.toggleLimp();
      }
      if (e.code === 'KeyM') { SL.save.setSetting('sfx', !SL.save.setting('sfx')); SL.audio.applySettings(); }
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      if (SL.game.mode === 'fps' && opsKey(e.code, false)) { e.preventDefault(); return; }
      const a = KEYS[e.code];
      if (a) { e.preventDefault(); SL.game.setKey(a, false); }
    }, { passive: false });

    window.addEventListener('blur', () => {
      ['left', 'right', 'jump'].forEach(k => SL.game.setKey(k, false));
      for (const k of ['fwd', 'back', 'left', 'right', 'turnL', 'turnR']) SL.fps.key(k, false);
      SL.fps.setFire(false);
    });
  }

  /* ---------------- touch pad ---------------- */
  function bindTouch() {
    const pad = document.getElementById('touch');
    bindPad(pad);
    const fire = document.getElementById('btn-ops-fire');
    if (fire) {
      const down = (e) => { e.preventDefault(); fire.classList.add('on'); SL.audio.unlock(); SL.fps.setFire(true); };
      const up = (e) => { if (e) e.preventDefault(); fire.classList.remove('on'); SL.fps.setFire(false); };
      fire.addEventListener('pointerdown', down);
      fire.addEventListener('pointerup', up);
      fire.addEventListener('pointercancel', up);
      fire.addEventListener('pointerleave', up);
      fire.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    const fist = document.getElementById('btn-attack');
    if (!fist) return;                       // markup missing: do not take the whole boot down
    const fistDown = (e) => {
      e.preventDefault();
      SL.ui.noteTouch();
      fist.classList.add('on');
      SL.game.setTouch('attack', true);
    };
    const fistUp = (e) => { if (e) e.preventDefault(); fist.classList.remove('on'); SL.game.setTouch('attack', false); };
    fist.addEventListener('pointerdown', fistDown);
    fist.addEventListener('pointerup', fistUp);
    fist.addEventListener('pointercancel', fistUp);
    fist.addEventListener('pointerleave', fistUp);
    fist.addEventListener('contextmenu', (e) => e.preventDefault());

    bindWindowTouchOnce();
  }

  function bindPad(pad) {
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
  }

  function bindWindowTouchOnce() {
    window.addEventListener('touchstart', () => {
      SL.ui.noteTouch();
      if (SL.game.mode === 'play') document.getElementById('touch').hidden = false;
    }, { passive: true, once: true });
  }

  /* ---------------- grabbing bodies in the smash lab ---------------- */
  function bindGrab() {
    const S = SL.game.S;
    const world = (e) => SL.render.toWorld(e.clientX, e.clientY, S.camY);
    canvas.addEventListener('pointerdown', (e) => {
      if (SL.game.mode !== 'lab') return;
      const w = world(e);
      if (SL.lab.grabAt(S, w.x, w.y)) {
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (SL.game.mode !== 'lab' || !SL.lab.isGrabbing(S)) return;
      e.preventDefault();
      const w = world(e);
      SL.lab.moveGrab(S, w.x, w.y);
    });
    const drop = () => { if (SL.game.mode === 'lab') SL.lab.release(S); };
    canvas.addEventListener('pointerup', drop);
    canvas.addEventListener('pointercancel', drop);
    canvas.addEventListener('pointerleave', drop);
    bindOpsPointer(canvas);
  }

  /* ---------------- first person: two thumbs, or a mouse ----------------
     Touch splits the column down the middle — drag the left half to walk, the
     right half to look, and a tap on the right that did not travel is a shot.
     A mouse takes the pointer lock instead and behaves like every other
     shooter. */
  function bindOpsPointer(canvas) {
    const st = { move: null, look: null, mx: 0, my: 0, lx: 0, drag: 0 };
    const STICK_R = 52;                    // pixels of drag for full tilt
    const isMouse = (e) => e.pointerType === 'mouse';

    canvas.addEventListener('pointerdown', (e) => {
      if (SL.game.mode !== 'fps' || SL.fps.over) return;
      if (isMouse(e)) {
        if (document.pointerLockElement !== canvas) {
          if (canvas.requestPointerLock) canvas.requestPointerLock();
          return;
        }
        SL.fps.setFire(true);
        return;
      }
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const left = (e.clientX - r.left) < r.width * 0.5;
      if (left && st.move === null) {
        st.move = e.pointerId; st.mx = e.clientX; st.my = e.clientY;
        SL.fps.stick(0, 0);
      } else if (!left && st.look === null) {
        st.look = e.pointerId; st.lx = e.clientX; st.drag = 0;
      } else return;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (SL.game.mode !== 'fps') return;
      if (e.pointerId === st.move) {
        e.preventDefault();
        SL.fps.stick((e.clientX - st.mx) / STICK_R, (e.clientY - st.my) / STICK_R);
      } else if (e.pointerId === st.look) {
        e.preventDefault();
        const dx = e.clientX - st.lx;
        st.lx = e.clientX;
        st.drag += Math.abs(dx);
        SL.fps.look(dx * 0.0052);
      }
    });

    const release = (e) => {
      if (SL.game.mode !== 'fps') return;
      if (isMouse(e)) { SL.fps.setFire(false); return; }
      if (e.pointerId === st.move) { st.move = null; SL.fps.stick(0, 0); }
      else if (e.pointerId === st.look) {
        if (st.drag < 7) { SL.fps.setFire(true); tapShot(); }   // a tap, not a look
        st.look = null;
      }
    };
    let tapT = 0;
    function tapShot() {
      clearTimeout(tapT);
      tapT = setTimeout(() => SL.fps.setFire(false), 70);
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    /* the locked mouse */
    document.addEventListener('mousemove', (e) => {
      if (SL.game.mode !== 'fps' || document.pointerLockElement !== canvas) return;
      SL.fps.look(e.movementX * 0.0023);
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas) SL.fps.setFire(false);
    });
    canvas.addEventListener('wheel', (e) => {
      if (SL.game.mode !== 'fps') return;
      e.preventDefault();
      SL.fps.cycleGun(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
  }

  /* ---------------- window / lifecycle ---------------- */
  function bindWindow() {
    /* Nothing clears the body on its own. Any tap or click does — except the
       pause button and anything on an open menu. Capture phase, so the touch
       pad does not swallow it. */
    document.addEventListener('pointerdown', (e) => {
      if (SL.game.mode === 'lab') return;
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
