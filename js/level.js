/* Scupper Jump — procedural towers.
   Every level is generated from its own number, so Level 7 is the same tower for everyone.
   The generator proves each jump is possible with *base* physics — no shop gear required. */
(function (SL) {
  'use strict';
  const { clamp, rngFor } = SL.util;

  const W = 288;                    // world column width (a portrait climbing lane)
  const PLAT_T = 11;                // platform thickness

  /* base physics the generator plans against (must match game.js BASE) */
  const BASE = { g: 2000, jump: 745, vx: 252 };

  /* Highest reachable rise, and how far sideways you can travel while
     falling back down onto a ledge that height above you. */
  const MAX_RISE = (BASE.jump * BASE.jump) / (2 * BASE.g);   // ~138
  function reach(dy) {
    const disc = BASE.jump * BASE.jump - 2 * BASE.g * dy;
    if (disc <= 900) return -1;                              // needs headroom to be comfortable
    const t = (BASE.jump + Math.sqrt(disc)) / BASE.g;        // descending crossing
    return BASE.vx * t;
  }

  const THEMES = [
    { key: 'backyard', name: 'The Back Fence',
      sky: ['#1b2a4a', '#3c5170', '#87708a'], far: '#22304d', near: '#141d31',
      accent: '#ffb037', plat: '#7d8cb5', platDark: '#4d5878', dust: 'moth' },
    { key: 'outback', name: 'Outback Run',
      sky: ['#2b1430', '#7a2c2c', '#e0713a'], far: '#4a2130', near: '#2a121c',
      accent: '#ffd166', plat: '#c98b5e', platDark: '#8a5936', dust: 'dust' },
    { key: 'bondi', name: 'Bondi Rise',
      sky: ['#07344d', '#0e6f86', '#4fc3c9'], far: '#0a4c60', near: '#062f3d',
      accent: '#ffe08a', plat: '#e8d3a0', platDark: '#a8946a', dust: 'gull' },
    { key: 'reef', name: 'Reef Ascent',
      sky: ['#021a33', '#053f63', '#0a719b'], far: '#04314e', near: '#021a2e',
      accent: '#5cffc1', plat: '#4b8fa8', platDark: '#2c5a6d', dust: 'bubble' },
    { key: 'city', name: 'Harbour Lights',
      sky: ['#080d1c', '#161f3c', '#2c3a63'], far: '#111a34', near: '#080d1c',
      accent: '#43a6ff', plat: '#6a7699', platDark: '#3f4763', dust: 'city' },
    { key: 'uluru', name: 'Uluru at Dusk',
      sky: ['#160a2b', '#4a1b46', '#b8455a'], far: '#3a1436', near: '#1d0a22',
      accent: '#ff8a3d', plat: '#b8624a', platDark: '#7a3b2c', dust: 'dust' },
    { key: 'snowy', name: 'Snowy Peaks',
      sky: ['#0d2036', '#2c5378', '#9fc6df'], far: '#1c3a56', near: '#0f2135',
      accent: '#a8e6ff', plat: '#cfe3f2', platDark: '#8aa4b8', dust: 'snow' },
    { key: 'cross', name: 'Southern Cross',
      sky: ['#03030f', '#0b0a26', '#1d1147'], far: '#0a0a20', near: '#050512',
      accent: '#c9a4ff', plat: '#5d5a8c', platDark: '#38365c', dust: 'star' }
  ];

  function themeFor(n) { return THEMES[Math.floor((n - 1) / 4) % THEMES.length]; }

  function generate(n) {
    const rng = rngFor(0x5c0FFE + n * 9176);
    const d = clamp((n - 1) / 24, 0, 1);                 // difficulty ramp, saturates at level 25
    const dd = d * d;                                     // for things that should stay rare early

    const height = Math.min(4400, 1150 + n * 148);
    const gapMin = 58 + 27 * d;
    const gapMax = 84 + 31 * d;
    const wMin = 68 - 26 * d;          // kept generous relative to the 18px-wide stickman
    const wMax = 100 - 52 * d;
    const spread = 0.42 + 0.44 * d;                       // how much of the reach a gap may use

    const pMove = n >= 4 ? Math.min(0.42, (n - 3) * 0.045) : 0;
    const pCrumb = n >= 6 ? Math.min(0.34, (n - 5) * 0.045) : 0;
    const pIce = n >= 10 ? Math.min(0.28, (n - 9) * 0.040) : 0;
    const pBounce = n >= 5 ? 0.07 : 0;
    const pSpike = n >= 8 ? Math.min(0.34, (n - 7) * 0.045) : 0;

    const plats = [];
    let id = 0;

    /* ground */
    plats.push({ id: id++, type: 'ground', x: 0, y: 0, w: W, h: PLAT_T, hx: W / 2 });

    let prev = { x: W / 2 - 60, w: 120, y: 0, cx: W / 2, hw: W / 2, range: 0 };
    let dir = rng.sign();
    let riskRun = 0;

    while (prev.y < height) {
      const idx = plats.length;
      const early = idx <= 3;                             // gentle opening on every level

      /* --- size --- */
      let w = early ? clamp(rng.range(88, 115), 70, 130)
                    : Math.round(rng.range(wMin, wMax));

      /* --- rise --- */
      let dy = early ? rng.range(58, 76) : rng.range(gapMin, gapMax);
      dy = clamp(dy, 40, MAX_RISE - 16);
      const y = prev.y + dy;

      /* --- how far sideways is provably survivable --- */
      let allowed = reach(dy) * 0.78;
      if (allowed < 0) { dy = 70; allowed = reach(70) * 0.78; }
      allowed -= prev.range / 2;                          // source may be mid-swing

      /* --- type --- */
      let type = 'normal', range = 0, speed = 0;
      if (!early) {
        const r = rng.next();
        let acc = 0;
        if ((acc += pBounce) > r) type = 'bouncy';
        else if ((acc += pMove) > r) type = 'moving';
        else if (riskRun < 2 && (acc += pCrumb) > r) type = 'crumble';
        else if (riskRun < 2 && (acc += pIce) > r) type = 'ice';
      }
      riskRun = (type === 'crumble' || type === 'ice') ? riskRun + 1 : 0;

      if (type === 'moving') {
        range = Math.round(rng.range(22, 26 + 52 * d));
        speed = rng.range(0.5, 0.75 + 0.7 * d) * (rng.next() < 0.5 ? -1 : 1);
        allowed -= range / 2;                             // target may be mid-swing too
      }
      if (type === 'bouncy') w = Math.max(w, 44);

      /* Spikes are decided before placement: blocks get narrow at high levels,
         so a spiked one is widened to keep a fair landing strip beside them. */
      let spike = null;
      if (!early && pSpike > 0 && (type === 'normal' || type === 'ice') && rng.chance(pSpike)) {
        spike = { side: rng.sign(), frac: 0.3 };
        w = Math.max(w, 64);
      }

      allowed = Math.max(24, allowed);

      /* --- placement --- */
      const gap = allowed * rng.range(0.12, spread);
      let cx = prev.cx + dir * (prev.hw + w / 2 + gap);
      const lo = w / 2 + 6 + range / 2, hi = W - w / 2 - 6 - range / 2;
      if (cx < lo || cx > hi) {
        dir = -dir;
        cx = prev.cx + dir * (prev.hw + w / 2 + gap);
      }
      cx = clamp(cx, lo, Math.max(lo, hi));
      if (rng.chance(0.22)) dir = -dir;

      const p = {
        id: id++, type, x: cx - w / 2, y, w, h: PLAT_T, hx: cx,
        range, speed, phase: rng.range(0, 6.28)
      };
      if (spike) p.spike = spike;

      plats.push(p);
      prev = { x: p.x, w, y, cx, hw: w / 2, range };
    }

    /* --- the goal block --- */
    {
      const w = 78, dy = clamp(rng.range(gapMin, gapMax) * 0.85, 48, MAX_RISE - 26);
      let allowed = Math.max(30, reach(dy) * 0.7 - prev.range / 2);
      const gap = allowed * 0.4;
      let cx = clamp(prev.cx + (rng.sign()) * (prev.hw + w / 2 + gap), w / 2 + 8, W - w / 2 - 8);
      if (Math.abs(cx - prev.cx) - prev.hw - w / 2 > allowed) cx = prev.cx;   // safety net
      plats.push({ id: id++, type: 'goal', x: cx - w / 2, y: prev.y + dy, w, h: PLAT_T + 3, hx: cx });
    }

    const top = plats[plats.length - 1];
    const goalY = top.y;

    /* --- coins --- */
    const coins = [];
    for (let i = 2; i < plats.length - 1; i++) {
      const p = plats[i];
      if (!rng.chance(0.58)) continue;
      let ox = rng.range(-p.w * 0.28, p.w * 0.28);
      if (p.spike) ox = -p.spike.side * Math.abs(ox) * 0.8;   // keep coins on the safe half
      coins.push({ x: p.hx + ox, y: p.y + 28, r: 7, got: false, gem: false, plat: p.id, ox });
    }
    /* a few gems, up high and slightly out of the way */
    const highs = plats.filter(p => p.y > goalY * 0.45 && p.type !== 'goal' && p.type !== 'ground');
    for (let i = 0; i < Math.min(3, highs.length); i++) {
      const p = highs[Math.floor(rng.next() * highs.length)];
      coins.push({ x: clamp(p.hx + rng.sign() * (p.w / 2 + 16), 20, W - 20), y: p.y + rng.range(44, 70), r: 8.5, got: false, gem: true, plat: -1, ox: 0 });
    }

    /* --- sawblades --- */
    const saws = [];
    const sawCount = n >= 12 ? Math.min(7, Math.floor((n - 10) / 2)) : 0;
    for (let i = 0; i < sawCount; i++) {
      const at = plats[Math.floor(rng.range(4, plats.length - 2))];
      const y = at.y + rng.range(26, 52);
      const r = 11;
      const range = rng.range(45, 95);
      const cx = clamp(at.hx + rng.range(-40, 40), range / 2 + r + 5, W - range / 2 - r - 5);
      saws.push({ x: cx, y, r, range, speed: rng.range(0.45, 0.5 + 0.6 * d) * (rng.next() < 0.5 ? -1 : 1), phase: rng.range(0, 6.28) });
    }

    const parTime = 9 + plats.length * 1.15;

    const platById = {};
    for (const p of plats) platById[p.id] = p;

    return {
      n, W, height: goalY, goalY, plats, platById, coins, saws,
      theme: themeFor(n),
      difficulty: d,
      parTime,
      totalCoinValue: coins.reduce((s, c) => s + (c.gem ? 25 : 5), 0),
      coinCount: coins.length,
      seedTag: 'L' + n
    };
  }

  /* live x of a platform / saw at time t */
  function platX(p, t) {
    if (p.type !== 'moving' || !p.range) return p.x;
    return p.hx - p.w / 2 + Math.sin(t * p.speed + p.phase) * (p.range / 2);
  }
  function sawX(s, t) { return s.x + Math.sin(t * s.speed + s.phase) * (s.range / 2); }

  SL.level = { generate, platX, sawX, THEMES, themeFor, W, PLAT_T, BASE, MAX_RISE, reach };
})(window.SL);
