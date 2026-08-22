/* Scupper Jump — all drawing lives here. */
(function (SL) {
  'use strict';
  const { clamp, lerp, rngFor } = SL.util;
  const LV = SL.level;

  const VW = 288;                 // logical width, always
  const H_MIN = 440, H_MAX = 660;

  let canvas = null, ctx = null;
  const view = { w: VW, h: 560, scale: 1, ox: 0, oy: 0, cssW: 0, cssH: 0, dpr: 1 };

  /* ---------- setup / resize ---------- */
  function setup(cv) {
    canvas = cv;
    ctx = cv.getContext('2d', { alpha: false });
    if (!ctx.roundRect) {                                  // very old Safari
      CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        this.beginPath();
        this.moveTo(x + rr, y);
        this.arcTo(x + w, y, x + w, y + h, rr);
        this.arcTo(x + w, y + h, x, y + h, rr);
        this.arcTo(x, y + h, x, y, rr);
        this.arcTo(x, y, x + w, y, rr);
        this.closePath();
        return this;
      };
    }
    resize();
    return ctx;
  }

  function resize() {
    const cssW = canvas.clientWidth || window.innerWidth;
    const cssH = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const wantH = clamp(Math.round(VW * cssH / Math.max(1, cssW)), H_MIN, H_MAX);
    const scale = Math.min(cssW / VW, cssH / wantH);
    view.w = VW; view.h = wantH; view.scale = scale;
    view.ox = (cssW - VW * scale) / 2;
    view.oy = (cssH - wantH * scale) / 2;
    view.cssW = cssW; view.cssH = cssH; view.dpr = dpr;
    /* hand the play column's on-screen box to CSS so the HUD and touch pad
       sit on the column, not on the window, when the page is letterboxed */
    const root = document.documentElement.style;
    root.setProperty('--col-w', (VW * scale) + 'px');
    root.setProperty('--col-h', (wantH * scale) + 'px');
  }

  /* ---------- particles ---------- */
  const parts = [];
  function burst(x, y, n, opt) {
    if (SL.save.data.settings.lowfx) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = opt.dir == null ? Math.random() * 6.283 : opt.dir + (Math.random() - 0.5) * (opt.spread || 1.2);
      const sp = (opt.speed || 90) * (0.4 + Math.random() * 0.8);
      parts.push({
        x: x + (Math.random() - 0.5) * (opt.jitter || 6),
        y: y + (Math.random() - 0.5) * (opt.jitter || 6),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        g: opt.g == null ? 320 : opt.g,
        life: 0, max: (opt.life || 0.6) * (0.6 + Math.random() * 0.7),
        r: (opt.r || 3) * (0.6 + Math.random() * 0.8),
        c: opt.c || '#fff', sq: !!opt.square, drag: opt.drag == null ? 0.6 : opt.drag
      });
    }
    if (parts.length > 700) parts.splice(0, parts.length - 700);
  }
  function stepParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      p.vy -= p.g * dt;
      p.vx -= p.vx * p.drag * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }
  function clearParts() { parts.length = 0; }

  /* ---------- backdrop ---------- */
  function makeBackdrop(level) {
    const rng = rngFor(0xBEEF + level.n * 7717);
    const th = level.theme;
    const top = level.goalY + 400;
    const decor = [];
    const kind = th.dust;

    /* slow star / speck field, always present */
    const nStars = kind === 'star' ? 150 : 80;
    for (let i = 0; i < nStars; i++) {
      const px = rng.range(0.06, 0.3);
      decor.push({
        k: 'star', x: rng.range(0, VW), y: rng.range(-80, top * px + view.h + 200),
        r: rng.range(0.6, 1.9), px, ph: rng.range(0, 6.28),
        a: rng.range(0.25, 0.9)
      });
    }
    /* mid-ground shapes */
    const nBlobs = 26;
    for (let i = 0; i < nBlobs; i++) {
      const px = rng.range(0.18, 0.42);
      decor.push({
        k: 'blob', x: rng.range(-60, VW + 60), y: rng.range(-100, top * px + view.h + 200),
        w: rng.range(60, 180), h: rng.range(20, 58), px, ph: rng.range(0, 6.28), a: rng.range(0.06, 0.16)
      });
    }
    /* animated motes (snow, bubbles, dust, moths...) */
    const nMotes = kind === 'snow' ? 90 : kind === 'bubble' ? 70 : 44;
    const motes = [];
    for (let i = 0; i < nMotes; i++) {
      motes.push({
        x: rng.range(0, VW), y: rng.range(0, view.h), r: rng.range(1.2, 3.6),
        sp: rng.range(12, 46), ph: rng.range(0, 6.28), sw: rng.range(6, 26)
      });
    }
    /* ground horizon silhouette */
    const horizon = [];
    for (let i = 0; i < 22; i++) {
      horizon.push({ x: rng.range(-30, VW + 30), w: rng.range(30, 95), h: rng.range(26, 110), r: rng.range(0, 1) });
    }
    return { decor, motes, horizon, kind, th };
  }

  function drawBackdrop(bd, camY, t, progress) {
    const th = bd.th;
    /* sky: blend the three stops as you climb */
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    const a = th.sky[0], b = th.sky[1], c = th.sky[2];
    g.addColorStop(0, mix(a, b, clamp(progress * 0.9, 0, 1)));
    g.addColorStop(0.55, mix(b, c, clamp(progress * 0.7, 0, 1)));
    g.addColorStop(1, mix(c, b, clamp(progress, 0, 1)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    /* stars & blobs */
    for (const d of bd.decor) {
      const sy = view.h - (d.y - camY * d.px);
      if (sy < -140 || sy > view.h + 140) continue;
      if (d.k === 'star') {
        const tw = 0.55 + 0.45 * Math.sin(t * 1.6 + d.ph);
        ctx.globalAlpha = d.a * tw * clamp(0.25 + progress * 1.2, 0, 1);
        ctx.fillStyle = th.accent;
        ctx.beginPath(); ctx.arc(d.x, sy, d.r, 0, 6.284); ctx.fill();
      } else {
        ctx.globalAlpha = d.a;
        ctx.fillStyle = th.far;
        ctx.beginPath(); ctx.ellipse(d.x, sy, d.w / 2, d.h / 2, 0, 0, 6.284); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    /* horizon silhouette — only near the bottom of the tower */
    const hy = view.h - (0 - camY * 0.28);
    if (hy > -220 && hy < view.h + 260) {
      ctx.fillStyle = th.near;
      for (const s of bd.horizon) {
        if (bd.kind === 'city') ctx.fillRect(s.x, hy - s.h, s.w * 0.55, s.h + 40);
        else {
          ctx.beginPath();
          ctx.moveTo(s.x - s.w / 2, hy + 30);
          ctx.quadraticCurveTo(s.x, hy - s.h, s.x + s.w / 2, hy + 30);
          ctx.fill();
        }
      }
      ctx.fillRect(0, hy, view.w, 260);
    }

    /* motes */
    const kind = bd.kind;
    ctx.fillStyle = kind === 'bubble' ? 'rgba(200,240,255,.35)'
                  : kind === 'snow' ? 'rgba(255,255,255,.75)'
                  : kind === 'dust' ? 'rgba(255,190,130,.35)'
                  : 'rgba(255,255,255,.28)';
    if (!SL.save.data.settings.lowfx) {
      for (const m of bd.motes) {
        let y;
        if (kind === 'bubble') y = ((m.y + t * m.sp) % (view.h + 40)) - 20;
        else y = view.h - (((m.y + t * m.sp * (kind === 'snow' ? 1 : 0.35)) % (view.h + 40)) - 20);
        const x = m.x + Math.sin(t * 0.8 + m.ph) * m.sw;
        ctx.beginPath(); ctx.arc(x, y, m.r, 0, 6.284); ctx.fill();
      }
    }
  }

  function mix(h1, h2, t) {
    const c1 = hex(h1), c2 = hex(h2);
    return 'rgb(' + Math.round(lerp(c1[0], c2[0], t)) + ',' + Math.round(lerp(c1[1], c2[1], t)) + ',' + Math.round(lerp(c1[2], c2[2], t)) + ')';
  }
  const hexCache = {};
  function hex(h) {
    if (hexCache[h]) return hexCache[h];
    let s = h.replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const v = [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0];
    hexCache[h] = v; return v;
  }

  /* ---------- platforms ---------- */
  function drawPlatform(p, x, sy, th, t) {
    const w = p.w, h = p.h;
    let base = th.plat, dark = th.platDark, top = '#ffffff';
    if (p.type === 'moving') { base = '#4f9fe0'; dark = '#2c5f8c'; }
    else if (p.type === 'crumble') { base = '#c08c58'; dark = '#7d5630'; }
    else if (p.type === 'ice') { base = '#bfeaff'; dark = '#7fb8d6'; }
    else if (p.type === 'bouncy') { base = '#3ddc97'; dark = '#1e8f60'; }
    else if (p.type === 'goal') { base = '#ffd166'; dark = '#d69a1e'; }

    ctx.save();
    if (p.type === 'crumble' && p.shake) {
      ctx.translate((Math.random() - 0.5) * p.shake * 3, (Math.random() - 0.5) * p.shake * 3);
      ctx.globalAlpha = clamp(1 - p.shake * 0.35, 0.25, 1);
    }
    if (p.pop > 0) {                      // rebuilding after a collapse
      ctx.globalAlpha *= clamp(1 - p.pop, 0.2, 1);
      ctx.translate(x + w / 2, sy + h / 2);
      ctx.scale(1, clamp(1 - p.pop * 0.7, 0.15, 1));
      ctx.translate(-(x + w / 2), -(sy + h / 2));
    }
    /* body */
    const g = ctx.createLinearGradient(0, sy, 0, sy + h);
    g.addColorStop(0, base); g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(x, sy, w, h, 4); ctx.fill();
    /* top light */
    ctx.fillStyle = 'rgba(255,255,255,.34)';
    ctx.beginPath(); ctx.roundRect(x + 2.5, sy + 1.5, w - 5, 2.6, 1.5); ctx.fill();
    /* under shadow */
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.fillRect(x + 3, sy + h, w - 6, 2.5);

    if (p.type === 'moving') {
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      const dirSign = Math.cos(t * p.speed + p.phase) >= 0 ? 1 : -1;
      for (let i = -1; i <= 1; i++) {
        const cx = x + w / 2 + i * 13;
        ctx.beginPath();
        ctx.moveTo(cx - 3 * dirSign, sy + h / 2 - 3);
        ctx.lineTo(cx + 3 * dirSign, sy + h / 2);
        ctx.lineTo(cx - 3 * dirSign, sy + h / 2 + 3);
        ctx.fill();
      }
    } else if (p.type === 'crumble') {
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const cx = x + (w * i) / 4;
        ctx.beginPath(); ctx.moveTo(cx, sy + 2); ctx.lineTo(cx + 2, sy + h - 2); ctx.stroke();
      }
    } else if (p.type === 'ice') {
      ctx.globalAlpha *= 0.85;
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.18, sy + h); ctx.lineTo(x + w * 0.34, sy + 1.5);
      ctx.lineTo(x + w * 0.46, sy + 1.5); ctx.lineTo(x + w * 0.30, sy + h);
      ctx.fill();
      ctx.globalAlpha /= 0.85;
    } else if (p.type === 'bouncy') {
      const c = p.compress || 0;
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      const coilH = 6 - c * 4;
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const px = x + 8 + (w - 16) * (i / 10);
        const py = sy - (i % 2 ? coilH : 0);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    } else if (p.type === 'goal') {
      /* flag pole */
      ctx.strokeStyle = '#e9eefb'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + w / 2, sy); ctx.lineTo(x + w / 2, sy - 40); ctx.stroke();
      ctx.fillStyle = '#3ddc97';
      ctx.beginPath();
      ctx.moveTo(x + w / 2, sy - 40);
      for (let i = 0; i <= 6; i++) {
        const f = i / 6;
        ctx.lineTo(x + w / 2 + f * 22, sy - 40 + f * 2.5 + Math.sin(t * 5 + f * 4) * 2.5);
      }
      for (let i = 6; i >= 0; i--) {
        const f = i / 6;
        ctx.lineTo(x + w / 2 + f * 22, sy - 28 + f * 2.5 + Math.sin(t * 5 + f * 4) * 2.5);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,209,102,.22)';
      ctx.beginPath(); ctx.ellipse(x + w / 2, sy, w * 0.8, 20, 0, 0, 6.284); ctx.fill();
    } else if (p.type === 'ground') {
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      for (let gx = x + 8; gx < x + w - 20; gx += 28) ctx.fillRect(gx, sy + 5, 15, 2.6);
    }

    /* spikes */
    if (p.spike) {
      const zw = w * p.spike.frac;
      const zx = p.spike.side > 0 ? x + w - zw : x;
      ctx.fillStyle = '#ff5d6c';
      const n = Math.max(2, Math.floor(zw / 7.5));
      for (let i = 0; i < n; i++) {
        const sx = zx + (zw * i) / n;
        ctx.beginPath();
        ctx.moveTo(sx, sy); ctx.lineTo(sx + zw / n / 2, sy - 7.5); ctx.lineTo(sx + zw / n, sy);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,93,108,.45)';
      ctx.fillRect(zx, sy, zw, 2.5);
    }
    ctx.restore();
  }

  function drawCoin(c, sy, t) {
    const sp = Math.cos(t * 3.4 + c.x * 0.05);
    if (c.gem) {
      ctx.save();
      ctx.translate(c.x, sy - Math.sin(t * 2 + c.x) * 3);
      ctx.rotate(t * 1.4);
      const g = ctx.createLinearGradient(-c.r, -c.r, c.r, c.r);
      g.addColorStop(0, '#a4f9ff'); g.addColorStop(0.5, '#7ad7ff'); g.addColorStop(1, '#c9a4ff');
      ctx.fillStyle = g;
      ctx.shadowColor = 'rgba(160,220,255,.85)'; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, -c.r); ctx.lineTo(c.r * 0.75, 0); ctx.lineTo(0, c.r); ctx.lineTo(-c.r * 0.75, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(c.x, sy - Math.sin(t * 2.4 + c.x * 0.1) * 2.5);
    ctx.scale(Math.max(0.16, Math.abs(sp)), 1);
    const g = ctx.createRadialGradient(-c.r * 0.3, -c.r * 0.35, 1, 0, 0, c.r);
    g.addColorStop(0, '#fff6cf'); g.addColorStop(1, '#e8a91d');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(255,209,102,.75)'; ctx.shadowBlur = 9;
    ctx.beginPath(); ctx.arc(0, 0, c.r, 0, 6.284); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(140,90,10,.5)';
    ctx.fillRect(-1.2, -c.r * 0.45, 2.4, c.r * 0.9);
    ctx.restore();
  }

  function drawSaw(x, sy, r, t) {
    ctx.save();
    ctx.translate(x, sy);
    ctx.rotate(t * 7);
    ctx.fillStyle = '#8d94ab';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a1 = (i / 10) * 6.284, a2 = ((i + 0.5) / 10) * 6.284;
      ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
      ctx.lineTo(Math.cos(a2) * (r * 0.68), Math.sin(a2) * (r * 0.68));
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff5d6c';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.34, 0, 6.284); ctx.fill();
    ctx.restore();
  }

  /* ---------- the whole frame ---------- */
  function frame(S) {
    const lv = S.level, th = lv.theme, t = S.time, camY = S.camY;
    const toY = (wy) => view.h - (wy - camY);

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, view.cssH);
    bg.addColorStop(0, '#101a30');
    bg.addColorStop(1, '#05070e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, view.cssW, view.cssH);
    ctx.save();
    ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.ox * view.dpr, view.oy * view.dpr);
    ctx.beginPath(); ctx.rect(0, 0, view.w, view.h); ctx.clip();

    const progress = clamp(S.player.y / Math.max(1, lv.goalY), 0, 1);
    drawBackdrop(S.backdrop, camY, t, progress);

    /* platforms */
    for (const p of lv.plats) {
      if (p.broken) continue;
      const sy = toY(p.y);
      if (sy < -80 || sy > view.h + 90) continue;
      drawPlatform(p, LV.platX(p, t), sy, th, t);
    }

    /* blood already spilled */
    SL.gore.drawDecals(S, ctx, toY, t);

    /* saws */
    for (const s of lv.saws) {
      const sy = toY(s.y);
      if (sy < -50 || sy > view.h + 50) continue;
      drawSaw(LV.sawX(s, t), sy, s.r, t);
    }

    /* coins */
    for (const c of lv.coins) {
      if (c.got) continue;
      const sy = toY(c.y);
      if (sy < -40 || sy > view.h + 40) continue;
      drawCoin(c, sy, t);
    }

    /* checkpoint flag */
    if (S.checkpoint) {
      const sy = toY(S.checkpoint.y);
      if (sy > -60 && sy < view.h + 60) {
        ctx.strokeStyle = '#3ddc97'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(S.checkpoint.x, sy); ctx.lineTo(S.checkpoint.x, sy - 30); ctx.stroke();
        ctx.fillStyle = '#3ddc97';
        ctx.beginPath(); ctx.moveTo(S.checkpoint.x, sy - 30);
        ctx.lineTo(S.checkpoint.x + 16, sy - 25); ctx.lineTo(S.checkpoint.x, sy - 20); ctx.fill();
      }
    }

    /* particles */
    for (const p of parts) {
      const sy = toY(p.y);
      if (sy < -30 || sy > view.h + 30) continue;
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      if (p.sq) ctx.fillRect(p.x - p.r, sy - p.r, p.r * 2, p.r * 2);
      else { ctx.beginPath(); ctx.arc(p.x, sy, p.r * a, 0, 6.284); ctx.fill(); }
    }
    ctx.globalAlpha = 1;

    /* the remains */
    if (S.player.dead) SL.gore.drawParts(S, ctx, toY, t);

    /* player (with trail for the fancier skins) */
    const pl = S.player;
    const skin = SL.items.byId[SL.save.equipped('skin')];
    const fx = skin ? skin.fx : null;
    if (!pl.dead && (fx === 'ghost' || fx === 'glow' || fx === 'rainbow') && !SL.save.data.settings.lowfx) {
      for (let i = 0; i < pl.trail.length; i++) {
        const tr = pl.trail[i];
        const a = (i / pl.trail.length) * 0.34;
        ctx.save();
        ctx.translate(tr.x, toY(tr.y));
        SL.stick.draw(ctx, { skin: SL.save.equipped('skin'), hat: null, pose: tr.pose, phase: tr.phase, facing: tr.f, t, alpha: a, thin: true });
        ctx.restore();
      }
    }
    if (!pl.dead) {
      ctx.save();
      ctx.translate(pl.x + pl.w / 2, toY(pl.y));
      SL.stick.draw(ctx, {
        skin: SL.save.equipped('skin'), hat: SL.save.equipped('hat'),
        pose: pl.pose, phase: pl.animPhase, facing: pl.facing, t, squash: pl.squash
      });
      ctx.restore();
    }

    /* shield bubble */
    if (S.shield && !pl.dead) {
      ctx.save();
      ctx.strokeStyle = 'rgba(92,255,193,' + (0.5 + 0.25 * Math.sin(t * 5)) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(pl.x + pl.w / 2, toY(pl.y) - 15, 20, 25, 0, 0, 6.284); ctx.stroke();
      ctx.restore();
    }

    /* the lethal floor, drawn where it actually is */
    if (S.baseCam > 4) {
      const fy = toY(S.baseCam);
      if (fy > -20 && fy < view.h + 60) {
        const g = ctx.createLinearGradient(0, fy - 40, 0, fy);
        g.addColorStop(0, 'rgba(255,60,80,0)');
        g.addColorStop(1, 'rgba(255,60,80,.45)');
        ctx.fillStyle = g;
        ctx.fillRect(0, fy - 40, view.w, 40);
        ctx.strokeStyle = 'rgba(255,120,130,.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x <= view.w; x += 12) {
          const y = fy - 7 - Math.abs(Math.sin(x * 0.11 + t * 2)) * 4.5;
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }

    /* goal glow when close */
    ctx.restore();

    /* letterbox edges */
    if (view.ox > 0.5 || view.oy > 0.5) {
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      const lb = ctx.createLinearGradient(0, 0, 0, view.cssH);
      lb.addColorStop(0, '#101a30');
      lb.addColorStop(1, '#05070e');
      ctx.fillStyle = lb;
      if (view.ox > 0.5) {
        ctx.fillRect(0, 0, view.ox, view.cssH);
        ctx.fillRect(view.cssW - view.ox - 1, 0, view.ox + 1, view.cssH);
      }
      if (view.oy > 0.5) {
        ctx.fillRect(0, 0, view.cssW, view.oy);
        ctx.fillRect(0, view.cssH - view.oy - 1, view.cssW, view.oy + 1);
      }
    }
  }

  SL.render = { setup, resize, frame, view, burst, stepParts, clearParts, makeBackdrop, parts };
})(window.SL);
