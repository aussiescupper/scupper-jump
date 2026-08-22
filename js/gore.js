/* Scupper Jump — the messy bit.
   The stickman is a proper Verlet ragdoll: eleven points held together by bones.
   Whatever kills him decides where he comes apart — the bones crossing the blade
   are cut, and the pieces simply stop being attached. Nothing here ever stops on
   its own; the player has to click. */
(function (SL) {
  'use strict';
  const { clamp } = SL.util;
  const LV = SL.level;
  const W = LV.W;

  const G = 1750;                  // corpses fall a touch lazier than the living
  const DAMP = 0.996;              // air drag on the ragdoll
  const ITER = 6;                  // constraint relaxation passes
  const BOUNCE = 0.34;
  const WALL_BOUNCE = 0.45;
  const SLIDE_KEEP = 0.985;        // horizontal speed kept per step while a corpse slides
  const LIVE_SLIDE_KEEP = 0.88;    // a body put down on purpose grips and settles
  const GROUND_KEEP = 0.86;
  const EDGE_NUDGE = 0.0022;       // walks a stalled point toward the nearest edge
  const IMPACT_MIN = 55;           // px/s: below this it is resting contact, not a hit
  const SPLAT_IMPACT = 620;        // a fall this hard bursts him open
  const MAX_DECALS = 460;
  const MAX_DROPS = 340;

  const BLOOD = ['#c1121f', '#a4161a', '#e01e37', '#870c14'];
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const rnd = (a, b) => a + Math.random() * (b - a);

  const HEAD_R = 4.7;

  /* Skeleton in stick.js proportions: feet at 0, head on top, world y going up. */
  const HEAD = 0, CHEST = 1, HIP = 2;
  const BONE_W = 3.0;
  const SKELETON = [
    { n: 'head',   x: 0,    y: 25.8, r: HEAD_R },
    { n: 'chest',  x: 0,    y: 20.5, r: 3.0 },
    { n: 'hip',    x: 0,    y: 11.0, r: 3.0 },
    { n: 'elbowL', x: -4.8, y: 16.2, r: 2.0 },
    { n: 'handL',  x: -6.8, y: 11.8, r: 2.0 },
    { n: 'elbowR', x: 4.8,  y: 16.2, r: 2.0 },
    { n: 'handR',  x: 6.8,  y: 11.8, r: 2.0 },
    { n: 'kneeL',  x: -3.2, y: 5.6,  r: 2.4 },
    { n: 'footL',  x: -3.6, y: 0.5,  r: 2.4 },
    { n: 'kneeR',  x: 3.2,  y: 5.6,  r: 2.4 },
    { n: 'footR',  x: 3.6,  y: 0.5,  r: 2.4 }
  ];
  /* a,b indices — stiff:1 is a real limb, lower values are posture only */
  const LINKS = [
    [HEAD, CHEST, 1], [CHEST, HIP, 1],
    [CHEST, 3, 1], [3, 4, 1],
    [CHEST, 5, 1], [5, 6, 1],
    [HIP, 7, 1], [7, 8, 1],
    [HIP, 9, 1], [9, 10, 1],
    [HEAD, HIP, 0.35]            // stops the torso folding flat
  ];

  /* ---------------- setup ---------------- */
  function reset(S) {
    S.gore = { rd: null, parts: [], ropes: [], drops: [], decals: [], t: 0 };
  }
  function softReset(S) {          // between attempts: bodies go, the mess stays
    ensure(S);
    S.gore.rd = null;
    S.gore.parts.length = 0;
    S.gore.ropes.length = 0;
    S.gore.drops.length = 0;
    S.gore.t = 0;
  }
  function ensure(S) { if (!S.gore) reset(S); }

  const lowfx = () => SL.save.data.settings.lowfx;
  const cutsOn = () => SL.save.data.settings.gore !== false;      // dismemberment
  const bloodOn = () => SL.save.data.settings.blood !== false;    // blood + stains
  /* a ragdoll you asked for (R) is alive: it never bleeds and never comes apart */
  const bleeds = (S) => bloodOn() && S.gore.rd && !S.gore.rd.alive;
  const scale = (n) => Math.max(2, Math.round(n * (lowfx() ? 0.35 : 1)));

  /* ---------------- spawning ---------------- */
  /** cutY is a world height — wherever the blade went through. null means intact. */
  /** Build a ragdoll standing with its feet at (cx, feetY). o: {vx, vy, colour, hat, alive} */
  function makeRagdoll(cx, feetY, o) {
    o = o || {};
    const dt = 1 / 120;
    const pts = SKELETON.map((s) => {
      const x = cx + s.x + rnd(-0.4, 0.4);
      const y = feetY + s.y;
      const vx = (o.vx || 0) + rnd(-40, 40);
      const vy = (o.vy || 0) + rnd(-30, 60);
      return {
        x, y, px: x - vx * dt, py: y - vy * dt, r: s.r, n: s.n,
        cut: false, stuckT: 0, noClip: 0, contact: false, dripT: rnd(0, 0.1)
      };
    });
    const bones = LINKS.map(([a, b, stiff]) => ({
      a, b, stiff,
      len: Math.hypot(SKELETON[a].x - SKELETON[b].x, SKELETON[a].y - SKELETON[b].y),
      dead: false
    }));
    return {
      pts, bones,
      colour: o.colour || '#e9eefb',
      hat: o.hat || null,
      headRot: 0, headSpin: 0,
      burst: false, asleep: false,
      alive: !!o.alive,
      onSmash: null
    };
  }

  function spawn(S, cause, cutY, opts) {
    opts = opts || {};
    ensure(S);
    const g = S.gore;
    const pl = S.player;
    g.parts.length = 0;
    g.t = 0;

    const rd = makeRagdoll(pl.x + pl.w / 2, pl.y, {
      vx: pl.vx * 0.6, vy: pl.vy * 0.35,
      colour: SL.stick.skinColour(SL.save.equipped('skin'), S.time),
      hat: SL.save.equipped('hat'),
      alive: !!opts.alive
    });
    g.rd = rd;

    if (rd.alive) return rd;                       // voluntary flop: no cut, no blood, no noise
    if (cutsOn() && cutY != null) {
      cut(S, rd, cutY, cause === 'saw' ? 1.25 : 1);
    } else {
      SL.audio.play('die');
    }
    return rd;
  }

  /* Go limp on purpose. Same ragdoll, just not a corpse. */
  function spawnLimp(S) {
    const rd = spawn(S, 'limp', null, { alive: true });
    for (const p of rd.pts) {                      // a little slump so it reads as going limp
      p.px = p.x - ((p.x - p.px) * 0.6);
      p.py = p.y - ((p.y - p.py) * 0.6) - 0.02;
    }
    return rd;
  }

  /* A limp ragdoll that hits the killing floor becomes a corpse where it lies. */
  function kill(S) {
    const rd = S.gore && S.gore.rd;
    if (!rd || !rd.alive) return;
    rd.alive = false;
    SL.audio.play('die');
  }

  /** Sever every bone that crosses the plane, then shove the two sides apart. */
  function cut(S, rd, cutY, force) {
    const pts = rd.pts;
    let severed = 0;
    for (const b of rd.bones) {
      if (b.dead) continue;
      const ay = pts[b.a].y, by = pts[b.b].y;
      if ((ay - cutY) * (by - cutY) <= 0) {
        b.dead = true;
        /* only real limbs leave a stump — the posture link is invisible */
        if (b.stiff === 1) {
          pts[b.a].cut = true;
          pts[b.b].cut = true;
          severed++;
        }
      }
    }
    if (!severed) { SL.audio.play('die'); return; }   // blade missed every limb
    const wet = bloodOn();

    /* the two sides go opposite ways */
    const away = Math.random() < 0.5 ? -1 : 1;
    const dt = 1 / 120;
    for (const p of pts) {
      const up = p.y > cutY;
      const vx = (p.x - p.px) / dt + away * (up ? rnd(70, 170) : -rnd(50, 130)) * force;
      const vy = (p.y - p.py) / dt + (up ? rnd(150, 300) : rnd(20, 120)) * force;
      p.px = p.x - vx * dt;
      p.py = p.y - vy * dt;
    }

    if (wet) {
      spillOrgans(S, rd, cutY, force);
      splash(S, avgX(pts), cutY, scale(70), 300, -0.2);
      SL.audio.play('splat');
    }
    SL.audio.play('die');
  }

  function avgX(pts) {
    let s = 0;
    for (const p of pts) s += p.x;
    return s / pts.length;
  }

  const ORGANS = [
    { s: 'heart', c: '#a4161a', r: 3.4 }, { s: 'lung', c: '#c96b7a', r: 3.8 },
    { s: 'lung', c: '#bf5f6e', r: 3.6 }, { s: 'liver', c: '#6d1a1a', r: 3.9 },
    { s: 'gib', c: '#8f1d24', r: 2.6 }, { s: 'gib', c: '#b02330', r: 2.3 },
    { s: 'gib', c: '#7a141b', r: 2.8 }, { s: 'gib', c: '#c1121f', r: 2.1 }
  ];
  const GUT_LINKS = 8, GUT_SEG = 3.1;

  /* A length of intestine is a little Verlet rope: it slithers, drapes over
     blocks and hangs off ledges instead of bouncing like a pebble. */
  function makeGut(S, cx, cy, colour, force) {
    const dt = 1 / 120;
    const a = rnd(0, 6.283);
    const vx = Math.cos(a) * rnd(60, 200) * force;
    const vy = Math.abs(Math.sin(a)) * rnd(60, 190) * force;
    const pts = [];
    for (let i = 0; i < GUT_LINKS; i++) {
      const x = cx + rnd(-2, 2) - Math.cos(a) * i * 0.8;
      const y = cy + rnd(-2, 2) - Math.sin(a) * i * 0.8;
      pts.push({
        x, y, px: x - (vx + rnd(-30, 30)) * dt, py: y - (vy + rnd(-30, 30)) * dt,
        r: 2.3, noClip: 0, stuckT: 0, contact: false
      });
    }
    return { pts, colour, w: rnd(3.6, 4.6), wob: rnd(0, 6.28) };
  }

  function spillOrgans(S, rd, cutY, force) {
    const g = S.gore;
    const cx = avgX(rd.pts);
    for (let i = 0; i < (lowfx() ? 1 : 2); i++) g.ropes.push(makeGut(S, cx, cutY, i ? '#d67c8c' : '#e08a9a', force));
    const n = lowfx() ? 4 : ORGANS.length;
    for (let i = 0; i < n; i++) {
      const o = ORGANS[i];
      const a = rnd(-2.6, -0.5);
      const sp = rnd(70, 230) * force;
      const p = {
        x: cx + rnd(-4, 4), y: cutY + rnd(-3, 3),
        vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1),
        vy: -Math.sin(a) * sp,
        r: o.r, colour: o.c, shape: o.s, wob: rnd(0, 6.28),
        rot: rnd(-1, 1), vrot: rnd(-9, 9),
        squash: 0, squashV: 0, squashAng: 0, writhe: rnd(0.8, 1.9),
        onPlat: null, rest: false, dripT: 0, stuckT: 0, noClip: 0
      };
      g.parts.push(p);
    }
  }

  function splash(S, x, y, n, speed, bias) {
    ensure(S);
    const g = S.gore;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const sp = speed * (0.15 + Math.random() * 0.95);
      g.drops.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - bias * speed,
        r: rnd(1.2, 3.4), c: pick(BLOOD), life: rnd(0.6, 3.2)
      });
    }
    if (g.drops.length > MAX_DROPS) g.drops.splice(0, g.drops.length - MAX_DROPS);
  }

  function stain(S, x, y, size, plat, vertical) {
    const g = S.gore;
    const blobs = [];
    const n = 2 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) {
      blobs.push(vertical
        ? { dx: rnd(-1.5, 1.5), dy: rnd(-size, size), r: rnd(size * 0.35, size * 0.95) }
        : { dx: rnd(-size, size), dy: rnd(-1.5, 1.5), r: rnd(size * 0.35, size * 0.95) });
    }
    g.decals.push({
      x, y, plat: plat ? plat.id : -1,
      ox: plat ? x - LV.platX(plat, S.time) : 0,
      blobs, c: pick(BLOOD), a: rnd(0.55, 0.9), vert: !!vertical
    });
    if (g.decals.length > MAX_DECALS) g.decals.splice(0, g.decals.length - MAX_DECALS);
  }

  /* ---------------- ragdoll integration ---------------- */
  function stepRagdoll(S, dt) { stepBody(S, S.gore.rd, dt); }

  function stepBody(S, rd, dt) {
    if (!rd || rd.asleep) return;
    const pts = rd.pts;
    const grav = G * dt * dt;

    for (const p of pts) {
      if (p.noClip > 0) p.noClip -= dt;
      const vx = (p.x - p.px) * DAMP;
      const vy = (p.y - p.py) * DAMP;
      p.px = p.x; p.py = p.y;
      p.x += vx;
      p.y += vy - grav;
    }

    for (let k = 0; k < ITER; k++) {
      for (const b of rd.bones) {
        if (b.dead) continue;
        const a = pts[b.a], q = pts[b.b];
        const dx = q.x - a.x, dy = q.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const f = ((d - b.len) / d) * 0.5 * b.stiff;
        a.x += dx * f; a.y += dy * f;
        q.x -= dx * f; q.y -= dy * f;
      }
      for (const p of pts) collide(S, p, dt, rd);
    }

    /* a detached head keeps rolling */
    if (rd.bones[0].dead) {
      const h = pts[HEAD];
      rd.headSpin = rd.headSpin * 0.97 + (h.x - h.px) * 0.09;
      rd.headRot += rd.headSpin;
    }

    if (bleeds(S)) bleedFromCuts(S, rd, dt);

    /* once everything has stopped on the floor, stop simulating */
    let moving = false;
    for (const p of pts) {
      if (Math.abs(p.x - p.px) > 0.02 || Math.abs(p.y - p.py) > 0.02 || p.y - p.r > 1.5) { moving = true; break; }
    }
    if (!moving) rd.asleep = true;
  }

  function collide(S, p, dt, rd) {
    const plats = S.level.plats;
    /* A corpse is meant to end up at the bottom, so it slides off ledges and
       eventually slips through them. A body you put down on purpose is not —
       it settles on whatever block it lands on and stays there. */
    const alive = !!(rd ? rd.alive : (S.gore.rd && S.gore.rd.alive));
    let vx = p.x - p.px, vy = p.y - p.py;
    p.contact = false;

    if (p.x < p.r) {
      const imp = Math.abs(vx) / dt;
      p.x = p.r; p.px = p.x + vx * WALL_BOUNCE;
      if (imp > IMPACT_MIN) onImpact(S, p, imp, 'wall', rd, -1);
    } else if (p.x > W - p.r) {
      const imp = Math.abs(vx) / dt;
      p.x = W - p.r; p.px = p.x + vx * WALL_BOUNCE;
      if (imp > IMPACT_MIN) onImpact(S, p, imp, 'wall', rd, 1);
    }
    const ceil = S.level.ceiling;
    if (ceil && vy > 0 && p.y + p.r >= ceil) {
      const imp = vy / dt;
      p.y = ceil - p.r;
      p.py = p.y + vy * BOUNCE;
      p.px = p.x - vx * 0.8;
      if (imp > IMPACT_MIN) onImpact(S, p, imp, 'ceiling', rd, 0);
    }

    let hit = null;
    if (vy < 0 && p.noClip <= 0) {
      for (const pl of plats) {
        if (pl.broken || pl.type === 'ground') continue;
        if (Math.abs(pl.y - p.y) > 80) continue;
        const px = LV.platX(pl, S.time);
        if (p.x + p.r < px || p.x - p.r > px + pl.w) continue;
        if (p.py - p.r >= pl.y - 0.6 && p.y - p.r <= pl.y) { hit = pl; break; }
      }
    }

    if (hit) {
      p.y = hit.y + p.r;
      const impact = -vy / dt;
      p.contact = true;
      if (impact > IMPACT_MIN) {
        p.py = p.y + vy * BOUNCE;
        p.px = p.x - vx * 0.7;
        onImpact(S, p, impact, hit, rd);
      } else {
        p.py = p.y;
        p.px = p.x - vx * (alive ? LIVE_SLIDE_KEEP : SLIDE_KEEP);
        if (alive) { p.stuckT = 0; return; }
        p.stuckT += dt;
        /* never let a corpse settle on a ledge — it belongs at the bottom */
        if (Math.abs(vx) < 0.3) {
          const px = LV.platX(hit, S.time);
          let dir = (p.x - px) < (px + hit.w - p.x) ? -1 : 1;
          if (dir < 0 && px <= p.r + 1) dir = 1;
          else if (dir > 0 && px + hit.w >= W - p.r - 1) dir = -1;
          p.px -= dir * EDGE_NUDGE;
        }
        if (p.stuckT > 1.3) { p.noClip = 0.6; p.stuckT = 0; }
      }
      return;
    }

    if (p.y - p.r <= 0 && vy < 0) {
      p.y = p.r;
      const impact = -vy / dt;
      p.contact = true;
      p.stuckT = 0;
      if (impact > IMPACT_MIN) {
        p.py = p.y + vy * BOUNCE * 0.8;
        p.px = p.x - vx * 0.6;
        onImpact(S, p, impact, null, rd);
      } else {
        p.py = p.y;
        p.px = p.x - vx * GROUND_KEEP;
      }
    } else if (!hit) {
      p.stuckT = 0;
    }
  }

  function onImpact(S, p, impact, plat, body, side) {
    const rd = body || S.gore.rd;
    if (rd && rd.onSmash) rd.onSmash(impact, p, plat);
    if (!rd || rd.alive) return;                   // a live ragdoll just thumps
    const onWall = plat === 'wall', onCeiling = plat === 'ceiling';
    if (onWall || onCeiling) {
      if (!bloodOn()) return;
      const amt = clamp(impact / 700, 0.25, 1.4);
      splash(S, p.x, p.y, scale(Math.round(3 + amt * 11)), 130 * amt, 0);
      stain(S, onWall ? (side < 0 ? 1.5 : W - 1.5) : p.x,
            onCeiling ? S.level.ceiling - 1.5 : p.y,
            p.r * (0.8 + amt * 0.8), null, onWall);
      return;
    }
    /* a hard enough landing bursts an intact body open */
    if (cutsOn() && !rd.burst && impact > SPLAT_IMPACT) {
      const intact = rd.bones.some(b => b.stiff === 1 && !b.dead);
      const anyCut = rd.pts.some(q => q.cut);
      if (intact && !anyCut) {
        rd.burst = true;
        cut(S, rd, p.y + rnd(2, 9), 0.8);
        SL.util.vibrate(SL.save.data.settings.haptic ? [20, 40, 40] : 0);
        return;
      }
    }
    if (!bloodOn()) return;
    const amt = clamp(impact / 700, 0.25, 1.4);
    if (p.cut || impact > 320) {
      splash(S, p.x, p.y - p.r, scale(Math.round(3 + amt * 11)), 130 * amt, 0.35);
      if (plat) stain(S, p.x, plat.y, p.r * (0.8 + amt * 0.8), plat);
      else stain(S, p.x, 0.5, p.r * (0.8 + amt * 0.8), null);
    }
  }

  function bleedFromCuts(S, rd, dt) {
    const g = S.gore;
    for (const p of rd.pts) {
      if (!p.cut) continue;
      p.dripT -= dt;
      if (p.dripT > 0) continue;
      p.dripT = rnd(0.03, 0.11) / (lowfx() ? 0.35 : 1);
      const vx = (p.x - p.px) / dt, vy = (p.y - p.py) / dt;
      g.drops.push({
        x: p.x + rnd(-p.r, p.r), y: p.y + rnd(-p.r, p.r),
        vx: vx * 0.35 + rnd(-30, 30), vy: vy * 0.3 + rnd(-10, 40),
        r: rnd(1.1, 2.8), c: pick(BLOOD), life: rnd(0.7, 2.6)
      });
    }
    if (g.drops.length > MAX_DROPS) g.drops.splice(0, g.drops.length - MAX_DROPS);
  }

  /* ---------------- organs + droplets ---------------- */
  function squish(p, impact, ang) {
    const amt = clamp(impact / 900, 0.05, 0.5);
    if (amt > Math.abs(p.squash)) { p.squash = amt; p.squashV = 0; p.squashAng = ang; }
  }

  /* the guts: Verlet rope, same integrator and collisions as the ragdoll */
  function stepRopes(S, dt) {
    const g = S.gore;
    const grav = G * dt * dt;
    for (const rope of g.ropes) {
      rope.wob += dt * 1.4;
      for (const p of rope.pts) {
        if (p.noClip > 0) p.noClip -= dt;
        const vx = (p.x - p.px) * DAMP;
        const vy = (p.y - p.py) * DAMP;
        p.px = p.x; p.py = p.y;
        p.x += vx;
        p.y += vy - grav;
      }
      for (let k = 0; k < 3; k++) {
        for (let i = 0; i < rope.pts.length - 1; i++) {
          const a = rope.pts[i], b = rope.pts[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          const f = ((d - GUT_SEG) / d) * 0.5;
          a.x += dx * f; a.y += dy * f;
          b.x -= dx * f; b.y -= dy * f;
        }
        for (const p of rope.pts) collide(S, p, dt, null);
      }
    }
  }

  function stepLoose(S, dt) {
    const g = S.gore;
    const plats = S.level.plats;

    for (const p of g.parts) {
      /* soft bodies: the squash from the last knock springs back and overshoots,
         and they never sit perfectly still */
      p.squashV += (-p.squash * 900 - p.squashV * 16) * dt;
      p.squash += p.squashV * dt;
      p.wob += dt * p.writhe;
      if (p.rest) continue;
      if (p.noClip > 0) p.noClip -= dt;
      const py = p.y;
      p.vy -= G * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      p.vrot -= p.vrot * 0.5 * dt;

      if (p.x < p.r) { squish(p, Math.abs(p.vx), Math.PI / 2); p.x = p.r; p.vx = Math.abs(p.vx) * 0.45; }
      else if (p.x > W - p.r) { squish(p, Math.abs(p.vx), Math.PI / 2); p.x = W - p.r; p.vx = -Math.abs(p.vx) * 0.45; }
      const ceilY = S.level.ceiling;
      if (ceilY && p.vy > 0 && p.y + p.r >= ceilY) { squish(p, p.vy, 0); p.y = ceilY - p.r; p.vy = -p.vy * 0.4; }

      let landed = null;
      if (p.vy <= 0 && p.noClip <= 0) {
        for (const pl of plats) {
          if (pl.broken || pl.type === 'ground') continue;
          if (Math.abs(pl.y - p.y) > 90) continue;
          const px = LV.platX(pl, S.time);
          if (p.x + p.r < px || p.x - p.r > px + pl.w) continue;
          if (py - p.r >= pl.y - 1 && p.y - p.r <= pl.y) { landed = pl; break; }
        }
      }
      if (landed) {
        p.y = landed.y + p.r;
        const impact = -p.vy;
        p.onPlat = landed;
        if (impact > 42) {
          squish(p, impact, 0);
          p.vy = impact * 0.42; p.vx *= 0.8;
          p.vrot = p.vrot * 0.7 + p.vx * 0.05;
          if (bloodOn()) stain(S, p.x, landed.y, p.r * 0.9, landed);
          if (p.vy < 26) p.vy = 0;
        } else p.vy = 0;
      } else if (p.y - p.r <= 0 && p.vy <= 0) {
        p.y = p.r;
        const impact = -p.vy;
        p.onPlat = 'ground';
        if (impact > 42) {
          squish(p, impact, 0);
          p.vy = impact * 0.34; p.vx *= 0.72;
          if (bloodOn()) stain(S, p.x, 0.5, p.r * 0.9, null);
          if (p.vy < 22) p.vy = 0;
        } else p.vy = 0;
      }

      if (p.onPlat && p.vy === 0) {
        if (p.onPlat === 'ground') {
          p.y = p.r;
          p.vx -= Math.sign(p.vx) * 1100 * dt;
          if (Math.abs(p.vx) < 8) { p.vx = 0; p.vrot *= 0.82; if (Math.abs(p.vrot) < 0.25) { p.vrot = 0; p.rest = true; } }
        } else {
          const pl = p.onPlat, px = LV.platX(pl, S.time);
          if (pl.broken || p.x + p.r < px || p.x - p.r > px + pl.w) { p.onPlat = null; p.stuckT = 0; }
          else {
            p.y = pl.y + p.r;
            p.stuckT += dt;
            p.vx -= Math.sign(p.vx) * 120 * dt;
            if (Math.abs(p.vx) < 70) {
              let dir = (p.x - px) < (px + pl.w - p.x) ? -1 : 1;
              if (dir < 0 && px <= p.r + 1) dir = 1;
              else if (dir > 0 && px + pl.w >= W - p.r - 1) dir = -1;
              p.vx += dir * 330 * dt;
            }
            p.vrot = p.vrot * 0.9 + p.vx * 0.02;
            if (p.stuckT > 1.1) { p.noClip = 0.55; p.onPlat = null; p.stuckT = 0; p.vy = -30; }
          }
        }
      } else if (p.onPlat && p.vy !== 0) { p.onPlat = null; p.stuckT = 0; }
    }

    for (let i = g.drops.length - 1; i >= 0; i--) {
      const d = g.drops[i];
      d.life -= dt;
      if (d.life <= 0) { g.drops.splice(i, 1); continue; }
      const dy = d.y;
      d.vy -= 1500 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.x < 1 || d.x > W - 1) { stain(S, clamp(d.x, 2, W - 2), d.y, d.r * 1.6, null); g.drops.splice(i, 1); continue; }
      if (d.vy > 0) continue;
      let hit = null;
      for (const pl of plats) {
        if (pl.broken || Math.abs(pl.y - d.y) > 60) continue;
        const px = LV.platX(pl, S.time);
        if (d.x < px || d.x > px + pl.w) continue;
        if (dy >= pl.y - 0.5 && d.y <= pl.y) { hit = pl; break; }
      }
      if (hit) { stain(S, d.x, hit.y, d.r * 1.8, hit); g.drops.splice(i, 1); continue; }
      if (d.y <= 0) { stain(S, d.x, 0.5, d.r * 1.9, null); g.drops.splice(i, 1); }
    }
    if (g.drops.length > MAX_DROPS) g.drops.splice(0, g.drops.length - MAX_DROPS);
  }

  function step(S, dt) {
    ensure(S);
    S.gore.t += dt;
    stepRagdoll(S, dt);
    stepRopes(S, dt);
    stepLoose(S, dt);
  }

  /* where the camera should be looking: the centre of what is left of him */
  function focus(S) {
    ensure(S);
    const rd = S.gore.rd;
    if (!rd) return S.player.y;
    let sum = 0;
    for (const p of rd.pts) sum += p.y;
    return sum / rd.pts.length;
  }

  /* ---------------- drawing ---------------- */
  function drawDecals(S, ctx, toY) {
    const g = S.gore;
    if (!g) return;
    const byId = S.level.platById;
    const h = SL.render.view.h;
    for (const d of g.decals) {
      let x = d.x;
      if (d.plat >= 0) {
        const pl = byId[d.plat];
        if (!pl || pl.broken) continue;
        x = LV.platX(pl, S.time) + d.ox;
      }
      const sy = toY(d.y);
      if (sy < -40 || sy > h + 40) continue;
      ctx.globalAlpha = d.a;
      ctx.fillStyle = d.c;
      for (const b of d.blobs) {
        ctx.beginPath();
        if (d.vert) ctx.ellipse(x + b.dx, sy + b.dy, b.r * 0.55, b.r, 0, 0, 6.284);
        else ctx.ellipse(x + b.dx, sy + b.dy - 1, b.r, b.r * 0.55, 0, 0, 6.284);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawParts(S, ctx, toY, time) {
    const g = S.gore;
    if (!g) return;
    for (const rope of g.ropes) drawGut(ctx, rope, toY);
    for (const p of g.parts) drawOrgan(ctx, p, toY);
    if (g.rd) drawRagdoll(ctx, g.rd, toY, time);
    drawDrops(ctx, g.drops, toY);
  }

  function drawRagdoll(ctx, rd, toY, time) {
    const pts = rd.pts;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rd.colour;
    ctx.lineWidth = BONE_W;

    for (const b of rd.bones) {
      if (b.dead || b.stiff !== 1) continue;
      const a = pts[b.a], q = pts[b.b];
      ctx.beginPath();
      ctx.moveTo(a.x, toY(a.y));
      ctx.lineTo(q.x, toY(q.y));
      ctx.stroke();
    }

    /* head, oriented along the neck while it is still attached */
    const h = pts[HEAD], ch = pts[CHEST];
    let ang;
    if (!rd.bones[0].dead) {
      const ux = h.x - ch.x, uy = toY(h.y) - toY(ch.y);
      const len = Math.hypot(ux, uy) || 1;
      ang = Math.atan2(ux / len, -uy / len);
    } else {
      ang = rd.headRot;
    }
    ctx.save();
    ctx.translate(h.x, toY(h.y));
    ctx.rotate(ang);
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, HEAD_R, 0, 6.284); ctx.stroke();
    ctx.lineWidth = 1.2;
    for (const ex of [-1.8, 1.8]) {          // dead eyes
      ctx.beginPath();
      ctx.moveTo(ex - 1.2, -1.3); ctx.lineTo(ex + 1.2, 0.9);
      ctx.moveTo(ex + 1.2, -1.3); ctx.lineTo(ex - 1.2, 0.9);
      ctx.stroke();
    }
    if (rd.hat) {
      ctx.save();
      ctx.translate(0, 25.8);                 // drawHat works in the feet-origin frame
      SL.stick.drawHat(ctx, rd.hat, rd.colour, time, 1);
      ctx.restore();
    }
    ctx.restore();

    /* bloody stumps wherever a bone was cut */
    for (const p of pts) {
      if (!p.cut) continue;
      const sy = toY(p.y);
      ctx.fillStyle = '#8f1d24';
      ctx.beginPath(); ctx.arc(p.x, sy, p.r * 0.95 + 1.1, 0, 6.284); ctx.fill();
      ctx.fillStyle = '#c1121f';
      ctx.beginPath(); ctx.arc(p.x, sy, p.r * 0.5 + 0.5, 0, 6.284); ctx.fill();
    }
    ctx.restore();
  }

  function drawDrops(ctx, drops, toY) {
    ctx.save();
    for (const d of drops) {
      const sy = toY(d.y);
      ctx.fillStyle = d.c;
      ctx.globalAlpha = clamp(d.life, 0.15, 1);
      const sp = Math.hypot(d.vx, d.vy);
      if (sp > 120) {
        ctx.save();
        ctx.translate(d.x, sy);
        ctx.rotate(Math.atan2(-d.vy, d.vx));
        ctx.beginPath();
        ctx.ellipse(0, 0, d.r * (1 + sp / 700), d.r * 0.7, 0, 0, 6.284);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(d.x, sy, d.r, 0, 6.284);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawGut(ctx, rope, toY) {
    const pts = rope.pts;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? rope.colour : 'rgba(90,20,30,.55)';
      ctx.lineWidth = pass ? rope.w : rope.w + 1.6;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, toY(pts[0].y));
      for (let i = 1; i < pts.length - 1; i++) {     // smooth it out
        const a = pts[i], b = pts[i + 1];
        ctx.quadraticCurveTo(a.x, toY(a.y), (a.x + b.x) / 2, toY((a.y + b.y) / 2));
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, toY(last.y));
      ctx.stroke();
    }
    /* a wet highlight so it does not read as a rope */
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = rope.w * 0.3;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, toY(pts[0].y) - rope.w * 0.22);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, toY(pts[i].y) - rope.w * 0.22);
    ctx.stroke();
    ctx.restore();
  }

  function drawOrgan(ctx, p, toY) {
    const r = p.r;
    ctx.save();
    ctx.translate(p.x, toY(p.y));
    ctx.rotate(p.rot);
    /* squash from the last knock, plus a constant slow writhe */
    const sq = p.squash + Math.sin(p.wob) * 0.05;
    if (sq) {
      ctx.rotate(p.squashAng);
      ctx.scale(1 + sq, 1 - sq * 0.85);
      ctx.rotate(-p.squashAng);
    }
    ctx.fillStyle = p.colour;
    ctx.strokeStyle = 'rgba(60,6,10,.55)';
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    if (p.shape === 'heart') {
      ctx.beginPath();
      ctx.moveTo(0, r);
      ctx.bezierCurveTo(-r * 1.6, -r * 0.2, -r * 0.55, -r * 1.4, 0, -r * 0.55);
      ctx.bezierCurveTo(r * 0.55, -r * 1.4, r * 1.6, -r * 0.2, 0, r);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (p.shape === 'lung') {
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.75, r * 1.25, 0.3, 0, 6.284); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(90,20,30,.45)';
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r * 0.6); ctx.stroke();
    } else if (p.shape === 'liver') {
      ctx.beginPath();
      ctx.moveTo(-r * 1.3, -r * 0.4);
      ctx.quadraticCurveTo(0, -r * 1.25, r * 1.35, -r * 0.25);
      ctx.quadraticCurveTo(r * 0.7, r * 1.1, -r * 0.5, r * 0.85);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * 6.284;
        const rad = r * (0.65 + 0.5 * Math.sin(i * 2.3 + p.wob));
        i ? ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  SL.gore = { reset, softReset, spawn, spawnLimp, kill, step, focus, drawDecals, drawParts, splash,
    /* reusable pieces, for the smash lab */
    makeRagdoll, stepBody, drawRagdoll, cut, stain, splashAt: splash, HEAD, CHEST, HIP };
})(window.SL);
