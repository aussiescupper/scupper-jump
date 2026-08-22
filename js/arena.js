/* Scupper Jump — the Fight Pit.
   You keep the platformer physics you already know; the other stick figures
   walk in and try to knock you down. Beat them, get paid. */
(function (SL) {
  'use strict';
  const { clamp } = SL.util;
  const LV = SL.level;
  const W = LV.W;

  const PW = 18, PH = 30;
  const GRAV = 2000;
  const FLOOR_FRIC = 2400, AIR_FRIC = 380;

  /* --- player --- */
  const HP_MAX = 100;
  const PUNCH_RANGE = 30, PUNCH_REACH_Y = 26;
  const PUNCH_DMG = 14, KICK_DMG = 20;
  const PUNCH_CD = 0.30, PUNCH_ACTIVE = 0.12;
  const HURT_INVULN = 0.55;

  /* --- enemies --- */
  const FOE_W = 18, FOE_H = 30;
  const FOE_WINDUP = 0.30;          // the tell, so a hit is always dodgeable
  const FOE_RANGE = 26, FOE_CD = 1.05;
  const MAX_ALIVE = 7;
  const MAX_BODIES = 10;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const COLOURS = ['#ff6b6b', '#57b6ff', '#b6ff5c', '#c9a4ff', '#ff8a3d', '#5cffc1', '#ffd166'];
  const HATS = [null, 'hat_cap', 'hat_beanie', 'hat_cork', 'hat_akubra', 'hat_prop'];
  const BUILD_POOL = ['build_classic', 'build_classic', 'build_lanky', 'build_stocky', 'build_buff', 'build_pip'];

  /* ---------------- the pit ---------------- */
  function buildPit() {
    const th = LV.THEMES[5];                      // Uluru at Dusk: warm, high contrast
    const plats = [];
    let id = 0;
    const add = (x, y, w, type) => {
      const p = { id: id++, type: type || 'normal', x, y, w, h: LV.PLAT_T,
                  hx: x + w / 2, range: 0, speed: 0, phase: 0 };
      plats.push(p);
      return p;
    };
    add(0, 0, W, 'ground');
    add(6, 132, 88);
    add(W - 94, 132, 88);
    add(W / 2 - 52, 246, 104);
    add(10, 352, 76);
    add(W - 86, 352, 76);
    const platById = {};
    for (const p of plats) platById[p.id] = p;
    return {
      arena: true, lab: false, endless: false, n: 0, W, plats, platById,
      coins: [], saws: [], theme: th, difficulty: 0, parTime: Infinity,
      goalY: 620, top: 420, coinCount: 0, totalCoinValue: 0, seedTag: 'pit'
    };
  }

  /* ---------------- fighters ---------------- */
  function makeFoe(S, a, wave) {
    const side = Math.random() < 0.5 ? -1 : 1;
    return {
      x: side < 0 ? 10 : W - PW - 10, y: 2,
      vx: 0, vy: 0, w: FOE_W, h: FOE_H,
      onGround: false, facing: -side,
      hp: 26 + wave * 7, hpMax: 26 + wave * 7,
      speed: rnd(78, 104) + wave * 3,
      atk: 0, cd: rnd(0.3, 1.1), hurt: 0, jumpCd: 0,
      colour: COLOURS[(Math.random() * COLOURS.length) | 0],
      hat: HATS[(Math.random() * HATS.length) | 0],
      build: BUILD_POOL[(Math.random() * BUILD_POOL.length) | 0],
      phase: rnd(0, 6.28), dead: false
    };
  }

  function stepFighter(S, f, dt) {
    const plats = S.level.plats;
    f.vy -= GRAV * dt;
    if (f.vy < -1250) f.vy = -1250;

    f.x += f.vx * dt;
    if (f.x < 0) { f.x = 0; f.vx = 0; }
    if (f.x + f.w > W) { f.x = W - f.w; f.vx = 0; }

    const prevY = f.y;
    f.y += f.vy * dt;
    f.onGround = false;
    if (f.vy <= 0) {
      let best = null, bestY = -Infinity;
      for (const p of plats) {
        if (p.broken) continue;
        const px = LV.platX(p, S.time);
        if (f.x + f.w <= px + 1 || f.x >= px + p.w - 1) continue;
        if (prevY < p.y - 1.5 || f.y > p.y) continue;
        if (p.y > bestY) { bestY = p.y; best = p; }
      }
      if (best) { f.y = best.y; f.vy = 0; f.onGround = true; }
    }
    const fric = f.onGround ? FLOOR_FRIC : AIR_FRIC;
    const s = Math.sign(f.vx);
    if (s) { f.vx -= s * fric * dt; if (Math.sign(f.vx) !== s) f.vx = 0; }
  }

  /* ---------------- damage ---------------- */
  function hurtFoe(S, ar, f, dmg, dir, power) {
    f.hp -= dmg;
    f.hurt = 0.22;
    f.vx = dir * (150 + power * 90);
    f.vy = 210 + power * 70;
    f.atk = 0;
    SL.audio.play('hurt');
    if (SL.save.setting('blood') !== false) {
      SL.gore.splash(S, f.x + f.w / 2, f.y + 18, 8, 130, 0.2);
    }
    if (f.hp <= 0) killFoe(S, ar, f, dir);
  }

  function killFoe(S, ar, f, dir) {
    f.dead = true;
    const rd = SL.gore.makeRagdoll(f.x + f.w / 2, f.y, {
      vx: dir * rnd(90, 190), vy: rnd(120, 260),
      colour: f.colour, hat: f.hat, build: f.build, alive: false
    });
    ar.bodies.push(rd);
    if (ar.bodies.length > MAX_BODIES) ar.bodies.shift();

    const pay = 3 + ar.wave;
    ar.earned += pay;
    ar.kills++;
    SL.save.addCredits(pay);
    ar.pops.push({ x: f.x + f.w / 2, y: f.y + 22, v: pay, t: 0, big: false });
    SL.audio.play('splat');
    SL.util.vibrate(SL.save.data.settings.haptic ? 14 : 0);
  }

  function hurtPlayer(S, ar, dmg, dir) {
    if (ar.invuln > 0 || ar.over) return;
    ar.hp -= dmg;
    ar.invuln = HURT_INVULN;
    ar.shake = 0.28;
    const pl = S.player;
    pl.vx = dir * 190;
    pl.vy = 230;
    pl.onGround = false;
    SL.audio.play('hurt');
    SL.util.vibrate(SL.save.data.settings.haptic ? [16, 30, 16] : 0);
    if (SL.save.setting('blood') !== false) {
      SL.gore.splash(S, pl.x + PW / 2, pl.y + 18, 10, 150, 0.2);
    }
    if (ar.hp <= 0) { ar.hp = 0; endRound(S, ar); }
  }

  /* ---------------- the player's swing ---------------- */
  function playerAttack(S) {
    const ar = S.arena;
    if (!ar || ar.over) return false;
    if (ar.swing > 0 || ar.swingCd > 0) return false;
    const pl = S.player;
    ar.swing = PUNCH_ACTIVE;
    ar.swingCd = PUNCH_CD;
    ar.kick = !pl.onGround;
    ar.hitThisSwing = [];
    SL.audio.play(ar.kick ? 'djump' : 'jump');
    return true;
  }

  function resolveSwing(S, ar) {
    const pl = S.player;
    const dmg = ar.kick ? KICK_DMG : PUNCH_DMG;
    const power = ar.kick ? 1.4 : 1;
    const cx = pl.x + PW / 2 + pl.facing * (PUNCH_RANGE * 0.55);
    const cy = pl.y + 17;
    for (const f of ar.foes) {
      if (f.dead || ar.hitThisSwing.indexOf(f) >= 0) continue;
      const fx = f.x + f.w / 2, fy = f.y + f.h / 2;
      if (Math.abs(fx - cx) > PUNCH_RANGE * 0.75 + f.w / 2) continue;
      if (Math.abs(fy - cy) > PUNCH_REACH_Y) continue;
      if ((fx - (pl.x + PW / 2)) * pl.facing < -6) continue;      // behind you
      ar.hitThisSwing.push(f);
      hurtFoe(S, ar, f, dmg, pl.facing, power);
      ar.shake = Math.max(ar.shake, 0.16);
    }
  }

  /* ---------------- enemy brains ---------------- */
  function thinkFoe(S, ar, f, dt) {
    const pl = S.player;
    const px = pl.x + PW / 2, fx = f.x + f.w / 2;
    const dx = px - fx, dy = pl.y - f.y;

    if (f.hurt > 0) { f.hurt -= dt; return; }
    if (f.cd > 0) f.cd -= dt;
    if (f.jumpCd > 0) f.jumpCd -= dt;

    if (f.atk > 0) {                       // winding up — committed
      f.atk -= dt;
      if (f.atk <= 0) {
        f.cd = FOE_CD;
        if (Math.abs(px - fx) < FOE_RANGE + 8 && Math.abs(pl.y - f.y) < 26) {
          hurtPlayer(S, ar, 8 + Math.floor(ar.wave * 0.6), Math.sign(dx) || 1);
        }
      }
      return;
    }

    f.facing = dx < 0 ? -1 : 1;
    if (Math.abs(dx) < FOE_RANGE && Math.abs(dy) < 24 && f.cd <= 0) {
      f.atk = FOE_WINDUP;                  // telegraph, then swing
      f.vx *= 0.3;
      return;
    }

    if (f.onGround) {
      f.vx = Math.sign(dx) * f.speed;
      if (dy > 40 && f.jumpCd <= 0) { f.vy = 740; f.onGround = false; f.jumpCd = rnd(0.5, 1.2); }
    } else {
      f.vx += Math.sign(dx) * 420 * dt;
      f.vx = clamp(f.vx, -f.speed * 1.2, f.speed * 1.2);
    }
    f.phase += Math.abs(f.vx) * dt * 0.075;
  }

  /* ---------------- waves ---------------- */
  function startWave(S, ar, n) {
    ar.wave = n;
    ar.toSpawn = Math.min(14, 2 + Math.floor(n * 0.8));
    ar.waveBanner = 1.8;
    SL.audio.play('check');
  }

  function endRound(S, ar) {
    if (ar.over) return;
    ar.over = true;
    const pl = S.player;
    pl.dead = true; pl.deadT = 0;
    S.deathY = pl.y;
    S.cutY = null; S.cutWhere = null;
    SL.gore.spawn(S, 'fell', null);
    SL.audio.play('die');
    const best = SL.save.arenaBest();
    const isBest = ar.wave > best;
    if (isBest) SL.save.setArenaBest(ar.wave);
    /* stash it — the card waits until they have watched the knockout and clicked */
    ar.result = {
      wave: ar.wave, best: Math.max(best, ar.wave), isBest,
      kills: ar.kills, earned: ar.earned
    };
  }

  /* ---------------- lifecycle ---------------- */
  function start(S) {
    S.level = buildPit();
    S.arena = {
      hp: HP_MAX, hpMax: HP_MAX, invuln: 0, shake: 0,
      swing: 0, swingCd: 0, kick: false, hitThisSwing: [],
      foes: [], bodies: [], pops: [],
      wave: 0, toSpawn: 0, spawnT: 0, waveBanner: 0, breather: 1.4,
      kills: 0, earned: 0, over: false, t: 0
    };
    SL.gore.reset(S);
    return S.arena;
  }

  function step(S, dt) {
    const ar = S.arena;
    if (!ar) return;
    ar.t += dt;
    if (ar.invuln > 0) ar.invuln -= dt;
    if (ar.shake > 0) ar.shake -= dt;
    if (ar.waveBanner > 0) ar.waveBanner -= dt;
    if (ar.swingCd > 0) ar.swingCd -= dt;

    if (ar.swing > 0) { resolveSwing(S, ar); ar.swing -= dt; }

    /* wave flow */
    if (!ar.over) {
      if (ar.breather > 0) {
        ar.breather -= dt;
        if (ar.breather <= 0) startWave(S, ar, ar.wave + 1);
      } else if (ar.toSpawn > 0) {
        ar.spawnT -= dt;
        if (ar.spawnT <= 0 && ar.foes.length < MAX_ALIVE) {
          ar.spawnT = 0.55;
          ar.toSpawn--;
          ar.foes.push(makeFoe(S, ar, ar.wave));
        }
      } else if (!ar.foes.length) {
        const bonus = 10 + ar.wave * 4;
        ar.earned += bonus;
        SL.save.addCredits(bonus);
        ar.pops.push({ x: W / 2, y: 120, v: bonus, t: 0, big: true });
        ar.breather = 1.9;
      }
    }

    for (let i = ar.foes.length - 1; i >= 0; i--) {
      const f = ar.foes[i];
      if (!ar.over) thinkFoe(S, ar, f, dt);
      stepFighter(S, f, dt);
      if (f.dead) ar.foes.splice(i, 1);
    }

    for (const rd of ar.bodies) SL.gore.stepBody(S, rd, dt);
    SL.gore.step(S, dt);

    for (let i = ar.pops.length - 1; i >= 0; i--) {
      ar.pops[i].t += dt;
      if (ar.pops[i].t > 1.2) ar.pops.splice(i, 1);
    }
  }

  /* ---------------- drawing ---------------- */
  function draw(ctx, S, toY, t) {
    const ar = S.arena;
    if (!ar) return;

    for (const rd of ar.bodies) SL.gore.drawRagdoll(ctx, rd, toY, t);

    for (const f of ar.foes) {
      ctx.save();
      ctx.translate(f.x + f.w / 2, toY(f.y));
      let pose = 'idle';
      if (f.atk > 0) pose = 'windup';
      else if (!f.onGround) pose = f.vy > 40 ? 'jump' : 'fall';
      else if (Math.abs(f.vx) > 20) pose = 'run';
      if (f.hurt > 0) { ctx.globalAlpha = 0.55 + 0.45 * Math.sin(f.hurt * 90); }
      SL.stick.draw(ctx, { skin: null, colour: f.colour, hat: f.hat, build: f.build,
        pose, phase: f.phase, facing: f.facing, t });
      ctx.restore();
      /* health pip above anyone who has been hit */
      if (f.hp < f.hpMax) {
        const w = 22, frac = clamp(f.hp / f.hpMax, 0, 1);
        const sy = toY(f.y) - 40;
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fillRect(f.x + f.w / 2 - w / 2, sy, w, 3.4);
        ctx.fillStyle = frac > 0.4 ? '#3ddc97' : '#ff5d6c';
        ctx.fillRect(f.x + f.w / 2 - w / 2, sy, w * frac, 3.4);
      }
    }

    /* your swing */
    if (ar.swing > 0 && !S.player.dead) {
      const pl = S.player;
      const cx = pl.x + PW / 2 + pl.facing * 20;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, toY(pl.y + 17), 13, -0.9 * pl.facing, 0.9 * pl.facing, pl.facing < 0);
      ctx.stroke();
      ctx.restore();
    }

    for (const pop of ar.pops) {
      const a = 1 - pop.t / 1.2;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = pop.big ? '#ffd166' : '#3ddc97';
      ctx.font = '900 ' + (pop.big ? 17 : 12) + 'px ui-rounded, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('+' + pop.v, pop.x, toY(pop.y) - pop.t * 26);
      ctx.restore();
    }

    if (ar.waveBanner > 0 && !ar.over) {
      const a = Math.min(1, ar.waveBanner / 0.4);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffb037';
      ctx.font = '900 26px ui-rounded, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('WAVE ' + ar.wave, W / 2, SL.render.view.h * 0.3);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** the player flashes while they cannot be hit */
  const playerAlpha = (S) => (S.arena && S.arena.invuln > 0
    ? 0.35 + 0.65 * Math.abs(Math.sin(S.arena.invuln * 40)) : 1);

  const playerPose = (S) => {
    const ar = S.arena;
    if (!ar || ar.swing <= 0) return null;
    return ar.kick ? 'kick' : 'punch';
  };

  SL.arena = { start, step, draw, playerAttack, playerAlpha, playerPose, HP_MAX };
})(window.SL);
