/* Scupper Jump — the Smash Lab.
   A room full of stick figures and no climbing. Grab one, fling it at
   something hard, get paid for the damage. Everything here is the same Verlet
   ragdoll, blood and dismemberment the rest of the game uses. */
(function (SL) {
  'use strict';
  const { clamp } = SL.util;
  const LV = SL.level;
  const W = LV.W;

  const POP = 5;                    // how many bodies are kept in the room
  const SMASH_MIN = 620;            // impact below this is just a bump
  const PAY_DIV = 140;              // impact -> credits
  const WALL_BONUS = 4;              // walls and the ceiling are the whole point
  const CUT_BONUS = 10;
  const PAY_COOLDOWN = 0.35;        // one payout per body per wallop, not per limb
  const BODY_CAP = 55;              // a single body is worth this much, then it is spent
  const SPAWN_GRACE = 2.2;          // arriving in the room, and settling, is not a smash
  const GRAB_RADIUS = 30;
  const DESPAWN_REST = 6;           // seconds of lying still before a body is cleared away

  const rnd = (a, b) => a + Math.random() * (b - a);
  const SKINS = ['#e9eefb', '#ff6b6b', '#57b6ff', '#b6ff5c', '#3ddc97', '#ffd166', '#c9a4ff', '#ff8a3d'];
  const HATS = [null, 'hat_cap', 'hat_beanie', 'hat_cork', 'hat_akubra', 'hat_crown', 'hat_prop'];

  /* ---------------- the room ----------------
     A plain padded cell: floor, two walls and a ceiling. Nothing to climb,
     nothing to dodge — the surfaces are the point. */
  const CEILING = 548;

  function buildArena(S) {
    const th = LV.THEMES[4];                       // Harbour Lights: dark, reads well
    const ground = { id: 0, type: 'ground', x: 0, y: 0, w: W, h: LV.PLAT_T, hx: W / 2, range: 0, speed: 0, phase: 0 };
    const plats = [ground];
    const platById = { 0: ground };
    return {
      lab: true, endless: false, n: 0, W, plats, platById, coins: [], saws: [],
      ceiling: CEILING,
      theme: th, difficulty: 0, parTime: Infinity, goalY: 900, top: CEILING,
      coinCount: 0, totalCoinValue: 0, seedTag: 'lab'
    };
  }

  /* ---------------- bodies ---------------- */
  /* They always arrive standing on the floor — never dropped in from above. */
  function spawnBody(S, lab) {
    const x = rnd(34, W - 34);
    const y = 1;
    const rd = SL.gore.makeRagdoll(x, y, {
      vx: rnd(-8, 8), vy: 0,
      colour: SKINS[(Math.random() * SKINS.length) | 0],
      hat: HATS[(Math.random() * HATS.length) | 0],
      alive: false
    });
    rd.hp = 100;
    rd.restT = 0;
    rd.paid = 0;
    rd.lastPay = -99;
    rd.bornT = lab.t;
    rd.onSmash = (impact, p, plat) => onSmash(S, lab, rd, impact, p, plat);
    lab.bodies.push(rd);
    return rd;
  }

  function onSmash(S, lab, rd, impact, p, plat) {
    if (impact < SMASH_MIN) return;
    if (lab.t - rd.bornT < SPAWN_GRACE) return;          // it only just arrived
    rd.hp -= impact / 26;

    const hazard = plat === 'wall' || plat === 'ceiling';
    /* enough of a wallop and something comes off — this is not rate-limited,
       only the money is */
    if (SL.save.setting('gore') !== false && rd.hp < 55 && !rd.burst && impact > 780) {
      rd.burst = true;
      SL.gore.cut(S, rd, p.y + rnd(-4, 8), 0.9);
    }

    /* One payout per body per wallop. Without this every limb that touches
       down bills separately and a single throw pays thousands. */
    if (lab.t - rd.lastPay < PAY_COOLDOWN) return;
    if (rd.paid >= BODY_CAP) return;
    rd.lastPay = lab.t;

    let pay = Math.round(impact / PAY_DIV) + (hazard ? WALL_BONUS : 0) + (rd.burst && !rd.paidCut ? CUT_BONUS : 0);
    if (rd.burst) rd.paidCut = true;
    pay = clamp(pay, 1, BODY_CAP - rd.paid);

    rd.paid += pay;
    lab.earned += pay;
    lab.pending += pay;
    lab.combo = Math.min(9, lab.combo + 1);
    lab.comboT = 1.2;
    lab.pops.push({ x: p.x, y: p.y, v: pay, t: 0, big: hazard || pay > 14 });
    if (lab.pops.length > 24) lab.pops.shift();
    SL.audio.play(hazard ? 'splat' : 'squelch');
    SL.util.vibrate(SL.save.data.settings.haptic ? Math.min(30, 6 + pay) : 0);
  }

  /* ---------------- lifecycle ---------------- */
  function start(S) {
    S.level = buildArena(S);
    S.lab = {
      bodies: [], pops: [], earned: 0, pending: 0, banked: 0,
      combo: 0, comboT: 0, grab: null, t: 0, spawnT: 0
    };
    SL.gore.reset(S);
    for (let i = 0; i < POP; i++) spawnBody(S, S.lab);
    return S.lab;
  }

  function step(S, dt) {
    const lab = S.lab;
    if (!lab) return;
    lab.t += dt;
    if (lab.comboT > 0) { lab.comboT -= dt; if (lab.comboT <= 0) lab.combo = 0; }

    /* the grabbed point is dragged straight to the cursor; letting go throws it */
    const gr = lab.grab;
    if (gr) {
      const p = gr.rd.pts[gr.i];
      const nx = clamp(gr.x, p.r, W - p.r);
      const ny = Math.max(p.r, gr.y);
      p.px = nx - (nx - p.x) * 0.55;
      p.py = ny - (ny - p.y) * 0.55;
      p.x = nx; p.y = ny;
      gr.rd.asleep = false;
      gr.rd.restT = 0;
    }

    for (let i = lab.bodies.length - 1; i >= 0; i--) {
      const rd = lab.bodies[i];
      SL.gore.stepBody(S, rd, dt);
      /* clear away anything that has stopped moving for a while */
      let moving = false;
      for (const p of rd.pts) {
        if (Math.abs(p.x - p.px) > 0.03 || Math.abs(p.y - p.py) > 0.03) { moving = true; break; }
      }
      rd.restT = moving ? 0 : rd.restT + dt;
      if (rd !== (gr && gr.rd) && (rd.restT > DESPAWN_REST || rd.hp <= 0 && rd.restT > 1.5)) {
        lab.bodies.splice(i, 1);
        if (gr && gr.rd === rd) lab.grab = null;
      }
    }

    /* keep the room stocked */
    lab.spawnT -= dt;
    if (lab.bodies.length < POP && lab.spawnT <= 0) {
      lab.spawnT = 0.7;
      spawnBody(S, lab);
    }

    for (let i = lab.pops.length - 1; i >= 0; i--) {
      lab.pops[i].t += dt;
      if (lab.pops[i].t > 1.1) lab.pops.splice(i, 1);
    }

    /* pay out in dribs so the wallet ticks up as you play */
    if (lab.pending > 0) {
      const give = Math.min(lab.pending, Math.max(1, Math.ceil(lab.pending * dt * 6)));
      lab.pending -= give;
      lab.banked += give;
      SL.save.addCredits(give);
    }

    SL.gore.step(S, dt);            // blood, organs and any severed guts
  }

  /* ---------------- grabbing ---------------- */
  function grabAt(S, wx, wy) {
    const lab = S.lab;
    if (!lab) return false;
    let best = null, bestD = GRAB_RADIUS * GRAB_RADIUS;
    for (const rd of lab.bodies) {
      for (let i = 0; i < rd.pts.length; i++) {
        const p = rd.pts[i];
        const d = (p.x - wx) * (p.x - wx) + (p.y - wy) * (p.y - wy);
        if (d < bestD) { bestD = d; best = { rd, i }; }
      }
    }
    if (!best) return false;
    lab.grab = { rd: best.rd, i: best.i, x: wx, y: wy };
    best.rd.asleep = false;
    SL.audio.play('ui');
    return true;
  }
  function moveGrab(S, wx, wy) {
    if (S.lab && S.lab.grab) { S.lab.grab.x = wx; S.lab.grab.y = wy; }
  }
  function release(S) {
    if (S.lab) S.lab.grab = null;
  }
  const isGrabbing = (S) => !!(S.lab && S.lab.grab);

  /* ---------------- drawing ---------------- */
  function draw(ctx, S, toY, t) {
    const lab = S.lab;
    if (!lab) return;

    /* a ring round whatever you are holding */
    if (lab.grab) {
      const p = lab.grab.rd.pts[lab.grab.i];
      ctx.save();
      ctx.strokeStyle = 'rgba(255,176,55,.85)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(p.x, toY(p.y), 9 + Math.sin(t * 9) * 1.4, 0, 6.284);
      ctx.stroke();
      ctx.restore();
    }

    for (const rd of lab.bodies) SL.gore.drawRagdoll(ctx, rd, toY, t);

    for (const pop of lab.pops) {
      const a = 1 - pop.t / 1.1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = pop.big ? '#ffd166' : '#3ddc97';
      ctx.font = '900 ' + (pop.big ? 15 : 12) + 'px ui-rounded, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('+' + pop.v, pop.x, toY(pop.y) - 14 - pop.t * 26);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  SL.lab = { start, step, draw, grabAt, moveGrab, release, isGrabbing, POP, CEILING };
})(window.SL);
