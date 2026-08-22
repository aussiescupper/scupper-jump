/* Scupper Jump — every sound synthesised, nothing downloaded.
   Voices are plain data so the exact same specs can be rendered into an
   OfflineAudioContext and measured, rather than trusted by ear. */
(function (SL) {
  'use strict';

  let ctx = null, master = null, sfxBus = null, musicBus = null;
  let started = false, musicTimer = 0, musicStep = 0, prime = null;
  let lastSound = 0, idleTimer = 0;
  const IDLE_MS = 2200;             // silence for this long and the route is released

  /* ---------------- voice specs ----------------
     gain is the voice's peak into its bus. These are deliberately loud: the
     previous set peaked around 0.07 of full scale and was inaudible on a
     tablet speaker. */
  const KIT = {
    jump:    [{ type: 'square',   f: 330,  f2: 720,  dur: 0.11, gain: 0.55 }],
    djump:   [{ type: 'triangle', f: 520,  f2: 980,  dur: 0.12, gain: 0.6 }],
    land:    [{ noise: true, dur: 0.09, gain: 1.0, lp: 1900, lpTo: 320 }],
    step:    [{ noise: true, dur: 0.04, gain: 0.3, lp: 2600, lpTo: 1200 }],
    coin:    [{ type: 'square',   f: 988,  dur: 0.055, gain: 0.5 },
              { type: 'square',   f: 1319, dur: 0.11, gain: 0.5, delay: 0.05 }],
    gem:     [{ type: 'triangle', f: 880,  dur: 0.13, gain: 0.42 },
              { type: 'triangle', f: 1175, dur: 0.13, gain: 0.42, delay: 0.055 },
              { type: 'triangle', f: 1568, dur: 0.13, gain: 0.42, delay: 0.11 },
              { type: 'triangle', f: 2093, dur: 0.17, gain: 0.42, delay: 0.165 }],
    spring:  [{ type: 'sine',     f: 200,  f2: 1250, dur: 0.26, gain: 0.7 }],
    crumble: [{ noise: true, dur: 0.3,  gain: 1.4, lp: 3000, lpTo: 420 }],
    shield:  [{ type: 'sawtooth', f: 760,  f2: 220,  dur: 0.24, gain: 0.5 },
              { noise: true, dur: 0.2, gain: 0.85, lp: 3200, lpTo: 620 }],
    splat:   [{ noise: true, dur: 0.34, gain: 1.25, lp: 3000, lpTo: 260 },
              { type: 'sawtooth', f: 180, f2: 48, dur: 0.3, gain: 0.5 }],
    squelch: [{ noise: true, dur: 0.16, gain: 1.5, lp: 2200, lpTo: 380 }],
    die:     [{ type: 'sawtooth', f: 440, f2: 60, dur: 0.45, gain: 0.45 },
              { noise: true, dur: 0.3, gain: 0.9, lp: 1900, lpTo: 200 }],
    hurt:    [{ type: 'square',   f: 230,  f2: 95,  dur: 0.2, gain: 0.7 }],
    win:     [{ type: 'triangle', f: 523,  dur: 0.26, gain: 0.55 },
              { type: 'triangle', f: 659,  dur: 0.26, gain: 0.55, delay: 0.09 },
              { type: 'triangle', f: 784,  dur: 0.26, gain: 0.55, delay: 0.18 },
              { type: 'triangle', f: 1047, dur: 0.3,  gain: 0.55, delay: 0.27 },
              { type: 'triangle', f: 1319, dur: 0.38, gain: 0.6,  delay: 0.36 }],
    star:    [{ type: 'triangle', f: 1568, f2: 2093, dur: 0.18, gain: 0.62 }],
    ui:      [{ type: 'sine',     f: 660,  dur: 0.055, gain: 0.42 }],
    back:    [{ type: 'sine',     f: 400,  dur: 0.065, gain: 0.42 }],
    buy:     [{ type: 'triangle', f: 784,  dur: 0.2,  gain: 0.5 },
              { type: 'triangle', f: 1047, dur: 0.2,  gain: 0.5, delay: 0.065 },
              { type: 'triangle', f: 1319, dur: 0.26, gain: 0.55, delay: 0.13 }],
    nope:    [{ type: 'square',   f: 170,  f2: 110, dur: 0.17, gain: 0.65 }],
    check:   [{ type: 'triangle', f: 660,  dur: 0.11, gain: 0.5 },
              { type: 'triangle', f: 990,  dur: 0.17, gain: 0.5, delay: 0.095 }]
  };

  /* ---------------- rendering ----------------
     Works against any BaseAudioContext, which is what lets the test suite
     render these offline and check they are not silent. */
  /* Gentle saturation instead of a compressor: near-linear below half scale,
     rounds off above it. A DynamicsCompressor mangled short blips — a 50ms UI
     click measured three times quieter through one. */
  function softClip(actx) {
    const n = 1024, curve = new Float32Array(n);
    const k = 1.7, norm = Math.tanh(k);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / norm;
    }
    const ws = actx.createWaveShaper();
    ws.curve = curve;
    ws.oversample = '2x';
    return ws;
  }

  function noiseBuffer(actx) {
    if (actx.__slNoise) return actx.__slNoise;
    const b = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.5), actx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    actx.__slNoise = b;
    return b;
  }

  function voice(actx, dest, o, at) {
    const t0 = at + (o.delay || 0);
    const g = actx.createGain();
    const peak = o.gain == null ? 0.5 : o.gain;
    /* fast attack, exponential tail — punchier than a symmetric ramp */
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.008, o.dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    g.connect(dest);

    if (o.noise) {
      const src = actx.createBufferSource();
      src.buffer = noiseBuffer(actx);
      const f = actx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.lp || 1200, t0);
      if (o.lpTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.lpTo), t0 + o.dur);
      src.connect(f).connect(g);
      src.start(t0); src.stop(t0 + o.dur + 0.02);
    } else {
      const osc = actx.createOscillator();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(o.f, t0);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + o.dur);
      osc.connect(g);
      osc.start(t0); osc.stop(t0 + o.dur + 0.02);
    }
  }

  /* ---------------- live context ---------------- */
  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = 0.9;
    master.connect(softClip(ctx)).connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
    return ctx;
  }

  /* iOS will not start WebAudio until an element has played inside a gesture,
     and drops the session again when the page is backgrounded. */
  const SILENT = 'data:audio/wav;base64,UklGRvQHAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YdAHAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
  function primeElement() {
    /* iOS needs an element to have played inside a gesture before WebAudio will
       start. It must NOT loop — a permanently playing element holds the output
       route open, and an open route is what makes the speaker hiss. */
    try {
      if (!prime) {
        prime = document.createElement('audio');
        prime.src = SILENT;
        prime.loop = false;
        prime.volume = 0.001;
        prime.setAttribute('playsinline', '');
        prime.playsInline = true;
      }
      const p = prime.play();
      if (p && p.then) p.then(() => setTimeout(hushPrime, 500)).catch(() => {});
      else setTimeout(hushPrime, 500);
    } catch (e) { /* ignore */ }
  }
  function hushPrime() {
    try { if (prime && !prime.paused) { prime.pause(); prime.currentTime = 0; } } catch (e) { /* ignore */ }
  }

  function unlock() {
    init();
    if (!ctx) return;
    primeElement();
    if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) { /* ignore */ } }
    started = true;
    applySettings();
  }

  const wantsSound = () => {
    const s = SL.save.data.settings;
    return !!(s.sfx || s.music);
  };

  function applySettings() {
    if (!ctx) return;
    const s = SL.save.data.settings;
    sfxBus.gain.setTargetAtTime(s.sfx ? 1 : 0, ctx.currentTime, 0.02);
    musicBus.gain.setTargetAtTime(s.music ? 0.3 : 0, ctx.currentTime, 0.05);
    if (s.music) startMusic(); else stopMusic();
    if (!wantsSound()) suspend();          // all off means all off, not gain 0
    else { lastSound = now(); wake(); }
    watchIdle();
  }

  const now = () => (window.performance ? performance.now() : Date.now());

  function wake() {
    if (!ctx) return;
    hushPrime();
    if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) { /* ignore */ } }
  }
  function suspend() {
    if (!ctx || ctx.state !== 'running') return;
    try { ctx.suspend(); } catch (e) { /* ignore */ }
    hushPrime();
  }

  /* An open-but-idle audio route is what a lot of devices turn into a faint
     hiss or hum from the speaker. Let it go when nothing is playing. */
  function watchIdle() {
    if (idleTimer) return;
    idleTimer = setInterval(() => {
      if (!ctx || !started) return;
      if (!wantsSound()) { suspend(); return; }
      if (SL.save.data.settings.music) return;      // music needs it open
      if (now() - lastSound > IDLE_MS) suspend();
    }, 600);
  }

  function play(name) {
    if (!started || !SL.save.data.settings.sfx) return;
    const spec = KIT[name];
    if (!spec || !ctx) return;
    lastSound = now();
    /* a suspended context silently swallows everything — wake it first */
    if (ctx.state !== 'running') wake();
    try {
      const at = ctx.currentTime;
      for (const v of spec) voice(ctx, sfxBus, v, at);
    } catch (e) { /* never let audio break the game */ }
  }

  /* ---------------- music ----------------
     Short plucks in a mid register. The old bed held a 65Hz sine for 1.1s at a
     time, which had more sustained energy than the effects did and read as a
     hum that masked them. */
  const SCALE = [0, 4, 7, 11, 12, 11, 7, 4];
  function startMusic() {
    if (musicTimer || !ctx) return;
    musicStep = 0;
    musicTimer = setInterval(() => {
      if (!SL.save.data.settings.music || !started || !ctx) return;
      const root = 261.63;                       // C4, well clear of the mud
      const semi = SCALE[musicStep % SCALE.length];
      const f = root * Math.pow(2, semi / 12);
      try {
        voice(ctx, musicBus, { type: 'triangle', f, dur: 0.26, gain: 0.5 }, ctx.currentTime);
        if (musicStep % 8 === 0) {
          voice(ctx, musicBus, { type: 'sine', f: f / 2, dur: 0.3, gain: 0.35 }, ctx.currentTime);
        }
      } catch (e) { /* ignore */ }
      musicStep++;
    }, 360);
  }
  function stopMusic() { clearInterval(musicTimer); musicTimer = 0; }

  /* ---------------- diagnostics ---------------- */
  function state() {
    return {
      supported: !!(window.AudioContext || window.webkitAudioContext),
      started,
      ctx: ctx ? ctx.state : 'none',
      sampleRate: ctx ? ctx.sampleRate : 0,
      sfx: !!SL.save.data.settings.sfx,
      music: !!SL.save.data.settings.music,
      idleFor: started ? Math.round((now() - lastSound) / 100) / 10 : 0
    };
  }

  /** Render one effect offline and report its level — used by the tests. */
  function measure(name, seconds) {
    const spec = KIT[name];
    if (!spec) return Promise.resolve(null);
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OC) return Promise.resolve(null);
    const oc = new OC(1, Math.floor(44100 * (seconds || 1.2)), 44100);
    const m = oc.createGain(); m.gain.value = 0.9;
    m.connect(softClip(oc)).connect(oc.destination);
    const b = oc.createGain(); b.gain.value = 1; b.connect(m);
    for (const v of spec) voice(oc, b, v, 0);
    return oc.startRendering().then((buf) => {
      const d = buf.getChannelData(0);
      let peak = 0, sum = 0;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += a * a; }
      return { name, peak: +peak.toFixed(4), rms: +Math.sqrt(sum / d.length).toFixed(5) };
    });
  }

  SL.audio = { unlock, play, applySettings, state, measure, names: () => Object.keys(KIT),
    get ready() { return started; } };
})(window.SL);
