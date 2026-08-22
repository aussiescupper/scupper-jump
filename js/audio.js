/* Scupper Jump — everything synthesised, nothing downloaded */
(function (SL) {
  'use strict';

  let ctx = null, master = null, sfxBus = null, musicBus = null;
  let started = false, musicTimer = 0, musicStep = 0;

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.0; musicBus.connect(master);
    return ctx;
  }

  function unlock() {
    init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    started = true;
    applySettings();
  }

  function applySettings() {
    if (!ctx) return;
    const s = SL.save.data.settings;
    sfxBus.gain.setTargetAtTime(s.sfx ? 0.55 : 0, ctx.currentTime, 0.02);
    musicBus.gain.setTargetAtTime(s.music ? 0.15 : 0, ctx.currentTime, 0.05);
    if (s.music) startMusic(); else stopMusic();
  }

  /* ---- primitives ---- */
  function tone(o) {
    if (!ctx || !started) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + o.dur);
    const peak = o.gain == null ? 0.5 : o.gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.012, o.dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g).connect(o.bus || sfxBus);
    osc.start(t0); osc.stop(t0 + o.dur + 0.02);
  }

  let noiseBuf = null;
  function noise(dur, gain, filterHz, sweepTo) {
    if (!ctx || !started) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(filterHz, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t0); src.stop(t0 + dur);
  }

  /* ---- the kit ---- */
  const KIT = {
    jump:    () => tone({ type: 'square',   f: 340, f2: 660, dur: 0.10, gain: 0.28 }),
    djump:   () => tone({ type: 'triangle', f: 520, f2: 900, dur: 0.11, gain: 0.30 }),
    land:    () => noise(0.07, 0.16, 900, 200),
    step:    () => noise(0.03, 0.05, 1400, 700),
    coin:    () => { tone({ type: 'square', f: 988, dur: 0.05, gain: 0.20 }); tone({ type: 'square', f: 1319, dur: 0.10, gain: 0.20, delay: 0.045 }); },
    gem:     () => { [880, 1175, 1568, 2093].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.14, gain: 0.18, delay: i * 0.05 })); },
    spring:  () => tone({ type: 'sine', f: 200, f2: 1200, dur: 0.24, gain: 0.34 }),
    crumble: () => noise(0.28, 0.13, 2200, 260),
    shield:  () => { tone({ type: 'sawtooth', f: 700, f2: 220, dur: 0.22, gain: 0.24 }); noise(0.18, 0.12, 2600, 400); },
    splat:   () => { noise(0.34, 0.34, 2800, 180); tone({ type: 'sawtooth', f: 170, f2: 48, dur: 0.3, gain: 0.24 }); },
    squelch: () => noise(0.14, 0.16, 1400, 260),
    die:     () => { tone({ type: 'sawtooth', f: 420, f2: 60, dur: 0.45, gain: 0.28 }); noise(0.3, 0.14, 1200, 120); },
    hurt:    () => tone({ type: 'square', f: 200, f2: 90, dur: 0.18, gain: 0.3 }),
    win:     () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.26, gain: 0.24, delay: i * 0.085 })); },
    star:    () => tone({ type: 'triangle', f: 1568, f2: 2093, dur: 0.16, gain: 0.2 }),
    ui:      () => tone({ type: 'sine', f: 620, dur: 0.045, gain: 0.16 }),
    back:    () => tone({ type: 'sine', f: 380, dur: 0.05, gain: 0.14 }),
    buy:     () => { [784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.2, gain: 0.2, delay: i * 0.06 })); },
    nope:    () => tone({ type: 'square', f: 150, f2: 110, dur: 0.14, gain: 0.2 }),
    check:   () => { tone({ type: 'triangle', f: 660, dur: 0.1, gain: 0.2 }); tone({ type: 'triangle', f: 990, dur: 0.16, gain: 0.2, delay: 0.09 }); }
  };

  function play(name) {
    if (!started || !SL.save.data.settings.sfx) return;
    const fn = KIT[name];
    if (fn) { try { fn(); } catch (e) { /* audio can die on some devices; never break the game */ } }
  }

  /* ---- sparse ambient arpeggio ---- */
  const SCALE = [0, 3, 5, 7, 10, 12, 15, 12, 10, 7, 5, 3];
  function startMusic() {
    if (musicTimer || !ctx) return;
    musicStep = 0;
    musicTimer = setInterval(() => {
      if (!SL.save.data.settings.music || !started) return;
      const root = 130.81;                       // C3
      const semi = SCALE[musicStep % SCALE.length];
      const f = root * Math.pow(2, semi / 12);
      tone({ type: 'triangle', f, dur: 0.55, gain: 0.5, bus: musicBus });
      if (musicStep % 4 === 0) tone({ type: 'sine', f: f / 2, dur: 1.1, gain: 0.4, bus: musicBus });
      musicStep++;
    }, 340);
  }
  function stopMusic() { clearInterval(musicTimer); musicTimer = 0; }

  SL.audio = { unlock, play, applySettings, get ready() { return started; } };
})(window.SL);
