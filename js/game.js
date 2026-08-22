/* Scupper Jump — simulation + main loop */
(function (SL) {
  'use strict';
  const { clamp, damp } = SL.util;
  const LV = SL.level;
  const R = SL.render;

  const W = LV.W;
  const BASE = LV.BASE;                       // { g, jump, vx } — the generator plans against these
  const PW = 18, PH = 30;
  const STEP = 1 / 120;
  const MIN_CAM = -44;

  const ACC_GROUND = 2600, ACC_AIR = 1500;
  const FRIC_GROUND = 3400, FRIC_ICE = 320, FRIC_AIR = 420;
  const COYOTE = 0.10, BUFFER = 0.13;
  const MAX_FALL = 1250;
  const MIN_JUMP_V = 505;          // a tap still clears the smallest gap in the tower
  const TRIP_SPEED = 980;          // landing faster than this and his legs go out from under him
  const TRIP_TIME = 0.8;
  const CRUMBLE_TIME = 0.42;
  const CRUMBLE_REGEN = 3.0;       // a collapsed block rebuilds, so a missed jump can never strand you
  const BOUNCE_MUL = 1.62;

  const input = { left: false, right: false, jump: false, jumpEdge: false, jumpHeld: false };
  const held = { key: {}, touch: {} };

  const S = {
    mode: 'boot',            // boot | menu | play | pause | complete | dead
    level: null, backdrop: null,
    time: 0, camY: MIN_CAM, baseCam: MIN_CAM, anchor: 0, followGap: 260,
    player: null, mods: null,
    run: null,               // per-attempt bookkeeping
    shield: false, checkpoint: null, limp: false,
    awaitRetry: false, deathCause: null,
    hudDirty: true
  };

  const listeners = { hud: [], complete: [], toast: [], retry: [], limp: [], endless: [] };
  const on = (k, fn) => listeners[k].push(fn);
  const fire = (k, p) => listeners[k].forEach(fn => fn(p));

  /* ---------------- player ---------------- */
  function newPlayer(x, y) {
    return {
      x, y, w: PW, h: PH, vx: 0, vy: 0,
      onGround: false, coyote: 0, buffer: 0, jumpsLeft: 0, cutJump: false,
      facing: 1, pose: 'idle', animPhase: 0, squash: 1, tripT: 0, rot: 0,
      trail: [], trailT: 0,
      dead: false, deadT: 0, invuln: 0, ride: null, wallDir: 0
    };
  }

  /* ---------------- level lifecycle ---------------- */
  function loadLevel(n, mode, endless) {
    S.level = endless ? LV.generateEndless((Math.random() * 2147483647) | 0) : LV.generate(n);
    S.backdrop = R.makeBackdrop(S.level);
    S.mods = SL.items.modifiers();
    S.run = {
      n, coins: 0, gems: 0, value: 0, deaths: 0, elapsed: 0, collected: 0,
      replay: !endless && SL.save.cleared(n), started: false, halfway: false,
      endless: !!endless, height: 0
    };
    S.checkpoint = null;
    SL.gore.reset(S);
    resetAttempt(true);
    S.mode = mode || 'play';
    S.hudDirty = true;
    pushHud();
  }

  /* How far above the killing floor the stickman rides. It shrinks with the
     level number, which is what makes a late tower feel unforgiving. */
  function followGapFor(n) {
    return R.view.h * clamp(0.48 - (n - 1) * 0.007, 0.34, 0.48);
  }

  function resetAttempt(full) {
    const lv = S.level;
    for (const p of lv.plats) { p.broken = false; p.timer = 0; p.shake = 0; p.compress = 0; p.regen = 0; p.pop = 0; }
    S.followGap = followGapFor(lv.n);
    const spawn = S.checkpoint || { x: W / 2, y: 4 };
    S.player = newPlayer(spawn.x - PW / 2, spawn.y);
    S.anchor = Math.max(0, spawn.y);
    S.baseCam = Math.max(MIN_CAM, S.anchor - S.followGap);
    S.camY = S.baseCam;
    S.rising = MIN_CAM - 260;          // endless: the floor that comes after you
    S.shield = S.mods.shield;
    S.limp = false;
    S.awaitRetry = false;
    fire('retry', null);
    SL.gore.softReset(S);
    R.clearParts();
    if (full) { for (const c of lv.coins) c.got = false; }
  }

  /* ---------------- input ---------------- */
  function syncInput() {
    const l = held.key.left || held.touch.left;
    const r = held.key.right || held.touch.right;
    const j = held.key.jump || held.touch.jump;
    input.left = !!l; input.right = !!r;
    if (j && !input.jumpHeld) input.jumpEdge = true;
    input.jumpHeld = !!j;
  }

  function setKey(name, down) {
    held.key[name] = down;
    if (down) SL.audio.unlock();
    syncInput();
  }
  function setTouch(name, down) {
    held.touch[name] = down;
    if (down) SL.audio.unlock();
    syncInput();
  }

  function pollGamepad() {
    if (!navigator.getGamepads) return;
    const gp = navigator.getGamepads()[0];
    if (!gp) return;
    const ax = gp.axes[0] || 0;
    held.key.left = held.key.left || ax < -0.35 || (gp.buttons[14] && gp.buttons[14].pressed);
    held.key.right = held.key.right || ax > 0.35 || (gp.buttons[15] && gp.buttons[15].pressed);
    const a = (gp.buttons[0] && gp.buttons[0].pressed) || (gp.buttons[12] && gp.buttons[12].pressed);
    if (a) held.key.jump = true;
    syncInput();
  }

  /* ---------------- simulation ---------------- */
  function step(dt) {
    const lv = S.level, pl = S.player, m = S.mods;
    S.time += dt;
    S.followGap = followGapFor(lv.n);

    /* animate platform states regardless of player */
    for (const p of lv.plats) {
      if (p.compress) p.compress = Math.max(0, p.compress - dt * 4);
      if (p.pop > 0) p.pop = Math.max(0, p.pop - dt * 2.6);
      if (p.timer > 0 && !p.broken) {
        p.timer -= dt;
        p.shake = 1 - p.timer / CRUMBLE_TIME;
        if (p.timer <= 0) {
          p.broken = true;
          p.regen = CRUMBLE_REGEN;
          SL.audio.play('crumble');
          R.burst(p.hx, p.y - 4, 14, { c: '#8f6338', speed: 110, g: 700, r: 3, square: true, life: 0.8, jitter: p.w * 0.7 });
        }
      } else if (p.broken) {
        p.regen -= dt;
        if (p.regen <= 0) { p.broken = false; p.timer = 0; p.shake = 0; p.pop = 1; }
      }
    }

    /* Gone limp on purpose: the ragdoll is the player until he gets up. */
    if (S.limp) {
      if (S.mode === 'play' && S.run.started) S.run.elapsed += dt;
      SL.gore.step(S, dt);
      const want = clamp(SL.gore.focus(S) - R.view.h * 0.42, MIN_CAM, 1e9);
      S.camY = damp(S.camY, want, 4.5, dt);
      let lowest = Infinity;
      const rd = S.gore.rd;
      if (rd) for (const q of rd.pts) if (q.y < lowest) lowest = q.y;
      if (lowest < S.baseCam - 34) {          // flopped into the killing floor
        S.limp = false;
        syncFromRagdoll();
        SL.gore.kill(S);
        die('fell', null, true);
      }
      return;
    }

    if (pl.dead) {
      pl.deadT += dt;
      SL.gore.step(S, dt);
      if (pl.deadT > 0.45 && !S.awaitRetry) {
        S.awaitRetry = true;
        fire('retry', { cause: S.deathCause, where: S.cutWhere });
      }
      /* follow the carnage wherever it ends up */
      const want = clamp(SL.gore.focus(S) - R.view.h * 0.42, MIN_CAM, 1e9);
      S.camY = damp(S.camY, want, 3.2, dt);
      return;
    }

    if (S.mode === 'play' && !S.run.started && (input.left || input.right || input.jumpEdge)) S.run.started = true;
    if (S.mode === 'play' && S.run.started) S.run.elapsed += dt;
    if (pl.invuln > 0) pl.invuln -= dt;

    if (pl.tripT > 0) pl.tripT = Math.max(0, pl.tripT - dt);
    const active = S.mode === 'play' && pl.tripT <= 0;
    const dirX = active ? ((input.right ? 1 : 0) - (input.left ? 1 : 0)) : 0;

    /* -------- horizontal -------- */
    const onIce = pl.ride && pl.ride.type === 'ice' && pl.onGround;
    const acc = (pl.onGround ? ACC_GROUND : ACC_AIR * m.airControl) * (onIce ? 0.45 : 1);
    const fric = pl.onGround ? (onIce ? FRIC_ICE : FRIC_GROUND) : FRIC_AIR;
    const maxVX = BASE.vx;

    if (dirX !== 0) {
      pl.vx += dirX * acc * dt;
      pl.vx = clamp(pl.vx, -maxVX, maxVX);
      pl.facing = dirX;
    } else {
      const s = Math.sign(pl.vx);
      pl.vx -= s * (pl.tripT > 0 ? fric * 1.6 : fric) * dt;
      if (Math.sign(pl.vx) !== s) pl.vx = 0;
    }

    /* -------- jump -------- */
    if (active && input.jumpEdge) { pl.buffer = BUFFER; input.jumpEdge = false; }
    pl.buffer = Math.max(0, pl.buffer - dt);
    pl.coyote = Math.max(0, pl.coyote - dt);

    const canGround = pl.onGround || pl.coyote > 0;
    if (pl.buffer > 0 && (canGround || pl.jumpsLeft > 0)) {
      const first = canGround;
      pl.vy = BASE.jump * m.jumpMul * (first ? 1 : 0.92);
      pl.onGround = false; pl.coyote = 0; pl.buffer = 0; pl.cutJump = false;
      pl.squash = 1.2; pl.ride = null;
      if (!first) {
        pl.jumpsLeft--;
        SL.audio.play('djump');
        R.burst(pl.x + PW / 2, pl.y, 10, { c: '#9ad9ff', dir: -Math.PI / 2, spread: 1.6, speed: 130, g: 250, r: 2.5, life: 0.4 });
      } else {
        SL.audio.play('jump');
        R.burst(pl.x + PW / 2, pl.y, 5, { c: 'rgba(255,255,255,.6)', dir: -Math.PI / 2, spread: 2, speed: 70, g: 150, r: 2, life: 0.3 });
      }
      SL.save.bump('jumps');
    }
    /* variable height: let go early and you rise less, but never so little
       that the smallest generated gap becomes unclearable */
    if (!input.jumpHeld && pl.vy > MIN_JUMP_V && !pl.cutJump) {
      pl.vy = Math.max(MIN_JUMP_V, pl.vy * 0.55);
      pl.cutJump = true;
    }

    /* -------- gravity -------- */
    const gMul = pl.vy < 0 ? m.fallMul : 1;
    pl.vy -= BASE.g * gMul * dt;
    const term = -MAX_FALL * m.termMul;
    if (pl.vy < term) pl.vy = term;

    /* -------- move x + walls -------- */
    const prevX = pl.x;
    pl.x += pl.vx * dt;
    pl.wallDir = 0;
    if (pl.x < 0) { pl.x = 0; pl.wallDir = -1; if (pl.vx < 0) pl.vx = 0; }
    if (pl.x + PW > W) { pl.x = W - PW; pl.wallDir = 1; if (pl.vx > 0) pl.vx = 0; }
    if (m.wallSlide && pl.wallDir && !pl.onGround && pl.vy < -120 &&
        ((pl.wallDir < 0 && input.left) || (pl.wallDir > 0 && input.right))) {
      pl.vy = -170;
      pl.jumpsLeft = Math.max(pl.jumpsLeft, m.airJumps);
      if (Math.random() < 0.35) R.burst(pl.wallDir < 0 ? 2 : W - 2, pl.y + 12, 1, { c: 'rgba(255,255,255,.5)', speed: 40, g: 200, r: 1.6, life: 0.3 });
    }

    /* -------- move y + one-way platforms -------- */
    const prevY = pl.y;
    pl.y += pl.vy * dt;
    const wasGround = pl.onGround;
    pl.onGround = false;
    pl.ride = null;

    if (pl.vy <= 0) {
      let best = null, bestY = -Infinity;
      for (const p of lv.plats) {
        if (p.broken) continue;
        const px = LV.platX(p, S.time);
        if (pl.x + PW <= px + 1 || pl.x >= px + p.w - 1) continue;
        if (prevY < p.y - 1.5) continue;              // came from below
        if (pl.y > p.y) continue;                      // not down to it yet
        if (p.y > bestY) { bestY = p.y; best = p; }
      }
      if (best) {
        pl.y = best.y;
        pl.onGround = true;
        pl.ride = best;
        if (best.y > S.anchor) S.anchor = best.y;
        pl.coyote = COYOTE;
        pl.jumpsLeft = S.mods.airJumps;
        pl.cutJump = false;
        const impact = -pl.vy;
        pl.vy = 0;

        if (best.type === 'bouncy') {
          best.compress = 1;
          pl.vy = BASE.jump * S.mods.jumpMul * BOUNCE_MUL;
          pl.onGround = false; pl.ride = null; pl.squash = 1.35;
          /* a bouncer is not a jump — the release-early cut must not steal it */
          pl.cutJump = true;
          SL.audio.play('spring');
          R.burst(pl.hx || (best.x + best.w / 2), best.y, 14, { c: '#3ddc97', dir: -Math.PI / 2, spread: 1.4, speed: 190, g: 380, r: 3, life: 0.5 });
        } else if (best.type === 'goal') {
          return win();
        } else {
          if (!wasGround && impact > 120) {
            pl.squash = clamp(1 - impact / 3400, 0.62, 0.95);
            SL.audio.play('land');
            /* come down hard enough and his legs go out from under him */
            const tripAt = TRIP_SPEED * (1 + SL.save.tier('grip') * 0.18);
            if (impact > tripAt && best.type !== 'ice') {
              pl.tripT = TRIP_TIME;
              pl.buffer = 0;
              SL.audio.play('squelch');
              SL.util.vibrate(SL.save.data.settings.haptic ? [12, 30, 12] : 0);
              R.burst(pl.x + PW / 2, pl.y, 9, { c: 'rgba(255,255,255,.5)', dir: -Math.PI / 2, spread: 2.8, speed: 110, g: 420, r: 2.6, life: 0.4 });
              fire('toast', 'Tripped!');
            }
            if (impact > 380) {
              R.burst(pl.x + PW / 2, pl.y, 7, { c: 'rgba(255,255,255,.55)', dir: -Math.PI / 2, spread: 2.6, speed: 90, g: 400, r: 2.4, life: 0.35 });
              SL.util.vibrate(SL.save.data.settings.haptic ? 8 : 0);
            }
          }
          if (best.type === 'crumble' && best.timer <= 0) best.timer = CRUMBLE_TIME;
        }
      }
    }

    /* riding a slider */
    if (pl.ride && pl.ride.type === 'moving') {
      const dxr = LV.platX(pl.ride, S.time) - LV.platX(pl.ride, S.time - dt);
      pl.x = clamp(pl.x + dxr, 0, W - PW);
    }

    /* -------- hazards -------- */
    if (pl.invuln <= 0) {
      /* spikes */
      for (const p of lv.plats) {
        if (!p.spike || p.broken) continue;
        const px = LV.platX(p, S.time);
        const zw = p.w * p.spike.frac;
        const zx = p.spike.side > 0 ? px + p.w - zw : px;
        if (pl.x + PW > zx && pl.x < zx + zw && pl.y < p.y + 8 && pl.y + PH > p.y - 2) { hurt('spike', p.y + 8); break; }
      }
      /* saws */
      if (!pl.dead) {
        for (const s of lv.saws) {
          const sx = LV.sawX(s, S.time);
          const cx = clamp(sx, pl.x, pl.x + PW);
          const cy = clamp(s.y, pl.y, pl.y + PH);
          const dx2 = sx - cx, dy2 = s.y - cy;
          if (dx2 * dx2 + dy2 * dy2 < s.r * s.r) { hurt('saw', s.y); break; }
        }
      }
    }
    if (pl.dead) return;

    /* -------- coins -------- */
    const cxp = pl.x + PW / 2, cyp = pl.y + PH * 0.55;
    for (const c of lv.coins) {
      if (c.got) continue;
      let dx2 = c.x - cxp, dy2 = c.y - cyp;
      const d2 = dx2 * dx2 + dy2 * dy2;
      if (m.magnet && d2 < m.magnet * m.magnet) {
        const d = Math.sqrt(d2) || 1;
        const pull = 260 * dt * (1 - d / m.magnet + 0.35);
        c.x -= (dx2 / d) * pull; c.y -= (dy2 / d) * pull;
        dx2 = c.x - cxp; dy2 = c.y - cyp;
      }
      if (dx2 * dx2 + dy2 * dy2 < (c.r + 15) * (c.r + 15)) {
        c.got = true;
        S.run.collected++;
        const v = c.gem ? 25 : 5;
        S.run.value += v;
        if (c.gem) { S.run.gems++; SL.audio.play('gem'); fire('toast', '+' + v + ' gem!'); }
        else { S.run.coins++; SL.audio.play('coin'); }
        SL.save.bump('coins');
        R.burst(c.x, c.y, c.gem ? 16 : 8, { c: c.gem ? '#a4f9ff' : '#ffd166', speed: c.gem ? 150 : 100, g: 120, r: 2.6, life: 0.5 });
        S.hudDirty = true;
      }
    }

    /* -------- checkpoint -------- */
    if (m.beacon && !S.run.halfway && pl.y > lv.goalY * 0.5 && pl.onGround) {
      S.run.halfway = true;
      S.checkpoint = { x: pl.x + PW / 2, y: pl.y };
      SL.audio.play('check');
      fire('toast', 'Checkpoint');
    }

    /* -------- endless: keep building, and keep the floor coming -------- */
    if (S.run.endless) {
      if (pl.y > S.run.height) S.run.height = pl.y;
      if (lv.top - pl.y < 2200) {
        LV.extendEndless(lv, pl.y + 3200);
        S.hudDirty = true;
      }
      if (S.run.started) {
        const grace = Math.max(0, S.run.elapsed - 2.5);
        const speed = Math.min(85, 22 + S.run.height / 130) * Math.min(1, grace / 2);
        S.rising += speed * dt;
      }
      if (S.time - (S.lastPrune || 0) > 4) {
        S.lastPrune = S.time;
        LV.pruneEndless(lv, S.baseCam - 500);
      }
    }

    /* -------- camera + the floor that kills --------
       The lethal floor climbs with the highest block you have actually LANDED on,
       not with your airborne peak — otherwise a bouncer would fling you up, drag
       the floor with you, and kill you on the way back down through your own
       launch pad. The view may rise above that floor to keep you in shot, and
       slides back down as you fall. */
    let base = S.anchor - S.followGap;
    if (S.run.endless) base = Math.max(base, S.rising);
    if (base > S.baseCam) S.baseCam = damp(S.baseCam, base, 6.5, dt);
    if (S.baseCam < MIN_CAM) S.baseCam = MIN_CAM;
    const want = Math.max(S.baseCam, pl.y - R.view.h * 0.72);
    S.camY = damp(S.camY, want, 9, dt);
    if (S.camY < MIN_CAM) S.camY = MIN_CAM;
    if (pl.y < S.baseCam - 34) return die('fell');

    /* -------- animation -------- */
    pl.squash = damp(pl.squash, 1, 13, dt);
    if (pl.tripT > 0) {
      pl.pose = 'trip';
      const p = 1 - pl.tripT / TRIP_TIME;                 // 0 just fallen -> 1 back up
      const amt = p < 0.22 ? p / 0.22 : (p < 0.68 ? 1 : 1 - (p - 0.68) / 0.32);
      pl.rot = -pl.facing * 1.25 * clamp(amt, 0, 1);
      pl.animPhase += dt * 3;
    } else if (!pl.onGround) { pl.rot = 0; pl.pose = pl.vy > 40 ? 'jump' : 'fall'; }
    else if (Math.abs(pl.vx) > 22) { pl.rot = 0; pl.pose = 'run'; pl.animPhase += Math.abs(pl.vx) * dt * 0.075; }
    else { pl.rot = 0; pl.pose = 'idle'; pl.animPhase += dt * 2.2; }

    pl.trailT += dt;
    if (pl.trailT > 0.035) {
      pl.trailT = 0;
      pl.trail.push({ x: pl.x + PW / 2, y: pl.y, pose: pl.pose, phase: pl.animPhase, f: pl.facing });
      if (pl.trail.length > 6) pl.trail.shift();
    }

    /* skin flourishes */
    const skin = SL.items.byId[SL.save.equipped('skin')];
    if (skin && !SL.save.data.settings.lowfx) {
      if (skin.fx === 'fire' && Math.random() < 0.5) R.burst(pl.x + PW / 2, pl.y + 2, 1, { c: Math.random() < 0.5 ? '#ff8a3d' : '#ffd166', speed: 30, g: -60, r: 2.4, life: 0.5 });
      if (skin.fx === 'sparkle' && Math.random() < 0.22) R.burst(pl.x + PW / 2, pl.y + 15, 1, { c: '#ffe9a8', speed: 25, g: 90, r: 1.8, life: 0.6, jitter: 14 });
      if (skin.fx === 'matrix' && Math.random() < 0.3) R.burst(pl.x + PW / 2, pl.y + 14, 1, { c: '#5cffc1', speed: 15, g: 140, r: 1.8, life: 0.5, jitter: 12, square: true });
    }
  }

  /* ---------------- outcomes ---------------- */
  /* cutY is the world height the blade went through — the ragdoll comes apart there */
  function hurt(cause, cutY) {
    const pl = S.player;
    if (S.shield) {
      S.shield = false;
      pl.invuln = 1.2;
      pl.vy = BASE.jump * 0.55;
      SL.audio.play('shield');
      fire('toast', 'Shield used');
      R.burst(pl.x + PW / 2, pl.y + 14, 20, { c: '#5cffc1', speed: 190, g: 60, r: 3, life: 0.6 });
      SL.util.vibrate(SL.save.data.settings.haptic ? 25 : 0);
      return;
    }
    die(cause || 'spike', cutY);
  }

  function die(cause, cutY, keepRagdoll) {
    const pl = S.player;
    if (pl.dead) return;
    pl.dead = true; pl.deadT = 0;
    S.deathCause = cause;
    /* Clamp into the range where joints actually live (feet 0.5 .. head 25.8),
       otherwise a blade above the head point would sever nothing at all. */
    S.cutY = cutY == null ? null : clamp(cutY, pl.y + 1.2, pl.y + 25.2);
    S.cutWhere = S.cutY == null ? null : (S.cutY - pl.y) / PH;   // 0 = feet, 1 = head
    S.awaitRetry = false;
    S.run.deaths++;
    SL.save.bump('deaths');
    SL.util.vibrate(SL.save.data.settings.haptic ? [30, 50, 30, 50, 70] : 0);
    if (!keepRagdoll) SL.gore.spawn(S, cause, S.cutY);
    S.hudDirty = true;
  }

  /* put the player back where the ragdoll ended up */
  function syncFromRagdoll() {
    const rd = S.gore && S.gore.rd;
    if (!rd) return;
    let lowest = Infinity;
    for (const q of rd.pts) lowest = Math.min(lowest, q.y - q.r);
    S.player.x = clamp(rd.pts[2].x - PW / 2, 0, W - PW);
    S.player.y = Math.max(lowest, 0);
    S.player.vx = 0; S.player.vy = 0;
    S.player.onGround = false;
    S.player.tripT = 0; S.player.rot = 0;
  }

  function toggleLimp() {
    if (S.mode !== 'play' || S.player.dead) return false;
    if (S.limp) {
      S.limp = false;
      syncFromRagdoll();
      SL.gore.softReset(S);
      S.player.tripT = TRIP_TIME * 0.45;      // a moment to find his feet
      SL.audio.play('land');
    } else {
      S.limp = true;
      SL.gore.spawnLimp(S);
      SL.audio.play('squelch');
    }
    fire('limp', S.limp);
    return true;
  }

  function endRun() {
    const lv = S.level, run = S.run, m = S.mods;
    S.mode = 'complete';
    const height = Math.floor(run.height / 10);
    const best = SL.save.endlessBest();
    const isBest = height > best;
    if (isBest) SL.save.setEndlessBest(height);
    const climbCredits = Math.round(run.height / 12);
    const total = Math.max(1, Math.round((climbCredits + run.value) * m.payoutMul));
    SL.save.addCredits(total);
    SL.save.bump('runs');
    fire('endless', {
      height, best: Math.max(best, height), isBest,
      coins: run.collected, coinValue: run.value,
      climbCredits, mult: m.payoutMul, total,
      elapsed: run.elapsed, deaths: run.deaths
    });
  }

  function respawn() {
    resetAttempt(false);
    S.hudDirty = true;
    pushHud();
  }

  function win() {
    const lv = S.level, run = S.run, m = S.mods;
    S.mode = 'complete';
    S.player.vy = 0; S.player.onGround = true; S.player.pose = 'idle';
    SL.audio.play('win');
    SL.util.vibrate(SL.save.data.settings.haptic ? [10, 50, 10, 50, 25] : 0);
    for (let i = 0; i < 3; i++) {
      R.burst(W / 2 + (i - 1) * 70, lv.goalY + 20, 26, { c: ['#ffd166', '#3ddc97', '#43a6ff'][i], speed: 260, g: 420, r: 3.4, life: 1.1 });
    }

    const collected = run.collected;
    const allCoins = collected === lv.coins.length && lv.coins.length > 0;
    const base = 60 + lv.n * 14;
    const timeBonus = clamp(Math.round((lv.parTime - run.elapsed) * 4), 0, 220);
    const noDeath = run.deaths === 0 ? 60 : 0;
    const perfect = allCoins ? 80 : 0;
    const sub = base + timeBonus + noDeath + perfect + run.value;
    const mult = m.payoutMul * (run.replay ? 0.3 : 1);
    const total = Math.max(1, Math.round(sub * mult));

    let stars = 1;
    if (run.deaths === 0) stars = 2;
    if (run.deaths === 0 && allCoins) stars = 3;

    SL.save.addCredits(total);
    const rec = SL.save.recordLevel(lv.n, { t: run.elapsed, d: run.deaths, c: collected, s: stars });

    fire('complete', {
      n: lv.n, stars, record: rec, replay: run.replay,
      rows: [
        { k: 'Level clear', v: base },
        { k: 'Coins ' + collected + '/' + lv.coins.length, v: run.value },
        { k: 'Time ' + SL.util.fmtTime(run.elapsed) + (timeBonus ? ' (under par)' : ''), v: timeBonus },
        { k: 'No deaths', v: noDeath },
        { k: 'Every coin', v: perfect }
      ].filter(r => r.v > 0),
      luckyMul: m.payoutMul, replayMul: run.replay ? 0.3 : 1,
      mult, total, elapsed: run.elapsed, deaths: run.deaths,
      collected, coinTotal: lv.coins.length
    });
  }

  /* ---------------- hud ---------------- */
  let hudClock = 0;
  function pushHud() {
    if (!S.level) return;
    const endless = !!(S.run && S.run.endless);
    fire('hud', {
      n: S.level.n,
      endless,
      themeName: S.level.theme.name,
      coins: S.run ? S.run.collected : 0,
      coinTotal: endless ? 0 : S.level.coins.length,
      deaths: S.run ? S.run.deaths : 0,
      height: endless ? Math.floor(S.run.height / 10) : 0,
      /* in endless the rail is a danger meter: how close the floor is */
      progress: endless
        ? clamp(1 - (S.player.y - S.baseCam) / Math.max(1, S.followGap), 0, 1)
        : clamp(S.player.y / Math.max(1, S.level.goalY), 0, 1)
    });
  }

  /* ---------------- loop ---------------- */
  let last = 0, acc = 0, raf = 0;
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.25) dt = 0.25;

    if (S.mode === 'play') pollGamepad();
    const running = S.mode === 'play' || S.mode === 'menu' || S.mode === 'complete';
    if (running) {
      acc += dt;
      let guard = 0;
      while (acc >= STEP && guard++ < 8) {
        acc -= STEP;
        if (S.mode === 'menu') { S.time += STEP; idleStep(STEP); }
        else if (S.mode === 'complete') { S.time += STEP; R.stepParts(STEP); }
        else step(STEP);
      }
      if (S.mode !== 'menu') R.stepParts(dt);
      if (S.mode === 'play') SL.save.data.stats.playtime += dt;
    }

    if (S.level) R.frame(S);
    hudClock += dt;
    if (S.hudDirty || (S.mode === 'play' && hudClock > 0.08)) { pushHud(); hudClock = 0; S.hudDirty = false; }
  }

  /* menu: the stickman idles on the ground behind the panels — just enough
     physics to put his feet on the floor, none of the ways to die */
  function idleStep(dt) {
    const pl = S.player;
    if (!pl.onGround) {
      pl.vy -= BASE.g * dt;
      pl.y += pl.vy * dt;
      if (pl.y <= 0) { pl.y = 0; pl.vy = 0; pl.onGround = true; }
    }
    S.camY = damp(S.camY, S.baseCam, 6, dt);
    pl.animPhase += dt * 2.2;
    pl.pose = pl.onGround ? 'idle' : 'fall';
    pl.squash = damp(pl.squash, 1, 10, dt);
    R.stepParts(dt);
  }

  /* ---------------- public ---------------- */
  const api = {
    S, on,
    start(n) {
      loadLevel(n, 'play');
      input.jumpEdge = false;
    },
    showcase(n) {                       // live backdrop for the menus
      loadLevel(n, 'menu');
      S.mode = 'menu';
    },
    /* Nothing tidies the body away on its own — the player has to say when. */
    retry() {
      if (!S.player || !S.player.dead || !S.awaitRetry) return false;
      S.awaitRetry = false;
      fire('retry', null);
      if (S.run && S.run.endless) { endRun(); return true; }   // one life per run
      respawn();
      return true;
    },
    startEndless() { loadLevel(0, 'play', true); input.jumpEdge = false; },
    get awaitingRetry() { return !!S.awaitRetry && !!S.player && S.player.dead; },
    restart() {
      const n = S.level ? S.level.n : 1;
      S.checkpoint = null;
      loadLevel(n, 'play');
    },
    nextLevel() { api.start((S.level ? S.level.n : 0) + 1); },
    pause() { if (S.mode === 'play') { S.mode = 'pause'; return true; } return false; },
    resume() { if (S.mode === 'pause') { S.mode = 'play'; input.jumpEdge = false; } },
    toMenu() { S.mode = 'menu'; },
    setKey, setTouch, toggleLimp,
    get limp() { return S.limp; },
    /* headless single step — used by the playtest bot and by tests, not by the
       loop. Ages particles too, or a headless run accumulates them forever. */
    tick(dt) { if (S.level) { step(dt); R.stepParts(dt); } },
    get mode() { return S.mode; },
    startLoop() { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } },
    refreshMods() { S.mods = SL.items.modifiers(); if (S.player) S.player.jumpsLeft = Math.max(S.player.jumpsLeft, 0); }
  };
  SL.game = api;
})(window.SL);
