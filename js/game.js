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
  const CRUMBLE_TIME = 0.42;
  const CRUMBLE_REGEN = 3.0;       // a collapsed block rebuilds, so a missed jump can never strand you
  const CHASE_LIMIT = 700;         // how far the camera will follow a body down before giving up
  const BOUNCE_MUL = 1.62;

  const input = { left: false, right: false, jump: false, jumpEdge: false, jumpHeld: false, attack: false, attackEdge: false };
  const held = { key: {}, touch: {} };

  const S = {
    mode: 'boot',            // boot | menu | play | pause | complete | dead
    level: null, backdrop: null,
    time: 0, camY: MIN_CAM, baseCam: MIN_CAM, anchor: 0, followGap: 260,
    player: null, mods: null,
    run: null,               // per-attempt bookkeeping
    shield: false, checkpoint: null, limp: false, lab: null, arena: null,
    awaitRetry: false, deathCause: null,
    hudDirty: true
  };

  const listeners = { hud: [], complete: [], toast: [], retry: [], limp: [], endless: [], arena: [] };
  const on = (k, fn) => listeners[k].push(fn);
  const fire = (k, p) => listeners[k].forEach(fn => fn(p));

  /* ---------------- player ---------------- */
  function newPlayer(x, y) {
    return {
      x, y, w: PW, h: PH, vx: 0, vy: 0,
      onGround: false, coyote: 0, buffer: 0, jumpsLeft: 0, cutJump: false,
      facing: 1, pose: 'idle', animPhase: 0, squash: 1, rot: 0, swing: 0, swingCd: 0, kick: false,
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
    S.lab = null;
    S.arena = null;
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
    /* a fresh level wipes everything; a respawn leaves the last body lying there */
    if (full) SL.gore.softReset(S); else SL.gore.retire(S);
    R.clearParts();
    if (full) { for (const c of lv.coins) c.got = false; }
  }

  /* ---------------- input ---------------- */
  function syncInput() {
    const l = held.key.left || held.touch.left;
    const r = held.key.right || held.touch.right;
    const j = held.key.jump || held.touch.jump;
    const a = held.key.attack || held.touch.attack;
    input.left = !!l; input.right = !!r;
    if (j && !input.jumpHeld) input.jumpEdge = true;
    input.jumpHeld = !!j;
    if (a && !input.attack) input.attackEdge = true;
    input.attack = !!a;
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

    /* previous corpses keep settling while you climb, so one retired mid-fall
       finishes its tumble instead of hanging in the air */
    SL.gore.stepOld(S, dt);

    if (S.run.arena) {
      if (input.attackEdge) { input.attackEdge = false; SL.arena.playerAttack(S); }
      SL.arena.step(S, dt);
    } else if (input.attackEdge) {
      input.attackEdge = false;
      swing();
    }
    if (pl.swingCd > 0) pl.swingCd -= dt;
    if (pl.swing > 0) { pl.swing -= dt; if (!S.run.arena) punchFolk(); }

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
      /* Follow the carnage down, but only so far. Off the top of a tall tower
         the body would otherwise drag the camera thousands of pixels and take
         fifteen seconds about it — so past CHASE_LIMIT the camera stops and the
         body drops out of shot. It is retired rather than deleted: it carries on
         falling under stepOld and is waiting for you at the bottom. */
      if (S.gore.rd) {
        const stopAt = (S.deathY || 0) - CHASE_LIMIT;
        const want = clamp(SL.gore.focus(S) - R.view.h * 0.42, Math.max(MIN_CAM, stopAt), 1e9);
        S.camY = damp(S.camY, want, 3.2, dt);
        if (SL.gore.topOf(S) < S.camY - 90) SL.gore.retire(S);
      }
      return;
    }

    if (S.mode === 'play' && !S.run.started && (input.left || input.right || input.jumpEdge)) S.run.started = true;
    if (S.mode === 'play' && S.run.started) S.run.elapsed += dt;
    if (pl.invuln > 0) pl.invuln -= dt;

    const active = S.mode === 'play';
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
      pl.vx -= s * fric * dt;
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
        } else if (best.type === 'goal' && !S.run.arena) {
          return win();
        } else {
          if (!wasGround && impact > 120) {
            pl.squash = clamp(1 - impact / 3400, 0.62, 0.95);
            SL.audio.play('land');
            /* a hard landing just thumps — no stumble, no getting up */
            if (impact > 900) {
              SL.util.vibrate(SL.save.data.settings.haptic ? 10 : 0);
              R.burst(pl.x + PW / 2, pl.y, 9, { c: 'rgba(255,255,255,.5)', dir: -Math.PI / 2, spread: 2.8, speed: 110, g: 420, r: 2.6, life: 0.4 });
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
    if (S.run.arena) {                       // the pit is one screen; hold the camera
      S.baseCam = MIN_CAM; S.camY = MIN_CAM;
      pl.squash = damp(pl.squash, 1, 13, dt);
      arenaPose(pl, dt);
      return;
    }
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
    if (pl.swing > 0) { pl.rot = 0; pl.pose = pl.kick ? 'kick' : 'punch'; }
    else if (!pl.onGround) { pl.rot = 0; pl.pose = pl.vy > 40 ? 'jump' : 'fall'; }
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

  /* ---------------- bystanders ----------------
     Idlers loitering on blocks. Harmless; worth a punch. */
  function swing() {
    const pl = S.player;
    if (pl.dead || S.limp || pl.swing > 0 || pl.swingCd > 0) return false;
    pl.swing = 0.12;
    pl.swingCd = 0.3;
    pl.kick = !pl.onGround;
    SL.audio.play(pl.kick ? 'djump' : 'jump');
    return true;
  }

  function punchFolk() {
    const lv = S.level, pl = S.player;
    if (!lv.folk || !lv.folk.length) return;
    const px = pl.x + PW / 2;
    const cx = px + pl.facing * 16, cy = pl.y + 16;
    for (const f of lv.folk) {
      if (f.gone) continue;
      const p = lv.platById[f.plat];
      if (!p || p.broken) continue;
      const fx = LV.platX(p, S.time) + p.w / 2 + f.ox;
      if (Math.abs(fx - cx) > 26) continue;
      if (Math.abs((p.y + 15) - cy) > 26) continue;
      if ((fx - px) * pl.facing < -8) continue;          // behind you
      knockOff(f, p, fx);
      return;
    }
  }

  function knockOff(f, p, fx) {
    const pl = S.player;
    f.gone = true;
    const rd = SL.gore.makeRagdoll(fx, p.y + 1, {
      vx: pl.facing * (pl.kick ? 320 : 240), vy: pl.kick ? 300 : 210,
      colour: f.colour, hat: f.hat, build: f.build, alive: false
    });
    SL.gore.addBody(S, rd);
    const pay = 8 + Math.floor((S.level.n || 1) / 2);
    S.run.folkValue = (S.run.folkValue || 0) + pay;
    S.run.punted = (S.run.punted || 0) + 1;
    SL.save.addCredits(pay);
    SL.audio.play('hurt');
    SL.util.vibrate(SL.save.data.settings.haptic ? 12 : 0);
    R.burst(fx, p.y + 16, 8, { c: f.colour, speed: 150, g: 320, r: 2.6, life: 0.5 });
    fire('toast', '+' + pay);
    S.hudDirty = true;
  }

  /* the swing poses take priority over the usual walk cycle */
  function arenaPose(pl, dt) {
    const forced = SL.arena.playerPose(S);
    if (forced) { pl.pose = forced; pl.rot = 0; return; }
    if (!pl.onGround) { pl.rot = 0; pl.pose = pl.vy > 40 ? 'jump' : 'fall'; }
    else if (Math.abs(pl.vx) > 22) { pl.rot = 0; pl.pose = 'run'; pl.animPhase += Math.abs(pl.vx) * dt * 0.075; }
    else { pl.rot = 0; pl.pose = 'idle'; pl.animPhase += dt * 2.2; }
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
    S.deathY = pl.y;
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
    S.player.rot = 0;
  }

  function toggleLimp() {
    if (S.mode !== 'play' || S.player.dead) return false;
    if (S.limp) {
      S.limp = false;
      syncFromRagdoll();
      SL.gore.softReset(S);
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
        { k: 'Punted ' + (run.punted || 0), v: run.folkValue || 0 },
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
    const lab = !!(S.run && S.run.lab);
    const arena = !!(S.run && S.run.arena);
    fire('hud', {
      n: S.level.n,
      endless, lab, arena,
      hp: arena && S.arena ? S.arena.hp : 0,
      hpMax: arena && S.arena ? S.arena.hpMax : 1,
      wave: arena && S.arena ? S.arena.wave : 0,
      arenaEarned: arena && S.arena ? S.arena.earned : 0,
      labEarned: lab && S.lab ? S.lab.earned : 0,
      labCombo: lab && S.lab ? S.lab.combo : 0,
      labBodies: lab && S.lab ? S.lab.bodies.length : 0,
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
    const running = S.mode === 'play' || S.mode === 'menu' || S.mode === 'complete' || S.mode === 'lab';
    if (running) {
      acc += dt;
      let guard = 0;
      while (acc >= STEP && guard++ < 8) {
        acc -= STEP;
        if (S.mode === 'menu') { S.time += STEP; idleStep(STEP); }
        else if (S.mode === 'complete') { S.time += STEP; R.stepParts(STEP); }
        else if (S.mode === 'lab') { S.time += STEP; SL.lab.step(S, STEP); }
        else step(STEP);
      }
      if (S.mode !== 'menu') R.stepParts(dt);
      if (S.mode === 'play') SL.save.data.stats.playtime += dt;
    }

    if (S.level) R.frame(S);
    hudClock += dt;
    if (S.hudDirty || ((S.mode === 'play' || S.mode === 'lab') && hudClock > 0.08)) { pushHud(); hudClock = 0; S.hudDirty = false; }
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
      if (S.run && S.run.arena) {                               // the pit shows its own card
        if (S.arena && S.arena.result) fire('arena', S.arena.result);
        return true;
      }
      if (S.run && S.run.endless) { endRun(); return true; }   // one life per run
      respawn();
      return true;
    },
    startEndless() { loadLevel(0, 'play', true); input.jumpEdge = false; },

    /* The fight pit: normal platforming physics, plus everyone else. */
    startArena() {
      S.mods = SL.items.modifiers();
      SL.arena.start(S);
      S.backdrop = R.makeBackdrop(S.level);
      S.run = { n: 0, coins: 0, gems: 0, value: 0, deaths: 0, elapsed: 0, collected: 0,
                replay: false, started: true, halfway: false, endless: false, height: 0,
                lab: false, arena: true };
      S.checkpoint = null; S.limp = false; S.awaitRetry = false;
      fire('retry', null);                    // clear any prompt left over from a previous death
      S.player = newPlayer(W / 2 - PW / 2, 4);
      S.anchor = 0; S.baseCam = MIN_CAM; S.camY = MIN_CAM; S.rising = MIN_CAM - 999;
      S.followGap = followGapFor(1);
      S.mode = 'play';
      S.hudDirty = true;
      input.jumpEdge = false; input.attackEdge = false;
      pushHud();
    },
    fireArena(res) { fire('arena', res); },

    /* Buy your way past a level you are sick of. Marks it cleared at one star
       so it never counts as a real three-star run. */
    skipPrice(n) { return 200 + (n || 1) * 30; },
    canSkip() {
      return !!(S.run && !S.run.endless && !S.run.lab && !S.run.arena && S.level && S.level.n > 0);
    },
    skipLevel() {
      if (!api.canSkip()) return false;
      const n = S.level.n;
      const cost = api.skipPrice(n);
      if (!SL.save.spend(cost)) return false;
      SL.save.recordLevel(n, { t: Infinity, d: 99, c: 0, s: 1 });
      SL.audio.play('buy');
      api.start(n + 1);
      return true;
    },

    /* The smash lab: no climbing, no goal, just a room and a wallet. */
    startLab() {
      S.mods = SL.items.modifiers();
      SL.lab.start(S);
      S.backdrop = R.makeBackdrop(S.level);
      S.player = newPlayer(-500, -500);
      S.run = { n: 0, coins: 0, gems: 0, value: 0, deaths: 0, elapsed: 0, collected: 0,
                replay: false, started: true, halfway: false, endless: false, height: 0, lab: true };
      S.camY = MIN_CAM; S.baseCam = MIN_CAM; S.anchor = 0; S.rising = MIN_CAM - 999;
      S.limp = false; S.awaitRetry = false;
      S.mode = 'lab';
      S.hudDirty = true;
      pushHud();
    },
    get awaitingRetry() { return !!S.awaitRetry && !!S.player && S.player.dead; },
    restart() {
      /* endless and the lab have no level number to reload — start them afresh */
      const from = S.mode === 'pause' ? S.pausedFrom : S.mode;
      if (from === 'lab') { api.startLab(); return; }
      if (S.run && S.run.arena) { api.startArena(); return; }
      if (S.run && S.run.endless) { api.startEndless(); return; }
      const n = S.level ? S.level.n : 1;
      S.checkpoint = null;
      loadLevel(n, 'play');
    },
    nextLevel() { api.start((S.level ? S.level.n : 0) + 1); },
    pause() {
      if (S.mode === 'play' || S.mode === 'lab') { S.pausedFrom = S.mode; S.mode = 'pause'; return true; }
      return false;
    },
    resume() {
      if (S.mode === 'pause') { S.mode = S.pausedFrom || 'play'; input.jumpEdge = false; }
    },
    get pausedFrom() { return S.pausedFrom; },
    toMenu() { S.mode = 'menu'; },
    setKey, setTouch, toggleLimp,
    get limp() { return S.limp; },
    /* headless single step — used by the playtest bot and by tests, not by the
       loop. Ages particles too, or a headless run accumulates them forever. */
    /* Headless step, used by the test harness. Dispatches on mode the same way
       the rAF loop does, so what a test drives is what actually runs. */
    tick(dt) {
      if (!S.level) return;
      if (S.mode === 'lab') { S.time += dt; SL.lab.step(S, dt); }
      else step(dt);
      R.stepParts(dt);
    },
    get mode() { return S.mode; },
    startLoop() { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } },
    refreshMods() { S.mods = SL.items.modifiers(); if (S.player) S.player.jumpsLeft = Math.max(S.player.jumpsLeft, 0); }
  };
  SL.game = api;
})(window.SL);
