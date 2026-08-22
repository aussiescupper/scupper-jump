/* Scupper Jump — the stickman himself. Shared by the game canvas and the shop previews. */
(function (SL) {
  'use strict';

  /* Body is 30 units tall, feet at y = 0, head at y = -30. */
  const H = 30;
  const HIP = -11, SHOULDER = -20.5, HEAD_Y = -25.6, HEAD_R = 4.4;

  function skinColour(id, t) {
    const s = SL.items.byId[id];
    if (!s) return '#e9eefb';
    if (s.fx === 'rainbow') return 'hsl(' + ((t * 90) % 360) + ',85%,68%)';
    return s.colour || '#e9eefb';
  }

  function limb(ctx, x0, y0, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /* pose returns joint offsets relative to the body origin (feet centre) */
  function poseOf(pose, phase, facing) {
    const f = facing;
    if (pose === 'jump') {
      return {
        legs: [[f * 2.5, HIP + 5, f * 5.5, HIP + 8.0], [-f * 3.5, HIP + 6, -f * 2.5, HIP + 10.5]],
        arms: [[f * 4.5, SHOULDER - 3.5, f * 6.5, SHOULDER - 8.5], [-f * 4.5, SHOULDER - 3, -f * 6, SHOULDER - 8]],
        lean: f * 1.2
      };
    }
    if (pose === 'fall') {
      return {
        legs: [[f * 5, HIP + 6, f * 8, HIP + 10.5], [-f * 4.5, HIP + 6.5, -f * 7, HIP + 11]],
        arms: [[f * 6, SHOULDER - 1.5, f * 8.5, SHOULDER - 5.5], [-f * 6, SHOULDER - 1, -f * 8.5, SHOULDER - 5]],
        lean: -f * 0.8
      };
    }
    if (pose === 'run') {
      const s = Math.sin(phase), c = Math.cos(phase);
      return {
        legs: [
          [f * (s * 2.5) + f * 1, HIP + 5.5, f * (s * 6.5), HIP + 11 - Math.max(0, c) * 2.2],
          [f * (-s * 2.5) - f * 1, HIP + 5.5, f * (-s * 6.5), HIP + 11 - Math.max(0, -c) * 2.2]
        ],
        arms: [
          [f * (-s * 3.4) + f * 3.4, SHOULDER + 3.6, f * (-s * 6) + f * 3.2, SHOULDER + 7.6],
          [f * (s * 3.4) - f * 3.4, SHOULDER + 3.6, f * (s * 6) - f * 3.2, SHOULDER + 7.6]
        ],
        lean: f * 1.6
      };
    }
    /* idle */
    const b = Math.sin(phase * 0.5) * 0.35;
    return {
      legs: [[f * 2.0, HIP + 5.5, f * 3.6, 0], [-f * 2.0, HIP + 5.5, -f * 3.6, 0]],
      arms: [[f * 5.4, SHOULDER + 3.5 + b, f * 6.4, SHOULDER + 8 + b], [-f * 5.4, SHOULDER + 3.5 - b, -f * 6.4, SHOULDER + 8 - b]],
      lean: 0
    };
  }

  function drawHat(ctx, hatId, colour, t, facing) {
    if (!hatId || hatId === 'hat_none') return;
    const y = HEAD_Y, r = HEAD_R, f = facing;
    ctx.lineWidth = 2.0;
    switch (hatId) {
      case 'hat_cap':
        ctx.fillStyle = '#ff5d6c';
        ctx.beginPath(); ctx.arc(0, y - 0.6, r + 0.9, Math.PI, 0); ctx.fill();
        ctx.fillRect(-f * (r + 4.6), y - 1.9, f * 4.8, 1.9);
        break;
      case 'hat_beanie':
        ctx.fillStyle = '#43a6ff';
        ctx.beginPath(); ctx.arc(0, y - 0.9, r + 1.1, Math.PI, 0); ctx.fill();
        ctx.fillRect(-(r + 1.1), y - 1.4, (r + 1.1) * 2, 2.1);
        ctx.fillStyle = '#e9eefb';
        ctx.beginPath(); ctx.arc(0, y - r - 2.6, 1.5, 0, 7); ctx.fill();
        break;
      case 'hat_cork': {
        ctx.fillStyle = '#e8d9a8';
        ctx.beginPath(); ctx.ellipse(0, y - r + 0.6, r + 5, 1.5, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(0, y - r + 0.4, r * 0.95, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = '#b9a97a'; ctx.lineWidth = 0.7; ctx.fillStyle = '#d9c48c';
        for (let i = -2; i <= 2; i++) {
          if (!i) continue;
          const cx = i * 2.4, sway = Math.sin(t * 4 + i) * 0.8;
          ctx.beginPath(); ctx.moveTo(cx, y - r + 1.4); ctx.lineTo(cx + sway, y - r + 5); ctx.stroke();
          ctx.beginPath(); ctx.arc(cx + sway, y - r + 5.9, 1.0, 0, 7); ctx.fill();
        }
        break;
      }
      case 'hat_akubra':
        ctx.fillStyle = '#8a6a45';
        ctx.beginPath(); ctx.ellipse(0, y - r + 0.9, r + 6, 1.8, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(0, y - r + 0.7, r * 1.05, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#5c452c'; ctx.fillRect(-r, y - r - 0.6, r * 2, 1.3);
        break;
      case 'hat_halo':
        ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.6;
        ctx.shadowColor = 'rgba(255,209,102,.9)'; ctx.shadowBlur = 7;
        ctx.beginPath(); ctx.ellipse(0, y - r - 4 + Math.sin(t * 2) * 0.5, r + 1.2, 1.5, 0, 0, 7); ctx.stroke();
        ctx.shadowBlur = 0;
        break;
      case 'hat_crown':
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(-r - 0.6, y - r + 0.4);
        ctx.lineTo(-r - 0.6, y - r - 3.4); ctx.lineTo(-r * 0.5, y - r - 1.2);
        ctx.lineTo(0, y - r - 4.4); ctx.lineTo(r * 0.5, y - r - 1.2);
        ctx.lineTo(r + 0.6, y - r - 3.4); ctx.lineTo(r + 0.6, y - r + 0.4);
        ctx.closePath(); ctx.fill();
        break;
      case 'hat_prop': {
        ctx.fillStyle = '#3ddc97';
        ctx.beginPath(); ctx.arc(0, y - 0.6, r + 0.9, Math.PI, 0); ctx.fill();
        const spin = t * 11;
        ctx.strokeStyle = '#ff5d6c'; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, y - r - 2.6); ctx.lineTo(0, y - r - 1);
        ctx.stroke();
        ctx.save();
        ctx.translate(0, y - r - 3);
        ctx.scale(Math.cos(spin), 1);
        ctx.beginPath(); ctx.moveTo(-4.5, 0); ctx.lineTo(4.5, 0); ctx.stroke();
        ctx.restore();
        break;
      }
    }
  }

  /**
   * draw(ctx, opts)
   *  ctx must already be translated so (0,0) is the stickman's feet centre,
   *  and scaled so one unit = one world pixel.
   */
  function draw(ctx, o) {
    const facing = o.facing || 1;
    const t = o.t || 0;
    const colour = o.colour || skinColour(o.skin, t);
    const skin = SL.items.byId[o.skin];
    const fx = skin ? skin.fx : null;
    const p = poseOf(o.pose || 'idle', o.phase || 0, facing);

    ctx.save();
    if (o.squash && o.squash !== 1) {
      ctx.scale(2 - o.squash, o.squash);          // volume-ish preserving squash about the feet
    }
    ctx.translate(p.lean * 0.5, 0);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = o.thin ? 2.3 : 3.0;
    ctx.globalAlpha = (o.alpha == null ? 1 : o.alpha) * (fx === 'ghost' ? 0.62 : 1);

    if (fx === 'glow' || fx === 'rainbow') { ctx.shadowColor = colour; ctx.shadowBlur = 10; }
    if (fx === 'sparkle') { ctx.shadowColor = 'rgba(255,209,102,.85)'; ctx.shadowBlur = 6; }

    /* legs */
    limb(ctx, 0, HIP, p.legs[0][0], p.legs[0][1], p.legs[0][2], p.legs[0][3]);
    limb(ctx, 0, HIP, p.legs[1][0], p.legs[1][1], p.legs[1][2], p.legs[1][3]);
    /* torso */
    ctx.beginPath(); ctx.moveTo(0, HIP); ctx.lineTo(p.lean, SHOULDER); ctx.stroke();
    /* arms */
    limb(ctx, p.lean, SHOULDER, p.arms[0][0], p.arms[0][1], p.arms[0][2], p.arms[0][3]);
    limb(ctx, p.lean, SHOULDER, p.arms[1][0], p.arms[1][1], p.arms[1][2], p.arms[1][3]);
    /* head */
    ctx.beginPath();
    ctx.arc(p.lean * 1.4, HEAD_Y, HEAD_R, 0, Math.PI * 2);
    ctx.stroke();
    if (fx === 'ghost') { ctx.globalAlpha *= 0.35; ctx.fill(); ctx.globalAlpha /= 0.35; }

    /* eyes — a tiny bit of life */
    ctx.shadowBlur = 0;
    ctx.fillStyle = colour;
    const ex = p.lean * 1.4 + facing * 1.4, ey = HEAD_Y - 0.5;
    ctx.beginPath(); ctx.arc(ex, ey, 0.65, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(ex - facing * 2.5, ey, 0.65, 0, 7); ctx.fill();

    ctx.save();
    ctx.translate(p.lean * 1.4, 0);
    drawHat(ctx, o.hat, colour, t, facing);
    ctx.restore();

    ctx.restore();
  }

  /* Brand mark: stickman standing on a block. */
  function logo(canvas, size) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr; canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const s = size / 64;
    ctx.save(); ctx.scale(s, s);
    /* block */
    const g = ctx.createLinearGradient(0, 40, 0, 56);
    g.addColorStop(0, '#ffb037'); g.addColorStop(1, '#e07a12');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(11, 40, 42, 13, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.32)';
    ctx.beginPath(); ctx.roundRect(13, 41.5, 38, 3, 2); ctx.fill();
    /* figure */
    ctx.save();
    ctx.translate(32, 40);
    ctx.scale(1.06, 1.06);
    draw(ctx, { skin: 'skin_neon', hat: 'hat_none', pose: 'jump', facing: 1, t: 0, colour: '#3ddc97' });
    ctx.restore();
    ctx.restore();
  }

  SL.stick = { draw, drawHat, logo, skinColour, H, HEAD_Y, HEAD_R };
})(window.SL);
