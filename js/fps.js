/* Scupper Jump — Stick Ops, the first-person mode.

   A raycaster in the Wolfenstein mould: one ray per screen column, DDA through
   a grid, and a vertical slice of wall drawn per hit. Everything else in the
   world is a billboard — and since the billboards are stick figures, the same
   SL.stick renderer that draws the climbing man draws the people shooting at
   you, hats and faces and all.

   Nothing here is an image file. The wall textures are generated into offscreen
   canvases at boot, the same way the sound effects are synthesised. */
(function (SL) {
  'use strict';
  const { clamp } = SL.util;

  /* ---------------- shape of the world ---------------- */
  const MW = 24, MH = 24;            // map is a grid of cells, 1 unit each
  const PLANE = 0.62;                // camera plane half-length — about a 64° view
  /* The play column is tall and narrow, so a room only one unit high leaves the
     top half of the screen as empty ceiling. Tall rooms, with the eye down at
     stick-figure height, fill the column and read like a corridor. */
  const WALL_H = 3.0;
  const EYE = 0.92;                 // eye height above the floor, in cells
  const R_PLR = 0.24;               // player radius, for wall collision
  const R_FOE = 0.30;

  const SPEED = 2.65;               // units/second
  const STRAFE = 2.15;
  const TURN = 2.5;                 // radians/second on the keyboard

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];

  /* ---------------- weapons ---------------- */
  const GUNS = [
    { id: 'pistol', name: 'Pistol', dmg: 34, rof: 0.28, spread: 0.012, pellets: 1,
      range: 26, ammo: -1, kick: 0.9, sound: 'jump', auto: false },
    { id: 'smg', name: 'SMG', dmg: 19, rof: 0.085, spread: 0.045, pellets: 1,
      range: 20, ammo: 140, kick: 0.5, sound: 'jump', auto: true },
    { id: 'shotgun', name: 'Shotgun', dmg: 17, rof: 0.72, spread: 0.14, pellets: 8,
      range: 12, ammo: 40, kick: 2.6, sound: 'splat', auto: false }
  ];
  const gunById = {};
  for (const g of GUNS) gunById[g.id] = g;

  /* ---------------- who is shooting at you ---------------- */
  const SKINS = ['#ff6b6b', '#57b6ff', '#b6ff5c', '#c9a4ff', '#ff8a3d', '#5cffc1', '#ffd166', '#e9eefb'];
  const HATS = [null, 'hat_cap', 'hat_beanie', 'hat_cork', 'hat_akubra', 'hat_prop'];
  const BUILDS = ['build_classic', 'build_lanky', 'build_stocky', 'build_buff', 'build_pip'];
  const FACES = ['face_angry', 'face_angry', 'face_classic', 'face_surprised', 'face_cool'];

  const KINDS = {
    /* walks at you and swings; cheap, and there are always more */
    bruiser: { hp: 58, speed: 1.35, reach: 0.95, dmg: 11, cool: 0.9, pay: 9, ranged: false },
    /* hangs back and shoots — the reason you have to keep moving */
    gunner: { hp: 42, speed: 1.05, reach: 7.5, dmg: 9, cool: 1.5, pay: 14, ranged: true, keep: 4.2 }
  };

  /* ---------------- procedural wall textures ----------------
     Built once into offscreen canvases. Column sampling then costs one
     drawImage per screen column, which Canvas2D handles happily at this size. */
  const TEX = [];
  const TEX_N = 64;
  function buildTextures() {
    if (TEX.length) return;
    const make = (paint) => {
      const c = document.createElement('canvas');
      c.width = TEX_N; c.height = TEX_N;
      paint(c.getContext('2d'));
      return c;
    };
    /* 1: brick */
    TEX[1] = make((x) => {
      x.fillStyle = '#2c2620'; x.fillRect(0, 0, TEX_N, TEX_N);
      for (let row = 0; row < 8; row++) {
        const off = (row % 2) ? 8 : 0;
        for (let col = -1; col < 5; col++) {
          const bx = col * 16 + off + 1, by = row * 8 + 1;
          const v = 88 + ((row * 7 + col * 13) % 26);
          x.fillStyle = 'rgb(' + (v + 34) + ',' + (v - 6) + ',' + (v - 22) + ')';
          x.fillRect(bx, by, 14, 6);
        }
      }
    });
    /* 2: riveted metal panel */
    TEX[2] = make((x) => {
      const g = x.createLinearGradient(0, 0, 0, TEX_N);
      g.addColorStop(0, '#4a5468'); g.addColorStop(0.5, '#333c4d'); g.addColorStop(1, '#252c3a');
      x.fillStyle = g; x.fillRect(0, 0, TEX_N, TEX_N);
      x.strokeStyle = 'rgba(12,16,24,.7)'; x.lineWidth = 2;
      for (let i = 0; i <= TEX_N; i += 32) {
        x.beginPath(); x.moveTo(i, 0); x.lineTo(i, TEX_N); x.stroke();
      }
      x.fillStyle = 'rgba(200,215,240,.35)';
      for (let yy = 8; yy < TEX_N; yy += 16) for (let xx = 6; xx < TEX_N; xx += 32) {
        x.beginPath(); x.arc(xx, yy, 1.6, 0, 6.284); x.fill();
      }
    });
    /* 3: corrugated tin — the back-fence look */
    TEX[3] = make((x) => {
      for (let i = 0; i < TEX_N; i++) {
        const v = 96 + Math.sin(i * 0.78) * 34;
        x.fillStyle = 'rgb(' + (v | 0) + ',' + ((v + 8) | 0) + ',' + ((v + 18) | 0) + ')';
        x.fillRect(i, 0, 1, TEX_N);
      }
      x.fillStyle = 'rgba(140,90,50,.22)';
      for (let i = 0; i < 22; i++) {
        x.fillRect(Math.random() * TEX_N, Math.random() * TEX_N, Math.random() * 9 + 2, Math.random() * 5 + 2);
      }
    });
    /* 4: the exit-ish hazard stripe, used sparingly so it reads as a landmark */
    TEX[4] = make((x) => {
      x.fillStyle = '#1d232f'; x.fillRect(0, 0, TEX_N, TEX_N);
      x.strokeStyle = '#ffb037'; x.lineWidth = 7;
      for (let i = -TEX_N; i < TEX_N * 2; i += 18) {
        x.beginPath(); x.moveTo(i, 0); x.lineTo(i + TEX_N, TEX_N); x.stroke();
      }
    });
  }

  /* ---------------- the map ----------------
     Solid border, open middle, then blocks dropped in. Anything that would cut
     the floor in two is put back — a room you cannot walk out of is not a map. */
  function blankMap() {
    const m = new Uint8Array(MW * MH);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (x === 0 || y === 0 || x === MW - 1 || y === MH - 1) m[y * MW + x] = 2;
    }
    return m;
  }
  const solid = (m, x, y) =>
    x < 0 || y < 0 || x >= MW || y >= MH ? 1 : m[(y | 0) * MW + (x | 0)];

  /** Flood the open cells from one spot; used to prove the map is walkable. */
  function reachable(m, sx, sy) {
    const seen = new Uint8Array(MW * MH);
    const q = [sy * MW + sx];
    seen[q[0]] = 1;
    let n = 1;
    while (q.length) {
      const i = q.pop(), x = i % MW, y = (i / MW) | 0;
      const push = (nx, ny) => {
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) return;
        const j = ny * MW + nx;
        if (seen[j] || m[j]) return;
        seen[j] = 1; n++; q.push(j);
      };
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }
    return { seen, n };
  }
  function openCells(m) {
    let n = 0;
    for (let i = 0; i < m.length; i++) if (!m[i]) n++;
    return n;
  }

  function buildMap() {
    const m = blankMap();
    const put = [];
    for (let tries = 0; tries < 70; tries++) {
      const horiz = Math.random() < 0.5;
      const len = 1 + ((Math.random() * 4) | 0);
      const x0 = 2 + ((Math.random() * (MW - 5)) | 0);
      const y0 = 2 + ((Math.random() * (MH - 5)) | 0);
      const cells = [];
      for (let i = 0; i < len; i++) {
        const x = horiz ? x0 + i : x0, y = horiz ? y0 : y0 + i;
        if (x >= MW - 1 || y >= MH - 1) break;
        if (m[y * MW + x]) continue;
        cells.push(y * MW + x);
      }
      if (!cells.length) continue;
      const t = Math.random() < 0.12 ? 4 : (Math.random() < 0.5 ? 1 : (Math.random() < 0.6 ? 2 : 3));
      for (const i of cells) m[i] = t;
      /* if that walled something off, take it back out */
      const start = firstOpen(m);
      if (!start || reachable(m, start[0], start[1]).n !== openCells(m)) {
        for (const i of cells) m[i] = 0;
      } else {
        put.push(cells);
      }
    }
    return m;
  }
  function firstOpen(m) {
    for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) if (!m[y * MW + x]) return [x, y];
    return null;
  }

  /** A random open cell at least `away` from (px,py). */
  function freeSpot(m, px, py, away) {
    for (let i = 0; i < 400; i++) {
      const x = 1 + ((Math.random() * (MW - 2)) | 0);
      const y = 1 + ((Math.random() * (MH - 2)) | 0);
      if (m[y * MW + x]) continue;
      const cx = x + 0.5, cy = y + 0.5;
      if (Math.hypot(cx - px, cy - py) < away) continue;
      return { x: cx, y: cy };
    }
    const f = firstOpen(m);
    return f ? { x: f[0] + 0.5, y: f[1] + 0.5 } : { x: 1.5, y: 1.5 };
  }

  /* ---------------- line of sight ---------------- */
  function clearLine(m, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    const steps = Math.ceil(d * 8);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (solid(m, x0 + dx * t, y0 + dy * t)) return false;
    }
    return true;
  }

  /* ---------------- getting to you ----------------
     A breadth-first flood from the player's cell: every open cell records how
     many steps it is from you. A foe that has lost sight of you can then walk
     the corridors toward you instead of milling about in a corner, which is
     what a plain "charge if you can see them" rule leaves them doing. */
  function buildFlow(ops) {
    const f = ops.flow || (ops.flow = new Int16Array(MW * MH));
    f.fill(-1);
    const sx = ops.x | 0, sy = ops.y | 0;
    if (sx < 0 || sy < 0 || sx >= MW || sy >= MH || ops.map[sy * MW + sx]) return;
    const q = ops.flowQ || (ops.flowQ = new Int32Array(MW * MH));
    let head = 0, tail = 0;
    f[sy * MW + sx] = 0;
    q[tail++] = sy * MW + sx;
    while (head < tail) {
      const i = q[head++], x = i % MW, y = (i / MW) | 0, d = f[i];
      if (x + 1 < MW) { const j = i + 1; if (f[j] === -1 && !ops.map[j]) { f[j] = d + 1; q[tail++] = j; } }
      if (x - 1 >= 0) { const j = i - 1; if (f[j] === -1 && !ops.map[j]) { f[j] = d + 1; q[tail++] = j; } }
      if (y + 1 < MH) { const j = i + MW; if (f[j] === -1 && !ops.map[j]) { f[j] = d + 1; q[tail++] = j; } }
      if (y - 1 >= 0) { const j = i - MW; if (f[j] === -1 && !ops.map[j]) { f[j] = d + 1; q[tail++] = j; } }
    }
  }

  /** Unit vector toward the neighbouring cell that is closer to the player. */
  function flowStep(ops, x, y) {
    const f = ops.flow;
    if (!f) return null;
    const cx = x | 0, cy = y | 0;
    if (cx < 0 || cy < 0 || cx >= MW || cy >= MH) return null;
    const here = f[cy * MW + cx];
    if (here <= 0) return null;
    let bd = here, bx = 0, by = 0;
    const look = (nx, ny) => {
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) return;
      const v = f[ny * MW + nx];
      if (v === -1 || v >= bd) return;
      bd = v; bx = nx; by = ny;
    };
    look(cx + 1, cy); look(cx - 1, cy); look(cx, cy + 1); look(cx, cy - 1);
    if (bd === here) return null;
    const dx = (bx + 0.5) - x, dy = (by + 0.5) - y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }

  /* ---------------- movement ---------------- */
  /** Slide along walls rather than sticking to them: resolve each axis alone. */
  function moveBody(m, b, dx, dy, r) {
    if (dx) {
      const nx = b.x + dx;
      if (!solid(m, nx + Math.sign(dx) * r, b.y - r) &&
          !solid(m, nx + Math.sign(dx) * r, b.y + r)) b.x = nx;
    }
    if (dy) {
      const ny = b.y + dy;
      if (!solid(m, b.x - r, ny + Math.sign(dy) * r) &&
          !solid(m, b.x + r, ny + Math.sign(dy) * r)) b.y = ny;
    }
  }

  /* ---------------- lifecycle ---------------- */
  function start(S) {
    buildTextures();
    const map = buildMap();
    const f = firstOpen(map);
    const spawn = { x: f[0] + 0.5, y: f[1] + 0.5 };
    const ops = {
      map, t: 0, wave: 0, waveT: 1.6, between: true, over: false, result: null,
      kills: 0, earned: 0, pending: 0,
      hp: 100, hpMax: 100, hurt: 0, invuln: 0,
      x: spawn.x, y: spawn.y, ang: Math.random() * 6.28,
      flow: null, flowQ: null, flowT: 0,
      bob: 0, kick: 0, flash: 0, shake: 0,
      gun: 'pistol', ammo: { pistol: -1, smg: 0, shotgun: 0 },
      fire: false, cool: 0, tracers: [], marks: [],
      foes: [], shots: [], pickups: [],
      look: 0, stick: { x: 0, y: 0 }, keys: {},
      banner: 0, bannerTxt: ''
    };
    S.ops = ops;
    return ops;
  }

  function waveSize(n) { return Math.min(14, 2 + Math.ceil(n * 1.35)); }

  function startWave(S, ops) {
    ops.wave++;
    ops.between = false;
    const n = waveSize(ops.wave);
    const gunnerFrom = 2;
    for (let i = 0; i < n; i++) {
      const ranged = ops.wave >= gunnerFrom && Math.random() < Math.min(0.45, 0.12 + ops.wave * 0.05);
      spawnFoe(S, ops, ranged ? 'gunner' : 'bruiser');
    }
    /* something to pick up, so there is a reason to leave the corner you like */
    if (ops.wave % 2 === 0) dropPickup(ops, Math.random() < 0.5 ? 'smg' : 'shotgun');
    if (ops.wave % 3 === 0) dropPickup(ops, 'med');
    ops.banner = 2.2;
    ops.bannerTxt = 'WAVE ' + ops.wave;
    SL.audio.play('check');
  }

  function spawnFoe(S, ops, kindId) {
    const k = KINDS[kindId];
    const s = freeSpot(ops.map, ops.x, ops.y, 6.5);
    const tough = 1 + (ops.wave - 1) * 0.16;
    ops.foes.push({
      kind: kindId, k, x: s.x, y: s.y,
      hp: k.hp * tough, hpMax: k.hp * tough,
      speed: k.speed * (1 + (ops.wave - 1) * 0.045) * rnd(0.9, 1.12),
      colour: pick(SKINS), hat: pick(HATS), build: pick(BUILDS), face: pick(FACES),
      phase: rnd(0, 6.28), cool: rnd(0.3, 1.2), pose: 'idle',
      dying: 0, dead: false, hurt: 0, wanderT: 0, wx: s.x, wy: s.y
    });
  }

  function dropPickup(ops, what) {
    const s = freeSpot(ops.map, ops.x, ops.y, 3.5);
    ops.pickups.push({ what, x: s.x, y: s.y, t: 0 });
  }

  /* ---------------- shooting ---------------- */
  function shoot(S, ops) {
    const g = gunById[ops.gun];
    const have = ops.ammo[ops.gun];
    if (have === 0) {                       // dry: fall back rather than click uselessly
      ops.gun = 'pistol';
      SL.audio.play('nope');
      return;
    }
    ops.cool = g.rof;
    if (have > 0) ops.ammo[ops.gun] = have - 1;
    ops.kick = g.kick;
    ops.flash = 0.06;
    ops.shake = Math.min(1, ops.shake + g.kick * 0.06);
    SL.audio.play(g.sound);
    SL.util.vibrate(SL.save.data.settings.haptic ? (g.id === 'shotgun' ? 24 : 9) : 0);

    for (let p = 0; p < g.pellets; p++) {
      const a = ops.ang + (Math.random() - 0.5) * g.spread * 2;
      hitscan(S, ops, a, g);
    }
  }

  /** One bullet: nearest foe within the beam, unless a wall gets there first. */
  function hitscan(S, ops, a, g) {
    const dx = Math.cos(a), dy = Math.sin(a);
    const wall = castWall(ops.map, ops.x, ops.y, dx, dy, g.range);
    let best = null, bestD = Math.min(wall.dist, g.range);
    for (const f of ops.foes) {
      if (f.dead || f.dying) continue;
      const rx = f.x - ops.x, ry = f.y - ops.y;
      const along = rx * dx + ry * dy;                 // distance down the beam
      if (along <= 0.2 || along > bestD) continue;
      const off = Math.abs(rx * dy - ry * dx);         // how far off the beam it sits
      if (off > R_FOE) continue;
      bestD = along; best = f;
    }
    if (best) {
      damageFoe(S, ops, best, g.dmg * (best.kind === 'gunner' ? 1.15 : 1));
      ops.tracers.push({ x0: ops.x, y0: ops.y, x: ops.x + dx * bestD, y: ops.y + dy * bestD, t: 0, hit: true });
    } else {
      const d = Math.min(wall.dist, g.range);
      ops.tracers.push({ x0: ops.x, y0: ops.y, x: ops.x + dx * d, y: ops.y + dy * d, t: 0, hit: false });
    }
    if (ops.tracers.length > 40) ops.tracers.shift();
  }

  function damageFoe(S, ops, f, dmg) {
    f.hp -= dmg;
    f.hurt = 0.16;
    if (f.hp > 0) { SL.audio.play('squelch'); return; }
    f.dying = 0.85;
    f.pose = 'trip';
    ops.kills++;
    const pay = Math.round(f.k.pay * (1 + (ops.wave - 1) * 0.08));
    ops.earned += pay;
    ops.pending += pay;
    SL.audio.play('splat');
  }

  /** DDA until it meets a wall. Returns the perpendicular-ish distance and side. */
  function castWall(map, px, py, dx, dy, max) {
    let mx = px | 0, my = py | 0;
    const ddx = dx === 0 ? 1e30 : Math.abs(1 / dx);
    const ddy = dy === 0 ? 1e30 : Math.abs(1 / dy);
    let sx, sy, sdx, sdy;
    if (dx < 0) { sx = -1; sdx = (px - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - px) * ddx; }
    if (dy < 0) { sy = -1; sdy = (py - my) * ddy; } else { sy = 1; sdy = (my + 1 - py) * ddy; }
    let side = 0, tile = 0;
    for (let guard = 0; guard < 128; guard++) {
      if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; }
      else { sdy += ddy; my += sy; side = 1; }
      if (mx < 0 || my < 0 || mx >= MW || my >= MH) { tile = 2; break; }
      tile = map[my * MW + mx];
      if (tile) break;
      if ((side ? sdy : sdx) > max) return { dist: max, side, tile: 0, mx, my };
    }
    const dist = side === 0 ? (sdx - ddx) : (sdy - ddy);
    return { dist: Math.max(0.0001, dist), side, tile, mx, my };
  }

  /* ---------------- the frame of simulation ---------------- */
  function step(S, dt) {
    const ops = S.ops;
    if (!ops) return;
    ops.t += dt;
    if (ops.hurt > 0) ops.hurt -= dt;
    if (ops.invuln > 0) ops.invuln -= dt;
    if (ops.flash > 0) ops.flash -= dt;
    if (ops.banner > 0) ops.banner -= dt;
    ops.kick += (0 - ops.kick) * Math.min(1, dt * 11);
    ops.shake *= Math.max(0, 1 - dt * 4);

    /* the path everyone follows to you, refreshed a few times a second */
    ops.flowT -= dt;
    if (ops.flowT <= 0) { ops.flowT = 0.22; buildFlow(ops); }

    if (!ops.over) {
      movePlayer(S, ops, dt);
      if (ops.cool > 0) ops.cool -= dt;
      const g = gunById[ops.gun];
      if (ops.fire && ops.cool <= 0) {
        if (g.auto || !ops.firedThis) shoot(S, ops);
        ops.firedThis = true;
      }
      if (!ops.fire) ops.firedThis = false;
    }

    for (let i = ops.foes.length - 1; i >= 0; i--) {
      const f = ops.foes[i];
      if (f.hurt > 0) f.hurt -= dt;
      if (f.dying > 0) {
        f.dying -= dt;
        if (f.dying <= 0) { ops.foes.splice(i, 1); }
        continue;
      }
      if (!ops.over) thinkFoe(S, ops, f, dt);
    }

    stepShots(S, ops, dt);
    stepPickups(S, ops, dt);

    for (let i = ops.tracers.length - 1; i >= 0; i--) {
      ops.tracers[i].t += dt;
      if (ops.tracers[i].t > 0.09) ops.tracers.splice(i, 1);
    }

    /* waves: a breather, then the next lot */
    if (!ops.over) {
      const alive = ops.foes.filter((f) => !f.dying).length;
      if (ops.between) {
        ops.waveT -= dt;
        if (ops.waveT <= 0) startWave(S, ops);
      } else if (alive === 0) {
        ops.between = true;
        ops.waveT = 3.2;
        const bonus = 20 + ops.wave * 10;
        ops.earned += bonus; ops.pending += bonus;
        ops.banner = 2.4;
        ops.bannerTxt = 'WAVE ' + ops.wave + ' CLEAR  +' + bonus;
        SL.audio.play('coin');
      }
    }

    /* pay in dribs so the wallet ticks over as you play */
    if (ops.pending > 0) {
      const give = Math.min(ops.pending, Math.max(1, Math.ceil(ops.pending * dt * 6)));
      ops.pending -= give;
      SL.save.addCredits(give);
    }
    S.hudDirty = true;
  }

  function movePlayer(S, ops, dt) {
    const k = ops.keys;
    let fwd = (k.fwd ? 1 : 0) - (k.back ? 1 : 0);
    let side = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    /* the touch stick adds into the same pair */
    fwd += -ops.stick.y;
    side += ops.stick.x;
    fwd = clamp(fwd, -1, 1); side = clamp(side, -1, 1);

    if (k.turnL) ops.ang -= TURN * dt;
    if (k.turnR) ops.ang += TURN * dt;
    if (ops.look) { ops.ang += ops.look; ops.look = 0; }

    const c = Math.cos(ops.ang), s = Math.sin(ops.ang);
    const vx = (c * fwd * SPEED + -s * side * STRAFE) * dt;
    const vy = (s * fwd * SPEED + c * side * STRAFE) * dt;
    moveBody(ops.map, ops, vx, vy, R_PLR);
    const moving = Math.abs(fwd) + Math.abs(side) > 0.05;
    ops.bob += dt * (moving ? 9 : 3);
    ops.moving = moving;
  }

  function thinkFoe(S, ops, f, dt) {
    const k = f.k;
    const dx = ops.x - f.x, dy = ops.y - f.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const sees = d < 15 && clearLine(ops.map, f.x, f.y, ops.x, ops.y);
    f.cool -= dt;

    let tx = 0, ty = 0;
    if (sees) {
      if (k.ranged) {
        /* keep a working distance: close if far, back off if crowded */
        const want = k.keep;
        const push = d > want + 0.7 ? 1 : d < want - 1.2 ? -1 : 0;
        tx = dx / d * push; ty = dy / d * push;
        /* sidestep so they are not a stationary target */
        tx += -dy / d * Math.sin(ops.t * 1.7 + f.phase) * 0.55;
        ty += dx / d * Math.sin(ops.t * 1.7 + f.phase) * 0.55;
        if (f.cool <= 0 && d < k.reach) {
          f.cool = k.cool * rnd(0.8, 1.25);
          fireAtPlayer(S, ops, f);
          f.pose = 'punch';
        }
      } else {
        tx = dx / d; ty = dy / d;
        if (d < k.reach) {
          tx = ty = 0;
          if (f.cool <= 0) {
            f.cool = k.cool;
            f.pose = 'punch';
            hurtPlayer(S, ops, k.dmg);
          }
        }
      }
      f.wx = ops.x; f.wy = ops.y;
    } else {
      /* out of sight: follow the flow field round the corners to you */
      const st = flowStep(ops, f.x, f.y);
      if (st) {
        tx = st.x; ty = st.y;
        /* a little jitter so a pack does not walk in single file */
        tx += Math.sin(ops.t * 2.1 + f.phase) * 0.16;
        ty += Math.cos(ops.t * 1.9 + f.phase) * 0.16;
      } else {
        f.wanderT -= dt;
        if (f.wanderT <= 0) {
          f.wanderT = rnd(1.2, 2.6);
          const sp = freeSpot(ops.map, f.x, f.y, 2.5);
          f.wx = sp.x; f.wy = sp.y;
        }
        const wdx = f.wx - f.x, wdy = f.wy - f.y;
        const wd = Math.hypot(wdx, wdy) || 1;
        tx = wdx / wd; ty = wdy / wd;
      }
    }

    const mag = Math.hypot(tx, ty);
    if (mag > 0.02) {
      moveBody(ops.map, f, tx / mag * f.speed * dt, ty / mag * f.speed * dt, R_FOE);
      f.phase += dt * 7;
      if (f.pose !== 'punch' || f.cool < k.cool - 0.22) f.pose = 'run';
    } else if (f.cool < k.cool - 0.25) {
      f.pose = 'idle';
      f.phase += dt * 2;
    }
  }

  function fireAtPlayer(S, ops, f) {
    const a = Math.atan2(ops.y - f.y, ops.x - f.x) + rnd(-0.09, 0.09);
    ops.shots.push({
      x: f.x + Math.cos(a) * 0.35, y: f.y + Math.sin(a) * 0.35,
      vx: Math.cos(a) * 7.2, vy: Math.sin(a) * 7.2,
      dmg: f.k.dmg, life: 2.4, t: 0
    });
    SL.audio.play('ui');
  }

  function stepShots(S, ops, dt) {
    for (let i = ops.shots.length - 1; i >= 0; i--) {
      const b = ops.shots[i];
      b.t += dt; b.life -= dt;
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      if (b.life <= 0 || solid(ops.map, nx, ny)) { ops.shots.splice(i, 1); continue; }
      b.x = nx; b.y = ny;
      if (!ops.over && Math.hypot(b.x - ops.x, b.y - ops.y) < R_PLR + 0.14) {
        ops.shots.splice(i, 1);
        hurtPlayer(S, ops, b.dmg);
      }
    }
  }

  function stepPickups(S, ops, dt) {
    for (let i = ops.pickups.length - 1; i >= 0; i--) {
      const p = ops.pickups[i];
      p.t += dt;
      if (ops.over || Math.hypot(p.x - ops.x, p.y - ops.y) > 0.55) continue;
      ops.pickups.splice(i, 1);
      if (p.what === 'med') {
        ops.hp = Math.min(ops.hpMax, ops.hp + 35);
        ops.banner = 1.2; ops.bannerTxt = '+35 HEALTH';
      } else {
        const g = gunById[p.what];
        ops.ammo[p.what] = Math.min(g.ammo * 2, (ops.ammo[p.what] || 0) + g.ammo);
        ops.gun = p.what;
        ops.banner = 1.2; ops.bannerTxt = g.name.toUpperCase();
      }
      SL.audio.play('coin');
    }
  }

  function hurtPlayer(S, ops, dmg) {
    if (ops.over || ops.invuln > 0) return;
    ops.hp -= dmg;
    ops.hurt = 0.4;
    ops.invuln = 0.25;
    ops.shake = Math.min(1.4, ops.shake + 0.5);
    SL.audio.play('hurt');
    SL.util.vibrate(SL.save.data.settings.haptic ? 30 : 0);
    if (ops.hp <= 0) { ops.hp = 0; endRun(S, ops); }
  }

  function endRun(S, ops) {
    if (ops.over) return;
    ops.over = true;
    ops.fire = false;
    SL.audio.play('die');
    const best = SL.save.opsBest ? SL.save.opsBest() : 0;
    const isBest = ops.wave > best;
    if (isBest && SL.save.setOpsBest) SL.save.setOpsBest(ops.wave);
    ops.result = {
      wave: ops.wave, best: Math.max(best, ops.wave), isBest,
      kills: ops.kills, earned: ops.earned
    };
  }

  /* ---------------- drawing ----------------
     One ray per column into a z-buffer, then billboards clipped against it. */
  let scratch = null, sctx = null;
  const SW = 96, SH = 116;
  function ensureScratch() {
    if (scratch) return;
    scratch = document.createElement('canvas');
    scratch.width = SW; scratch.height = SH;
    sctx = scratch.getContext('2d');
  }

  const zbuf = new Float32Array(1024);

  function draw(ctx, S, view, t) {
    const ops = S.ops;
    if (!ops) return;
    ensureScratch();
    const W = view.w, H = view.h;
    const dirX = Math.cos(ops.ang), dirY = Math.sin(ops.ang);
    const plX = -dirY * PLANE, plY = dirX * PLANE;

    /* a little sway so it does not feel like a slideshow */
    const bobY = Math.sin(ops.bob) * (ops.moving ? 3.2 : 1.1);
    const shakeY = ops.shake * Math.sin(ops.t * 60) * 5;
    const horizon = H * 0.5 + bobY + shakeY - ops.kick * 5;
    const projD = (W / 2) / PLANE;

    /* ceiling and floor: flat gradients rather than per-pixel casting */
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#0d1220'); sky.addColorStop(1, '#1b2334');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, Math.max(0, horizon));
    const gnd = ctx.createLinearGradient(0, horizon, 0, H);
    gnd.addColorStop(0, '#171310'); gnd.addColorStop(1, '#38302a');
    ctx.fillStyle = gnd;
    ctx.fillRect(0, Math.max(0, horizon), W, H - Math.max(0, horizon));

    /* Floor and ceiling grid. Per-pixel floorcasting is far too dear for this,
       but a grid line is straight in world space and a pinhole camera maps
       straight to straight — so two projected endpoints and a stroke will do.
       Drawn before the walls, which then occlude whatever is behind them. */
    gridLines(ctx, ops, horizon, projD, W, dirX, dirY, plX, plY);

    /* ---- walls ---- */
    ctx.imageSmoothingEnabled = false;
    for (let x = 0; x < W; x++) {
      const cam = 2 * x / W - 1;
      const rx = dirX + plX * cam, ry = dirY + plY * cam;
      const hit = castWall(ops.map, ops.x, ops.y, rx, ry, 40);
      const d = hit.dist;
      zbuf[x] = d;
      if (!hit.tile) continue;
      /* the floor meets the wall at eye-height projection; the wall runs up
         from there, so the slice is only symmetric if the eye is mid-wall */
      const lh = projD * WALL_H / d;
      const top = horizon + projD * EYE / d - lh;
      /* where along the wall face it landed, for the texture column */
      let wallX = hit.side === 0 ? ops.y + d * ry : ops.x + d * rx;
      wallX -= Math.floor(wallX);
      let tx = (wallX * TEX_N) | 0;
      if ((hit.side === 0 && rx > 0) || (hit.side === 1 && ry < 0)) tx = TEX_N - tx - 1;
      const tex = TEX[hit.tile] || TEX[1];
      ctx.drawImage(tex, tx, 0, 1, TEX_N, x, top, 1, lh);
      /* shade: the far end of a corridor goes dark, and one axis is dimmer so
         corners read as corners */
      const fog = clamp(d / 17, 0, 0.86) * 0.9 + (hit.side ? 0.16 : 0);
      if (fog > 0.01) {
        ctx.fillStyle = 'rgba(6,9,16,' + Math.min(0.92, fog) + ')';
        ctx.fillRect(x, top, 1, lh);
      }
    }
    ctx.imageSmoothingEnabled = true;

    /* ---- everything that is not a wall, far to near ---- */
    const things = [];
    for (const f of ops.foes) things.push({ kind: 'foe', o: f, x: f.x, y: f.y });
    for (const p of ops.pickups) things.push({ kind: 'pick', o: p, x: p.x, y: p.y });
    for (const b of ops.shots) things.push({ kind: 'shot', o: b, x: b.x, y: b.y });
    for (const th of things) th.d = (th.x - ops.x) ** 2 + (th.y - ops.y) ** 2;
    things.sort((a, b) => b.d - a.d);

    const invDet = 1 / (plX * dirY - dirX * plY);
    for (const th of things) {
      const rx = th.x - ops.x, ry = th.y - ops.y;
      const tX = invDet * (dirY * rx - dirX * ry);
      const tY = invDet * (-plY * rx + plX * ry);            // depth along the view
      if (tY < 0.08) continue;
      const scr = (W / 2) * (1 + tX / tY);
      if (th.kind === 'foe') drawFoe(ctx, ops, th.o, scr, tY, projD, horizon, W, t);
      else if (th.kind === 'pick') drawPickup(ctx, th.o, scr, tY, projD, horizon, W, t);
      else drawShot(ctx, th.o, scr, tY, projD, horizon, W);
    }

    drawHud(ctx, S, ops, view, t, horizon);
  }

  const GRID_R = 15;                  // how many cells out to bother drawing
  function gridLines(ctx, ops, horizon, projD, W, dirX, dirY, plX, plY) {
    const invDet = 1 / (plX * dirY - dirX * plY);
    const NEAR = 0.14;
    const x0 = Math.max(0, (ops.x | 0) - GRID_R), x1 = Math.min(MW, (ops.x | 0) + GRID_R + 1);
    const y0 = Math.max(0, (ops.y | 0) - GRID_R), y1 = Math.min(MH, (ops.y | 0) + GRID_R + 1);

    const run = (hUnits, style) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const seg = (ax, ay, bx, by) => {
        let arx = ax - ops.x, ary = ay - ops.y;
        let brx = bx - ops.x, bry = by - ops.y;
        let aX = invDet * (dirY * arx - dirX * ary), aY = invDet * (-plY * arx + plX * ary);
        let bX = invDet * (dirY * brx - dirX * bry), bY = invDet * (-plY * brx + plX * bry);
        if (aY < NEAR && bY < NEAR) return;
        if (aY < NEAR) { const t = (NEAR - aY) / (bY - aY); aX += (bX - aX) * t; aY = NEAR; }
        if (bY < NEAR) { const t = (NEAR - bY) / (aY - bY); bX += (aX - bX) * t; bY = NEAR; }
        ctx.moveTo((W / 2) * (1 + aX / aY), horizon + projD * hUnits / aY);
        ctx.lineTo((W / 2) * (1 + bX / bY), horizon + projD * hUnits / bY);
      };
      for (let x = x0; x <= x1; x++) seg(x, y0, x, y1);
      for (let y = y0; y <= y1; y++) seg(x0, y, x1, y);
      ctx.stroke();
    };

    ctx.save();
    run(EYE, 'rgba(150,120,92,.20)');                    // the floor
    run(EYE - WALL_H, 'rgba(120,140,190,.10)');          // and the ceiling above
    ctx.restore();
  }

  /** Blit a sprite in runs of columns that are actually in front of the wall. */
  function blitClipped(ctx, img, sx0, sw, top, h, depth, W) {
    const x0 = Math.max(0, Math.floor(sx0)), x1 = Math.min(W - 1, Math.ceil(sx0 + sw));
    let x = x0;
    while (x <= x1) {
      while (x <= x1 && zbuf[x] < depth) x++;
      if (x > x1) break;
      const runStart = x;
      while (x <= x1 && zbuf[x] >= depth) x++;
      const run = x - runStart;
      if (run <= 0) break;
      const u0 = (runStart - sx0) / sw, u1 = (runStart + run - sx0) / sw;
      const su = clamp(u0, 0, 1) * img.width;
      const sw2 = Math.max(0.5, (clamp(u1, 0, 1) - clamp(u0, 0, 1)) * img.width);
      ctx.drawImage(img, su, 0, sw2, img.height, runStart, top, run, h);
    }
  }

  function drawFoe(ctx, ops, f, scr, depth, projD, horizon, W, t) {
    const hUnits = 0.92;
    const feet = horizon + projD * EYE / depth;
    const h = projD * hUnits / depth;
    const w = h * (SW / SH);
    const top = feet - h;
    if (feet < -50 || top > 1e4 || h < 1) return;

    sctx.clearRect(0, 0, SW, SH);
    sctx.save();
    sctx.translate(SW / 2, SH - 10);
    const k = (SH - 16) / SL.stick.H;
    sctx.scale(k, k);
    /* they fall away from you as they go down */
    if (f.dying > 0) {
      const p = 1 - f.dying / 0.85;
      sctx.translate(0, -SL.stick.H * 0.1 * p);
      sctx.rotate(p * 1.35);
      sctx.globalAlpha = clamp(1.15 - p, 0.15, 1);
    }
    /* face the player, so the sprite always reads front-on */
    SL.stick.draw(sctx, {
      colour: f.colour, hat: f.hat, face: f.face, build: f.build,
      pose: f.dying > 0 ? 'trip' : f.pose, phase: f.phase,
      facing: 1, t
    });
    sctx.restore();
    if (f.hurt > 0) {
      sctx.save();
      sctx.globalCompositeOperation = 'source-atop';
      sctx.fillStyle = 'rgba(255,70,70,' + clamp(f.hurt * 4, 0, 0.8) + ')';
      sctx.fillRect(0, 0, SW, SH);
      sctx.restore();
    }

    ctx.save();
    /* distance haze, so a far figure sits back in the room */
    ctx.globalAlpha = clamp(1.15 - depth / 22, 0.25, 1);
    blitClipped(ctx, scratch, scr - w / 2, w, top, h, depth, W);
    ctx.restore();
  }

  function drawPickup(ctx, p, scr, depth, projD, horizon, W, t) {
    const feet = horizon + projD * EYE / depth;
    const s = projD * 0.34 / depth;
    const y = feet - s * 0.9 + Math.sin(t * 3 + p.t) * s * 0.12;
    if (s < 1.5) return;
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const x = c.getContext('2d');
    if (p.what === 'med') {
      x.fillStyle = '#e9eefb'; x.beginPath(); x.roundRect(2, 6, 28, 20, 4); x.fill();
      x.fillStyle = '#ff5d6c';
      x.fillRect(14, 10, 4, 12); x.fillRect(10, 14, 12, 4);
    } else {
      x.fillStyle = '#2a3244'; x.beginPath(); x.roundRect(2, 8, 28, 16, 3); x.fill();
      x.fillStyle = p.what === 'shotgun' ? '#ffb037' : '#57b6ff';
      x.fillRect(5, 13, 22, 5);
      x.fillStyle = '#c3cfe4'; x.fillRect(20, 11, 8, 3);
    }
    ctx.save();
    ctx.globalAlpha = clamp(1.15 - depth / 20, 0.3, 1);
    blitClipped(ctx, c, scr - s / 2, s, y, s, depth, W);
    ctx.restore();
  }

  function drawShot(ctx, b, scr, depth, projD, horizon, W) {
    const y = horizon + projD * (EYE - 0.55) / depth;
    const s = Math.max(1.5, projD * 0.12 / depth);
    if (depth > 30) return;
    ctx.save();
    const col = Math.floor(clamp(scr, 0, W - 1));
    if (zbuf[col] < depth) { ctx.restore(); return; }
    ctx.fillStyle = '#ffd166';
    ctx.shadowColor = '#ff8a3d'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(scr, y, s, 0, 6.284); ctx.fill();
    ctx.restore();
  }

  /* ---------------- the overlay ---------------- */
  function drawHud(ctx, S, ops, view, t, horizon) {
    const W = view.w, H = view.h;

    /* muzzle flash lights the room for a frame */
    if (ops.flash > 0) {
      ctx.fillStyle = 'rgba(255,214,140,' + Math.min(0.16, ops.flash * 1.6) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    /* the gun, such as it is: a shape in the corner that kicks when it fires */
    drawGun(ctx, ops, W, H, t);

    /* taking a hit */
    if (ops.hurt > 0) {
      const a = clamp(ops.hurt * 1.6, 0, 0.62);
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.62);
      v.addColorStop(0, 'rgba(180,10,20,0)');
      v.addColorStop(1, 'rgba(180,10,20,' + a + ')');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }

    /* crosshair */
    if (!ops.over) {
      const g = gunById[ops.gun];
      const sp = 5 + g.spread * 90 + ops.kick * 4;
      ctx.strokeStyle = 'rgba(233,238,251,.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(W / 2 + ax * sp, horizon + ay * sp);
        ctx.lineTo(W / 2 + ax * (sp + 5), horizon + ay * (sp + 5));
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(233,238,251,.5)';
      ctx.fillRect(W / 2 - 0.75, horizon - 0.75, 1.5, 1.5);
    }

    drawMinimap(ctx, ops, W);

    /* wave banner */
    if (ops.banner > 0 && !ops.over) {
      const a = clamp(ops.banner, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffd166';
      ctx.font = '900 20px ui-rounded, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 8;
      ctx.fillText(ops.bannerTxt, W / 2, H * 0.3);
      ctx.restore();
    }

    if (ops.over) {
      ctx.fillStyle = 'rgba(8,6,10,.55)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* The viewmodel. Everyone else in this game is a stick figure, so the hands
     holding the gun are a stick arm — a photoreal weapon floating in the corner
     would look like it wandered in from another game. Muzzle points up and just
     left of centre, so the flash sits under the crosshair. */
  const GUN_ART = {
    pistol: { muzzle: -60, paint(ctx, steel) {
      steel(-9, -38, 18, 30, 3);                       // slide and frame
      steel(-5, -60, 10, 26, 2);                       // barrel
      ctx.fillStyle = '#1a202b';
      ctx.beginPath(); ctx.roundRect(-6, -12, 13, 22, 4); ctx.fill();   // grip
    } },
    smg: { muzzle: -74, paint(ctx, steel) {
      steel(-10, -46, 20, 36, 3);
      steel(-4, -74, 8, 30, 2);
      ctx.fillStyle = '#1a202b';
      ctx.beginPath(); ctx.roundRect(-7, -14, 12, 28, 3); ctx.fill();   // magazine
      ctx.beginPath(); ctx.roundRect(-9, -52, 18, 7, 2); ctx.fill();    // top rail
    } },
    shotgun: { muzzle: -96, paint(ctx, steel) {
      steel(-10, -52, 20, 40, 3);
      steel(-6, -96, 12, 48, 2);
      ctx.fillStyle = '#6b4a2c';                                        // pump
      ctx.beginPath(); ctx.roundRect(-11, -74, 22, 18, 4); ctx.fill();
      ctx.fillStyle = '#5b3f26';
      ctx.beginPath(); ctx.roundRect(-7, -14, 14, 24, 4); ctx.fill();   // stock
    } }
  };

  function drawGun(ctx, ops, W, H, t) {
    const art = GUN_ART[ops.gun] || GUN_ART.pistol;
    const sway = Math.sin(ops.bob * 0.5) * (ops.moving ? 5 : 1.8);
    const lift = Math.cos(ops.bob) * (ops.moving ? 3.4 : 1.1) - ops.kick * 13;
    const skin = SL.stick.skinColour(SL.save.equipped('skin'), t) || '#e9eefb';

    ctx.save();
    ctx.translate(W * 0.62 + sway, H - 26 + lift);     // where the hand sits
    ctx.rotate(-0.09);
    ctx.scale(1.25, 1.25);

    /* the arm, reaching in from the bottom-right corner */
    ctx.strokeStyle = skin;
    ctx.lineWidth = 7.5;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(74, 120);
    ctx.quadraticCurveTo(52, 60, 9, 12);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(10,14,22,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(74, 120);
    ctx.quadraticCurveTo(52, 60, 9, 12);
    ctx.stroke();

    const steel = (x0, y0, w, h, r) => {
      const gr = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      gr.addColorStop(0, '#525d72'); gr.addColorStop(0.45, '#2b3341'); gr.addColorStop(1, '#151b24');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.roundRect(x0, y0, w, h, r || 2); ctx.fill();
      ctx.strokeStyle = 'rgba(190,206,235,.3)'; ctx.lineWidth = 1; ctx.stroke();
    };
    art.paint(ctx, steel);

    /* the hand wrapped round the grip, drawn over the gun */
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(1, 2, 8, 0, 6.284); ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,22,.4)'; ctx.lineWidth = 1; ctx.stroke();

    if (ops.flash > 0) {
      const my = art.muzzle;
      ctx.save();
      ctx.globalAlpha = clamp(ops.flash * 15, 0, 1);
      ctx.fillStyle = '#ffe6a0';
      ctx.beginPath();
      const r = 15 + Math.random() * 9;
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * 6.284, rr = i % 2 ? r : r * 0.4;
        ctx.lineTo(Math.cos(a) * rr * 0.85, my + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff8e6';
      ctx.beginPath(); ctx.arc(0, my, r * 0.36, 0, 6.284); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  const MAP_PX = 54;
  function drawMinimap(ctx, ops, W) {
    const cell = MAP_PX / MW;
    const ox = W - MAP_PX - 6, oy = 6;
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(8,11,18,.72)';
    ctx.beginPath(); ctx.roundRect(ox - 2, oy - 2, MAP_PX + 4, MAP_PX + 4, 4); ctx.fill();
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (!ops.map[y * MW + x]) continue;
      ctx.fillStyle = 'rgba(150,170,205,.5)';
      ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    }
    for (const f of ops.foes) {
      if (f.dying > 0) continue;
      ctx.fillStyle = f.kind === 'gunner' ? '#ffb037' : '#ff5d6c';
      ctx.fillRect(ox + f.x * cell - 1, oy + f.y * cell - 1, 2, 2);
    }
    for (const p of ops.pickups) {
      ctx.fillStyle = p.what === 'med' ? '#3ddc97' : '#57b6ff';
      ctx.fillRect(ox + p.x * cell - 1, oy + p.y * cell - 1, 2, 2);
    }
    /* you, and which way you are looking */
    ctx.strokeStyle = '#e9eefb'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox + ops.x * cell, oy + ops.y * cell);
    ctx.lineTo(ox + (ops.x + Math.cos(ops.ang) * 1.8) * cell, oy + (ops.y + Math.sin(ops.ang) * 1.8) * cell);
    ctx.stroke();
    ctx.fillStyle = '#3ddc97';
    ctx.beginPath(); ctx.arc(ox + ops.x * cell, oy + ops.y * cell, 1.7, 0, 6.284); ctx.fill();
    ctx.restore();
  }

  /* ---------------- what the outside world calls ---------------- */
  const api = {
    start, step, draw, GUNS, MW, MH, WALL_H,
    key(name, down) { const o = SL.game.S.ops; if (o) o.keys[name] = !!down; },
    stick(x, y) { const o = SL.game.S.ops; if (o) { o.stick.x = clamp(x, -1, 1); o.stick.y = clamp(y, -1, 1); } },
    look(dx) { const o = SL.game.S.ops; if (o) o.look += dx; },
    setFire(down) { const o = SL.game.S.ops; if (o && !o.over) o.fire = !!down; },
    cycleGun(dir) {
      const o = SL.game.S.ops;
      if (!o) return;
      const have = GUNS.filter((g) => o.ammo[g.id] !== 0);
      if (have.length < 2) return;
      const i = have.findIndex((g) => g.id === o.gun);
      o.gun = have[(i + (dir || 1) + have.length) % have.length].id;
      SL.audio.play('ui');
    },
    pickGun(i) {
      const o = SL.game.S.ops;
      if (!o || !GUNS[i]) return;
      if (o.ammo[GUNS[i].id] === 0) { SL.audio.play('nope'); return; }
      o.gun = GUNS[i].id;
      SL.audio.play('ui');
    },
    get over() { const o = SL.game.S.ops; return !!(o && o.over); },
    result() { const o = SL.game.S.ops; return o ? o.result : null; },
    ammoLabel() {
      const o = SL.game.S.ops;
      if (!o) return '';
      const n = o.ammo[o.gun];
      return gunById[o.gun].name + (n < 0 ? ' · ∞' : ' · ' + n);
    }
  };
  SL.fps = api;
})(window.SL);
