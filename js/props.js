/* Scupper Jump — Smash Lab props.
   The things you spawn into the room and swing at people. Every loose prop is
   a two-point Verlet capsule: `a` is the business end, `b` the tail, so it
   swings, tumbles and takes a grab for free using the same integration the
   ragdolls use. Fixed props (the blender, the spike bed) skip the physics and
   just sit there being dangerous. */
(function (SL) {
  'use strict';
  const { clamp } = SL.util;
  const W = SL.level.W;

  const G = 1750;                    // matches the ragdolls, so props fall with bodies
  const DAMP = 0.995;
  const ITER = 4;
  const gmul = (S) => (S.level && S.level.gravityMul) || 1;
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ---------------- the catalogue ----------------
     `edge` props cut, `blunt` props scale the wallop, `spin` keeps an edge
     moving even when the prop is sitting still. Mass is relative: a heavier
     end drags the light one round, which is what makes a sledgehammer swing
     like a sledgehammer and a sword flick like a sword. */
  const CATALOGUE = [
    { id: 'sword', name: 'Sword', icon: '🗡️', blurb: 'Long, light, takes limbs off.',
      len: 32, ra: 3.2, rb: 3.4, ma: 0.55, mb: 1.15, edge: 1, cutV: 190, blunt: 0.5, bounce: 0.25 },
    { id: 'cleaver', name: 'Cleaver', icon: '🔪', blurb: 'Short and mean. Barely needs a swing.',
      len: 16, ra: 6, rb: 3, ma: 1.5, mb: 0.6, edge: 1, cutV: 120, blunt: 0.9, bounce: 0.2 },
    { id: 'chainsaw', name: 'Chainsaw', icon: '🪚', blurb: 'The chain never stops.',
      len: 26, ra: 5.5, rb: 5, ma: 1.1, mb: 1.4, edge: 1, cutV: 40, spin: 0, chain: 1, blunt: 0.8, bounce: 0.2 },
    { id: 'saw', name: 'Buzz Saw', icon: '⚙️', blurb: 'Free-spinning blade. Do not hold it.',
      len: 7, ra: 12, rb: 12, ma: 0.9, mb: 0.9, edge: 1, cutV: 30, spin: 22, blunt: 0.7, bounce: 0.45 },
    { id: 'hammer', name: 'Sledgehammer', icon: '🔨', blurb: 'All the weight in the head.',
      len: 28, ra: 8, rb: 3, ma: 3.2, mb: 0.5, blunt: 2.1, bounce: 0.2 },
    { id: 'anvil', name: 'Anvil', icon: '🧱', blurb: 'Drop it on someone. That is the whole idea.',
      len: 11, ra: 11, rb: 11, ma: 3.6, mb: 3.6, blunt: 2.4, bounce: 0.08, upright: 1 },
    { id: 'ball', name: 'Bowling Ball', icon: '🎳', blurb: 'Heavy, round, rolls into a crowd.',
      len: 6, ra: 10, rb: 10, ma: 2.6, mb: 2.6, blunt: 1.8, bounce: 0.42 },
    { id: 'bomb', name: 'Bomb', icon: '💣', blurb: 'Short fuse. Stand back.',
      len: 6, ra: 8, rb: 8, ma: 1.1, mb: 1.1, blunt: 0.9, bounce: 0.4, fuse: 4.2 },
    { id: 'blender', name: 'Blender', icon: '🥤', blurb: 'Feed someone in. It does the rest.',
      fixed: 1, w: 34, h: 52 },
    { id: 'spikes', name: 'Spike Bed', icon: '🛏️', blurb: 'A landing strip with opinions.',
      fixed: 1, w: 70, h: 14 }
  ];
  const byId = {};
  for (const k of CATALOGUE) byId[k.id] = k;

  /* ---------------- making one ---------------- */
  function make(id, x, y) {
    const k = byId[id];
    if (!k) return null;
    if (k.fixed) {
      return { k, id, fixed: true, x: clamp(x, k.w / 2 + 4, W - k.w / 2 - 4), y: 0,
        pts: [], spin: 0, work: 0, fill: 0, feed: 0, dead: false };
    }
    const ang = rnd(-0.7, 0.7), half = k.len / 2;
    const c = Math.cos(ang), s = Math.sin(ang);
    const mk = (sx, sy, r, m) => ({ x: x + sx, y: y + sy, px: x + sx, py: y + sy, r, m });
    const p = {
      k, id, fixed: false, spin: 0, fuse: k.fuse || 0, dead: false, restT: 0,
      pts: [mk(c * half, s * half, k.ra, k.ma), mk(-c * half, -s * half, k.rb, k.mb)]
    };
    return p;
  }

  /** Surface speed of a spinning edge, in px/s — a buzz saw cuts standing still. */
  const surfaceV = (k) => (k.spin ? Math.abs(k.spin) * (k.ra || 6) : k.chain ? 260 : 0);

  /* ---------------- physics ---------------- */
  function integrate(S, p, dt) {
    const k = p.k;
    const grav = G * gmul(S) * dt * dt * (k.float || 1);
    for (const q of p.pts) {
      const vx = (q.x - q.px) * DAMP, vy = (q.y - q.py) * DAMP;
      q.px = q.x; q.py = q.y;
      q.x += vx;
      q.y += vy - grav;
    }
    for (let i = 0; i < ITER; i++) {
      rod(p);
      for (const q of p.pts) walls(S, p, q);
    }
    /* The blade is round, so turning its collision shape would change nothing
       and forcing it against the floor constraint only makes it skitter. Spin
       the picture instead; the bite comes from surfaceV. */
    if (k.spin) p.spin += k.spin * dt;
  }

  /** Hold the two ends `len` apart, heavier end moving least. */
  function rod(p) {
    const a = p.pts[0], b = p.pts[1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.0001;
    const f = (d - p.k.len) / d;
    const tot = a.m + b.m;
    a.x += dx * f * (b.m / tot); a.y += dy * f * (b.m / tot);
    b.x -= dx * f * (a.m / tot); b.y -= dy * f * (a.m / tot);
  }

  function walls(S, p, q) {
    const e = p.k.bounce != null ? p.k.bounce : 0.3;
    const top = (S.level && S.level.ceiling) || 1e5;
    if (q.y - q.r < 0) {
      q.y = q.r;
      const vy = q.y - q.py;
      if (vy < 0) q.py = q.y + vy * e;
      q.px = q.x - (q.x - q.px) * 0.86;          // floor friction
    }
    if (q.y + q.r > top) { q.y = top - q.r; const vy = q.y - q.py; if (vy > 0) q.py = q.y + vy * e; }
    if (q.x - q.r < 0) { q.x = q.r; const vx = q.x - q.px; if (vx < 0) q.px = q.x + vx * e; }
    if (q.x + q.r > W) { q.x = W - q.r; const vx = q.x - q.px; if (vx > 0) q.px = q.x + vx * e; }
  }

  /* nearest point on a capsule spine to (qx,qy) */
  function nearestAt(ax, ay, ar, bx, by, br, qx, qy) {
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    let t = L2 > 0.0001 ? ((qx - ax) * dx + (qy - ay) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return { t, x: ax + dx * t, y: ay + dy * t, r: ar + (br - ar) * t };
  }
  function nearest(p, qx, qy) {
    const a = p.pts[0], b = p.pts[1];
    return nearestAt(a.x, a.y, a.r, b.x, b.y, b.r, qx, qy);
  }

  const SPEED = 120;                 // fixed-step Verlet: (x - px) * 120 is px/s

  /* ---------------- what props do to people ---------------- */
  function hitBodies(S, lab, p, dt, hooks) {
    const k = p.k;
    if (k.fixed) return zoneWork(S, lab, p, dt, hooks);
    const a = p.pts[0], b = p.pts[1];
    const surf = surfaceV(k);
    const mass = (k.ma + k.mb) / 2;

    /* A swung blade covers more ground in one step than it is wide, so testing
       only where it ended up lets it pass clean through somebody. Walk the
       sweep instead: sample poses between where it was and where it is. */
    const travel = Math.max(Math.hypot(a.x - a.px, a.y - a.py), Math.hypot(b.x - b.px, b.y - b.py));
    const slices = clamp(Math.ceil(travel / Math.max(1.5, Math.min(a.r, b.r))), 1, 8);

    for (const rd of lab.bodies) {
      let best = 0, bestPt = null;
      for (const q of rd.pts) {
        let n = null, d = 0, rr = 0;
        for (let sl = 1; sl <= slices; sl++) {
          const u = sl / slices;
          const c = nearestAt(a.px + (a.x - a.px) * u, a.py + (a.y - a.py) * u, a.r,
            b.px + (b.x - b.px) * u, b.py + (b.y - b.py) * u, b.r, q.x, q.y);
          const cr = c.r + q.r * 0.7;
          const cd = Math.hypot(q.x - c.x, q.y - c.y);
          if (cd <= cr) { n = c; d = cd; rr = cr; break; }
        }
        if (!n) continue;
        const dx = q.x - n.x, dy = q.y - n.y;
        if (d < 0.001) { d = 0.001; }
        const nx = dx / d, ny = dy / d;

        /* the prop's own speed where it touched, blended along the spine */
        const pvx = ((a.x - a.px) * (1 - n.t) + (b.x - b.px) * n.t) * SPEED;
        const pvy = ((a.y - a.py) * (1 - n.t) + (b.y - b.py) * n.t) * SPEED;
        const qvx = (q.x - q.px) * SPEED, qvy = (q.y - q.py) * SPEED;
        const rel = Math.hypot(pvx - qvx, pvy - qvy) + surf;

        /* separate, then hand the body the prop's momentum */
        q.x += nx * (rr - d); q.y += ny * (rr - d);
        const push = Math.min(rel, 1400) * mass * 0.55 / SPEED;
        q.px -= nx * push; q.py -= ny * push;
        rd.asleep = false; rd.restT = 0;

        const impact = rel * mass * (k.blunt || 1);
        if (impact > best) { best = impact; bestPt = { x: n.x, y: n.y, rel }; }
      }
      if (!bestPt) continue;

      if (k.edge && bestPt.rel > k.cutV && SL.save.setting('gore') !== false) {
        if (lab.t - (rd.lastSlice || -9) > 0.22) {
          rd.lastSlice = lab.t;
          hooks.cut(rd, bestPt.y + rnd(-1.5, 1.5), 0.85);
        }
      }
      hooks.pay(rd, best, bestPt, k.edge ? 'blade' : 'prop');
      if (k.fuse && best > 900) p.fuse = Math.min(p.fuse, 0.05);
    }

    /* anything standing in the way goes down */
    for (let i = lab.standing.length - 1; i >= 0; i--) {
      const f = lab.standing[i];
      const n = nearest(p, f.x, 17);
      if (Math.abs(n.x - f.x) > n.r + 10 || n.y < -4 || n.y > 40) continue;
      const pvx = ((a.x - a.px) + (b.x - b.px)) * 0.5 * SPEED;
      const pvy = ((a.y - a.py) + (b.y - b.py)) * 0.5 * SPEED;
      if (Math.hypot(pvx, pvy) + surf < 130) continue;
      hooks.knock(f, pvx * 0.6, Math.max(30, pvy * 0.4));
    }
  }

  /* ---------------- the fixed pair ----------------
     A blender minces whatever is in the jug; a spike bed punishes a landing. */
  function zoneWork(S, lab, p, dt, hooks) {
    const k = p.k;
    p.spin += dt * (k.id === 'blender' ? 26 : 0);
    if (k.id === 'blender') {
      const lo = p.x - k.w / 2 + 3, hi = p.x + k.w / 2 - 3;
      let inside = 0;
      for (const rd of lab.bodies) {
        let n = 0;
        for (const q of rd.pts) {
          if (q.x < lo || q.x > hi || q.y > k.h || q.y < 0) continue;
          n++;
          /* funnel down onto the blade and rattle about */
          q.x += (p.x - q.x) * 0.06 + rnd(-1.4, 1.4);
          q.y -= 0.55;
          if (q.y < 11) { q.px = q.x + rnd(-2.6, 2.6); q.py = q.y + rnd(-2, 2); }
          q.x = clamp(q.x, lo + 1, hi - 1);
        }
        if (!n) continue;
        inside += n;
        rd.asleep = false; rd.restT = 0;
        p.work += dt;
        if (p.work > 0.2) {
          p.work = 0;
          p.fill = Math.min(1, p.fill + 0.06);
          if (SL.save.setting('gore') !== false) hooks.cut(rd, rnd(2, k.h * 0.7), 0.8);
          hooks.pay(rd, 780, { x: p.x, y: 14, rel: 700 }, 'blender');
        }
      }
      p.feed = inside;
      return;
    }
    /* spike bed */
    const lo = p.x - k.w / 2, hi = p.x + k.w / 2;
    for (const rd of lab.bodies) {
      for (const q of rd.pts) {
        if (q.x < lo || q.x > hi) continue;
        if (q.y > k.h + 2) continue;
        const vy = (q.y - q.py) * SPEED;
        if (vy > -110) continue;                       // needs to land hard
        q.y = k.h - 1;
        q.py = q.y;                                    // impaled, it stops dead
        q.px = q.x;
        if (lab.t - (rd.lastSlice || -9) > 0.3) {
          rd.lastSlice = lab.t;
          if (SL.save.setting('gore') !== false) hooks.cut(rd, q.y + rnd(0, 5), 0.9);
          hooks.pay(rd, -vy * 1.6, { x: q.x, y: q.y, rel: -vy }, 'spikes');
        }
      }
    }
  }

  /* ---------------- bombs ---------------- */
  function detonate(S, lab, p, hooks) {
    const c = p.pts[0];
    const R = 78;
    for (const rd of lab.bodies) {
      let near = null, nd = R;
      for (const q of rd.pts) {
        const d = Math.hypot(q.x - c.x, q.y - c.y);
        if (d > R) continue;
        const f = (1 - d / R) * 12;
        const nx = (q.x - c.x) / (d || 1), ny = (q.y - c.y) / (d || 1);
        q.px -= nx * f; q.py -= ny * f;
        rd.asleep = false; rd.restT = 0;
        if (d < nd) { nd = d; near = q; }
      }
      if (!near) continue;
      if (nd < 46 && SL.save.setting('gore') !== false) hooks.cut(rd, near.y + rnd(-6, 6), 1.2);
      hooks.pay(rd, 1500 - nd * 10, { x: near.x, y: near.y, rel: 900 }, 'bomb');
    }
    for (const q of lab.standing.slice()) {
      if (Math.abs(q.x - c.x) < R) hooks.knock(q, (q.x - c.x) * 4, 260);
    }
    /* shove the other props about too */
    for (const o of lab.props) {
      if (o === p || o.fixed) continue;
      for (const q of o.pts) {
        const d = Math.hypot(q.x - c.x, q.y - c.y);
        if (d > R) continue;
        const f = (1 - d / R) * 9;
        q.px -= (q.x - c.x) / (d || 1) * f;
        q.py -= (q.y - c.y) / (d || 1) * f;
      }
    }
    hooks.boom(c.x, c.y);
    p.dead = true;
  }

  /* ---------------- the frame ---------------- */
  function step(S, lab, dt, hooks) {
    if (!lab.props) return;
    for (let i = lab.props.length - 1; i >= 0; i--) {
      const p = lab.props[i];
      if (p.dead) { lab.props.splice(i, 1); continue; }
      if (!p.fixed) {
        integrate(S, p, dt);
        propVsProp(lab, p);
      }
      hitBodies(S, lab, p, dt, hooks);
      if (p.fuse > 0) {
        p.fuse -= dt;
        if (p.fuse <= 0) detonate(S, lab, p, hooks);
      }
    }
  }

  /** Keep loose props from sitting inside one another. */
  function propVsProp(lab, p) {
    for (const o of lab.props) {
      if (o === p || o.fixed) continue;
      for (const q of p.pts) {
        const n = nearest(o, q.x, q.y);
        const rr = n.r + q.r;
        const dx = q.x - n.x, dy = q.y - n.y;
        const d = Math.hypot(dx, dy);
        if (d > rr || d < 0.001) continue;
        const f = (rr - d) * 0.5;
        q.x += dx / d * f; q.y += dy / d * f;
      }
    }
  }

  /** Nearest grabbable point on any loose prop, or null. */
  function grabPoint(lab, wx, wy, radius) {
    if (!lab.props) return null;
    let best = null, bd = radius * radius;
    for (const p of lab.props) {
      if (p.fixed) continue;
      const n = nearest(p, wx, wy);
      const d = (n.x - wx) * (n.x - wx) + (n.y - wy) * (n.y - wy);
      /* grab the spine, but snap the hold to whichever end is closer */
      if (d - n.r * n.r > bd) continue;
      bd = Math.max(0, d - n.r * n.r);
      best = { prop: p, pts: p.pts, i: n.t < 0.5 ? 0 : 1 };
    }
    return best;
  }

  /* ---------------- drawing ----------------
     Everything is drawn in screen space so the capsule angle comes out right
     with the y axis flipped. */
  function draw(ctx, lab, toY, t) {
    if (!lab.props) return;
    for (const p of lab.props) {
      if (p.fixed) { drawFixed(ctx, p, toY, t); continue; }
      const a = p.pts[0], b = p.pts[1];
      const ax = a.x, ay = toY(a.y), bx = b.x, by = toY(b.y);
      const ang = Math.atan2(ay - by, ax - bx);      // tail -> head
      ctx.save();
      ctx.translate((ax + bx) / 2, (ay + by) / 2);
      if (!p.k.upright) ctx.rotate(ang);
      const L = Math.hypot(ax - bx, ay - by) || 1;
      (DRAW[p.id] || DRAW.ball)(ctx, p, L, t);
      ctx.restore();
    }
  }

  const steel = (ctx, x0, x1, h) => {
    const g = ctx.createLinearGradient(0, -h, 0, h);
    g.addColorStop(0, '#f2f6ff'); g.addColorStop(0.45, '#b9c6de');
    g.addColorStop(0.55, '#8a99b4'); g.addColorStop(1, '#dfe7f5');
    ctx.fillStyle = g;
    ctx.fillRect(x0, -h, x1 - x0, h * 2);
  };

  /* each draws centred at the capsule middle, head pointing +x */
  const DRAW = {
    sword(ctx, p, L) {
      const h = L / 2;
      ctx.fillStyle = '#3a2a1c';
      ctx.fillRect(-h - 4, -2.2, 11, 4.4);                 // grip
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(-h + 6, -5.5, 3.4, 11);                 // crossguard
      ctx.beginPath();                                      // blade
      ctx.moveTo(-h + 9, -2.6); ctx.lineTo(h - 5, -2.2);
      ctx.lineTo(h + 3, 0); ctx.lineTo(h - 5, 2.2); ctx.lineTo(-h + 9, 2.6);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -3, 0, 3);
      g.addColorStop(0, '#f6f9ff'); g.addColorStop(0.5, '#aab8d2'); g.addColorStop(1, '#eef3fc');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(20,26,40,.5)'; ctx.lineWidth = 0.7; ctx.stroke();
    },
    cleaver(ctx, p, L) {
      const h = L / 2;
      ctx.fillStyle = '#2c2118';
      ctx.fillRect(-h - 3, -2, 10, 4);
      ctx.beginPath();
      ctx.moveTo(-h + 5, -6.5); ctx.lineTo(h + 4, -6.5);
      ctx.lineTo(h + 4, 5.5); ctx.lineTo(-h + 5, 6.5);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -6, 0, 6);
      g.addColorStop(0, '#eef3fc'); g.addColorStop(0.7, '#9aa9c4'); g.addColorStop(1, '#f4f8ff');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(20,26,40,.45)'; ctx.lineWidth = 0.7; ctx.stroke();
    },
    chainsaw(ctx, p, L, t) {
      const h = L / 2;
      ctx.fillStyle = '#ff8a3d';                            // motor housing
      ctx.beginPath(); ctx.roundRect(-h - 4, -7, 15, 14, 3); ctx.fill();
      ctx.fillStyle = '#2a3244';
      ctx.beginPath(); ctx.roundRect(-h + 1, -9, 8, 4, 2); ctx.fill();
      steel(ctx, -h + 10, h + 3, 3.4);                      // bar
      ctx.fillStyle = '#1b2130';                            // chain teeth, running
      for (let x = -h + 11; x < h + 2; x += 4) {
        const o = ((x + t * 150) % 8) < 4 ? -3.4 : 2.2;
        ctx.fillRect(x, o, 2.2, 1.4);
      }
    },
    saw(ctx, p, L, t) {
      const r = p.k.ra;
      ctx.rotate(p.spin);
      ctx.fillStyle = '#8a99b4';
      ctx.beginPath();
      for (let i = 0; i < 14; i++) {
        const a1 = (i / 14) * 6.283, a2 = ((i + 0.5) / 14) * 6.283;
        ctx.lineTo(Math.cos(a1) * (r + 2.6), Math.sin(a1) * (r + 2.6));
        ctx.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
      }
      ctx.closePath(); ctx.fill();
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, r);
      g.addColorStop(0, '#f4f8ff'); g.addColorStop(1, '#93a2bd');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#2a3244';
      ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, 6.283); ctx.fill();
    },
    hammer(ctx, p, L) {
      const h = L / 2;
      ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-h, 0); ctx.lineTo(h - 4, 0); ctx.stroke();
      const g = ctx.createLinearGradient(0, -8, 0, 8);
      g.addColorStop(0, '#98a4ba'); g.addColorStop(0.5, '#5d6a80'); g.addColorStop(1, '#7f8ca3');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(h - 8, -8, 15, 16, 2); ctx.fill();
      ctx.strokeStyle = 'rgba(12,16,26,.5)'; ctx.lineWidth = 0.8; ctx.stroke();
    },
    ball(ctx, p) {
      const r = p.k.ra;
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, 1, 0, 0, r);
      g.addColorStop(0, '#6c7a95'); g.addColorStop(1, '#161c28');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(8,11,18,.85)';
      for (const o of [[-3, -3], [3, -3], [0, 3]]) {
        ctx.beginPath(); ctx.arc(o[0], o[1], 1.5, 0, 6.283); ctx.fill();
      }
    },
    bomb(ctx, p, L, t) {
      const r = p.k.ra;
      const hot = p.fuse < 1.4;
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, 1, 0, 0, r);
      g.addColorStop(0, '#4a5266'); g.addColorStop(1, '#0d1018');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
      if (hot && Math.sin(t * 26) > 0) {
        ctx.strokeStyle = '#ff5a4b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, r + 1.5, 0, 6.283); ctx.stroke();
      }
      ctx.strokeStyle = '#c8a06a'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(4, -r - 5, 8, -r - 3); ctx.stroke();
      ctx.fillStyle = hot ? '#ffd166' : '#ff8a3d';
      ctx.beginPath(); ctx.arc(8, -r - 3, 1.6 + Math.sin(t * 30) * 0.7, 0, 6.283); ctx.fill();
    }
  };
  /* the anvil never rotates on screen — a tipped-over anvil reads as a grey wedge */
  DRAW.anvil = function (ctx) {
    const g = ctx.createLinearGradient(0, -10, 0, 10);
    g.addColorStop(0, '#59657c'); g.addColorStop(0.5, '#384254'); g.addColorStop(1, '#1d2431');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-12, -9);                     // top face, back edge
    ctx.lineTo(9, -9);
    ctx.lineTo(15, -6);                      // the horn
    ctx.lineTo(9, -3);
    ctx.lineTo(4, -3);
    ctx.lineTo(5, 3);                        // waist
    ctx.lineTo(10, 5);
    ctx.lineTo(10, 9);                       // foot
    ctx.lineTo(-11, 9);
    ctx.lineTo(-11, 5);
    ctx.lineTo(-6, 3);
    ctx.lineTo(-6, -3);
    ctx.lineTo(-12, -3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,22,.6)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = 'rgba(200,215,240,.5)';  // worked, shiny top face
    ctx.fillRect(-12, -9.4, 21, 1.6);
  };

  function drawFixed(ctx, p, toY, t) {
    const k = p.k, y0 = toY(0);
    ctx.save();
    ctx.translate(p.x, y0);
    if (k.id === 'blender') {
      const h = k.h, w = k.w, base = -14;
      ctx.fillStyle = '#232b3a';                             // motor base, sat on the floor
      ctx.beginPath(); ctx.roundRect(-w / 2 - 3, base, w + 6, 14, 3); ctx.fill();
      ctx.fillStyle = p.feed ? '#3ddc97' : '#4a5468';        // the little running light
      ctx.beginPath(); ctx.arc(-w / 2 + 3, base + 7, 2, 0, 6.283); ctx.fill();

      const jug = (yb, yt) => {                              // slightly flared, like a jug
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 3, yb); ctx.lineTo(-w / 2, yt);
        ctx.lineTo(w / 2, yt); ctx.lineTo(w / 2 - 3, yb);
        ctx.closePath();
      };
      ctx.save();
      jug(base, -h); ctx.clip();
      ctx.fillStyle = 'rgba(150,180,230,.10)';
      ctx.fillRect(-w, -h - 4, w * 2, h + 20);
      if (p.fill > 0) {                                      // what is left of them
        const top = base - (h - 20) * p.fill;
        ctx.fillStyle = 'rgba(158,20,26,.82)';
        ctx.fillRect(-w, top, w * 2, base - top + 2);
        ctx.fillStyle = 'rgba(210,50,50,.55)';
        ctx.fillRect(-w, top, w * 2, 2.5);
      }
      ctx.fillStyle = 'rgba(255,255,255,.13)';               // glass highlight
      ctx.fillRect(-w / 2 + 5, -h + 3, 3.5, h - 20);
      ctx.restore();

      ctx.strokeStyle = 'rgba(216,230,255,.62)'; ctx.lineWidth = 1.8;
      jug(base, -h); ctx.stroke();
      ctx.fillStyle = '#39455a';  // lid
      ctx.beginPath(); ctx.roundRect(-w / 2 - 2, -h - 5, w + 4, 6, 2); ctx.fill();

      ctx.save();                                            // blades, down in the bottom
      ctx.translate(0, base - 6);
      ctx.rotate(p.spin);
      ctx.fillStyle = '#c3cfe4';
      for (let i = 0; i < 3; i++) { ctx.rotate(2.094); ctx.fillRect(0, -1.4, w / 2 - 7, 2.8); }
      ctx.fillStyle = '#8a99b4';
      ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, 6.283); ctx.fill();
      ctx.restore();

      ctx.restore();
      return;
    }
    /* spike bed */
    ctx.fillStyle = '#2a3244';
    ctx.fillRect(-k.w / 2, -2, k.w, 5);
    ctx.fillStyle = '#c3cfe4';
    for (let x = -k.w / 2 + 3; x < k.w / 2 - 2; x += 7) {
      ctx.beginPath();
      ctx.moveTo(x, -2); ctx.lineTo(x + 3.2, -k.h); ctx.lineTo(x + 6.4, -2);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  SL.props = { CATALOGUE, byId, make, step, draw, grabPoint, nearest, detonate, surfaceV };
})(window.SL);
