/* Scupper Jump — small helpers */
window.SL = window.SL || {};
(function (SL) {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

  /* deterministic PRNG so every player sees the same Level 7 */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* rng bundle built on a seed */
  function rngFor(seed) {
    const r = mulberry32(seed);
    return {
      next: r,
      range: (a, b) => a + r() * (b - a),
      int: (a, b) => Math.floor(a + r() * (b - a + 1)),
      pick: (arr) => arr[Math.floor(r() * arr.length)],
      chance: (p) => r() < p,
      sign: () => (r() < 0.5 ? -1 : 1)
    };
  }

  const aabb = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function fmtTime(s) {
    if (!isFinite(s)) return '—';
    const m = Math.floor(s / 60);
    const sec = s - m * 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec.toFixed(1);
  }

  const fmtNum = (n) => Math.round(n).toLocaleString('en-AU');

  /* tiny event bus */
  function bus() {
    const map = new Map();
    return {
      on(k, fn) { (map.get(k) || map.set(k, []).get(k)).push(fn); return () => this.off(k, fn); },
      off(k, fn) { const a = map.get(k); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
      emit(k, p) { const a = map.get(k); if (a) for (const fn of a.slice()) fn(p); }
    };
  }

  function el(tag, cls, txt) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  const vibrate = (ms) => {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ }
  };

  SL.util = { clamp, lerp, damp, mulberry32, rngFor, aabb, fmtTime, fmtNum, bus, el, vibrate };
})(window.SL);
