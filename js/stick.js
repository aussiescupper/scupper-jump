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

  /* ---- bought animations: each returns the same {legs, arms, lean, drop} shape ---- */
  const WALK = {
    walk_classic(f, ph) {
      const s = Math.sin(ph), c = Math.cos(ph);
      return {
        legs: [[f * (s * 2.5) + f * 1, HIP + 5.5, f * (s * 6.5), HIP + 11 - Math.max(0, c) * 2.2],
               [f * (-s * 2.5) - f * 1, HIP + 5.5, f * (-s * 6.5), HIP + 11 - Math.max(0, -c) * 2.2]],
        arms: [[f * (-s * 3.4) + f * 3.4, SHOULDER + 3.6, f * (-s * 6) + f * 3.2, SHOULDER + 7.6],
               [f * (s * 3.4) - f * 3.4, SHOULDER + 3.6, f * (s * 6) - f * 3.2, SHOULDER + 7.6]],
        lean: f * 1.6
      };
    },
    walk_strut(f, ph) {
      const s = Math.sin(ph), c = Math.cos(ph);
      return {
        legs: [[f * s * 3.6, HIP + 4.2 - Math.max(0, c) * 2.4, f * s * 8, HIP + 11 - Math.max(0, c) * 4],
               [f * -s * 3.6, HIP + 4.2 - Math.max(0, -c) * 2.4, f * -s * 8, HIP + 11 - Math.max(0, -c) * 4]],
        arms: [[f * (-s * 5) + f * 2, SHOULDER + 1, f * (-s * 8.5) + f * 1, SHOULDER - 3.5],
               [f * (s * 5) - f * 2, SHOULDER + 1, f * (s * 8.5) - f * 1, SHOULDER - 3.5]],
        lean: -f * 0.4
      };
    },
    walk_shuffle(f, ph) {
      const s = Math.sin(ph * 1.6);
      return {
        legs: [[f * s * 1.2 + f * 1.4, HIP + 5.6, f * s * 3, 0],
               [f * -s * 1.2 - f * 1.4, HIP + 5.6, f * -s * 3, 0]],
        arms: [[f * 4.6, SHOULDER + 4.5, f * 5.4, SHOULDER + 9], [-f * 4.6, SHOULDER + 4.5, -f * 5.4, SHOULDER + 9]],
        lean: f * 0.6, drop: 1.2
      };
    },
    walk_sprint(f, ph) {
      const s = Math.sin(ph), c = Math.cos(ph);
      return {
        legs: [[f * (s * 3.4) + f * 2, HIP + 5, f * (s * 7.5) + f * 2, HIP + 11 - Math.max(0, c) * 3],
               [f * (-s * 3.4) + f * 1, HIP + 5, f * (-s * 7.5), HIP + 11 - Math.max(0, -c) * 3]],
        arms: [[f * (-s * 4) + f * 4.5, SHOULDER + 2.5, f * (-s * 4) + f * 7.5, SHOULDER - 0.5],
               [f * (s * 4) - f * 1.5, SHOULDER + 2.5, f * (s * 4) - f * 4.5, SHOULDER - 0.5]],
        lean: f * 4.2
      };
    },
    walk_moon(f, ph) {
      const s = Math.sin(ph * 0.8);
      return {
        legs: [[f * 2, HIP + 5.5, f * (5.5 + s * 3), 0],
               [-f * 1.5, HIP + 6, -f * (2 + s * 4), HIP + 10]],
        arms: [[f * 5.5, SHOULDER + 2, f * 8, SHOULDER - 2], [-f * 5, SHOULDER + 3.5, -f * 7, SHOULDER + 7]],
        lean: -f * 2.6
      };
    }
  };

  const JUMP = {
    jump_classic(f, ph, rising) {
      if (rising) return {
        legs: [[f * 2.5, HIP + 5, f * 5.5, HIP + 8], [-f * 3.5, HIP + 6, -f * 2.5, HIP + 10.5]],
        arms: [[f * 4.5, SHOULDER - 3.5, f * 6.5, SHOULDER - 8.5], [-f * 4.5, SHOULDER - 3, -f * 6, SHOULDER - 8]],
        lean: f * 1.2
      };
      return {
        legs: [[f * 5, HIP + 6, f * 8, HIP + 10.5], [-f * 4.5, HIP + 6.5, -f * 7, HIP + 11]],
        arms: [[f * 6, SHOULDER - 1.5, f * 8.5, SHOULDER - 5.5], [-f * 6, SHOULDER - 1, -f * 8.5, SHOULDER - 5]],
        lean: -f * 0.8
      };
    },
    jump_hero(f, ph, rising) {
      return {
        legs: [[f * -2, HIP + 5, f * -6.5, HIP + 8.5], [-f * 4, HIP + 6.5, -f * 8.5, HIP + 11]],
        arms: [[f * 6.5, SHOULDER - 3, f * 12, SHOULDER - 6.5], [-f * 4, SHOULDER + 3, -f * 6.5, SHOULDER + 6.5]],
        lean: f * 3.4
      };
    },
    jump_tuck(f, ph, rising) {
      const t = rising ? 0 : 1.2;
      return {
        legs: [[f * 4.5, HIP + 1.5 + t, f * 3, HIP - 3 + t], [-f * 4.5, HIP + 2 + t, -f * 3, HIP - 2.5 + t]],
        arms: [[f * 5, SHOULDER + 3, f * 3.5, SHOULDER + 7], [-f * 5, SHOULDER + 3, -f * 3.5, SHOULDER + 7]],
        lean: f * 0.4, drop: -2
      };
    },
    jump_star(f, ph) {
      return {
        legs: [[f * 6, HIP + 5, f * 11, HIP + 9], [-f * 6, HIP + 5, -f * 11, HIP + 9]],
        arms: [[f * 7, SHOULDER - 3, f * 12, SHOULDER - 7], [-f * 7, SHOULDER - 3, -f * 12, SHOULDER - 7]],
        lean: 0
      };
    },
    jump_swim(f, ph) {
      const a = ph * 3.2, s = Math.sin(a), c = Math.cos(a);
      return {
        legs: [[f * (2 + s * 3), HIP + 5.5, f * (5 + s * 4), HIP + 10],
               [f * (-2 - s * 3), HIP + 5.5, f * (-5 - s * 4), HIP + 10]],
        arms: [[f * (c * 6), SHOULDER - 2 + s * 3, f * (c * 10), SHOULDER - 4 + s * 5],
               [f * (-c * 6), SHOULDER - 2 - s * 3, f * (-c * 10), SHOULDER - 4 - s * 5]],
        lean: f * 0.8
      };
    }
  };

  const IDLE = {
    idle_classic(f, ph) {
      const b = Math.sin(ph * 0.5) * 0.35;
      return {
        legs: [[f * 2.0, HIP + 5.5, f * 3.6, 0], [-f * 2.0, HIP + 5.5, -f * 3.6, 0]],
        arms: [[f * 5.4, SHOULDER + 3.5 + b, f * 6.4, SHOULDER + 8 + b], [-f * 5.4, SHOULDER + 3.5 - b, -f * 6.4, SHOULDER + 8 - b]],
        lean: 0
      };
    },
    idle_bounce(f, ph) {
      const d = (Math.sin(ph * 2.4) * 0.5 + 0.5) * 2.6;
      return {
        legs: [[f * 2.6, HIP + 5.5, f * 3.6, 0], [-f * 2.6, HIP + 5.5, -f * 3.6, 0]],
        arms: [[f * 5.2, SHOULDER + 4, f * 6.2, SHOULDER + 8.5], [-f * 5.2, SHOULDER + 4, -f * 6.2, SHOULDER + 8.5]],
        lean: 0, drop: d
      };
    },
    idle_tap(f, ph) {
      const lift = Math.max(0, Math.sin(ph * 5)) * 2.6;
      return {
        legs: [[f * 2.2, HIP + 5.5, f * 3.6, 0], [-f * 2.2, HIP + 5.5 - lift * 0.5, -f * 3.8, -lift]],
        arms: [[f * 6.5, SHOULDER + 3, f * 4.5, SHOULDER + 6], [-f * 6.5, SHOULDER + 3, -f * 4.5, SHOULDER + 6]],
        lean: 0
      };
    },
    idle_tpose(f) {
      return {
        legs: [[f * 2.2, HIP + 5.5, f * 3.2, 0], [-f * 2.2, HIP + 5.5, -f * 3.2, 0]],
        arms: [[f * 6.5, SHOULDER, f * 13, SHOULDER], [-f * 6.5, SHOULDER, -f * 13, SHOULDER]],
        lean: 0
      };
    },
    idle_dance(f, ph) {
      const s = Math.sin(ph * 2.2), c = Math.cos(ph * 2.2);
      return {
        legs: [[f * (2.4 + s), HIP + 5.5, f * 3.6, 0], [-f * (2.4 - s), HIP + 5.5, -f * 3.6, 0]],
        arms: [[f * (5 + s * 2), SHOULDER + 2 - c * 3, f * (6.5 + s * 3), SHOULDER + 5 - c * 5],
               [-f * (5 - s * 2), SHOULDER + 2 + c * 3, -f * (6.5 - s * 3), SHOULDER + 5 + c * 5]],
        lean: s * 2.2, drop: Math.abs(s) * 1.2
      };
    }
  };

  const styleOf = (table, id, fallback) => table[id] || table[fallback];

  /* pose returns joint offsets relative to the body origin (feet centre) */
  function poseOf(pose, phase, facing, styles) {
    const f = facing;
    const st = styles || {};
    if (pose === 'run') return styleOf(WALK, st.walk, 'walk_classic')(f, phase);
    if (pose === 'idle') return styleOf(IDLE, st.idle, 'idle_classic')(f, phase);
    if (pose === 'jump' || pose === 'fall') {
      return styleOf(JUMP, st.jump, 'jump_classic')(f, phase, pose === 'jump');
    }
    if (pose === 'punch') {
      /* lead arm straight out, back arm cocked, feet planted */
      return {
        legs: [[f * 4, HIP + 5, f * 7.5, 0], [-f * 3.5, HIP + 5.5, -f * 6.5, 0]],
        arms: [[f * 6, SHOULDER + 0.5, f * 11.5, SHOULDER + 0.5], [-f * 3.5, SHOULDER + 2, -f * 1.5, SHOULDER + 5]],
        lean: f * 2.2
      };
    }
    if (pose === 'windup') {
      /* drawn back, about to swing — the tell */
      return {
        legs: [[f * 3, HIP + 5, f * 6, 0], [-f * 3.5, HIP + 5.5, -f * 6.5, 0]],
        arms: [[-f * 4.5, SHOULDER - 2, -f * 7.5, SHOULDER - 4.5], [-f * 2.5, SHOULDER + 3, -f * 0.5, SHOULDER + 6]],
        lean: -f * 1.8
      };
    }
    if (pose === 'kick') {
      return {
        legs: [[f * 6, HIP + 2, f * 12, HIP + 1], [-f * 3, HIP + 6, -f * 4.5, HIP + 10]],
        arms: [[f * 4, SHOULDER - 3, f * 5.5, SHOULDER - 7.5], [-f * 5.5, SHOULDER + 1, -f * 7.5, SHOULDER + 4]],
        lean: f * 1.4
      };
    }
    if (pose === 'trip') {
      /* sprawled forward, hands out to break the fall */
      return {
        legs: [[f * -3.5, HIP + 4, f * -7.5, HIP + 7], [f * -4.5, HIP + 6, f * -8.5, HIP + 10]],
        arms: [[f * 6.5, SHOULDER + 1, f * 10, SHOULDER + 4], [f * 6, SHOULDER + 4, f * 9.5, SHOULDER + 7]],
        lean: f * 2.4
      };
    }
    return IDLE.idle_classic(f, phase);
  }

  /* Faces are drawn in head-local space: origin at the head centre, nominal
     radius 4.4, then scaled to whatever radius the build gives it. */
  function drawFace(ctx, id, colour, r, facing, t) {
    if (id === 'face_blank') return;
    ctx.save();
    const k = r / HEAD_R;
    ctx.scale(k, k);
    ctx.fillStyle = colour;
    ctx.strokeStyle = colour;
    ctx.lineCap = 'round';
    const ex = facing * 1.35, ex2 = -facing * 1.1, ey = -0.7;
    const dot = (x, y, rr) => { ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.284); ctx.fill(); };
    const line = (x1, y1, x2, y2, w) => {
      ctx.lineWidth = w || 0.75;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    switch (id) {
      case 'face_happy':
        dot(ex, ey, 0.62); dot(ex2, ey, 0.62);
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(facing * 0.15, 0.35, 1.85, 0.3, Math.PI - 0.3); ctx.stroke();
        break;
      case 'face_angry':
        dot(ex, ey + 0.15, 0.6); dot(ex2, ey + 0.15, 0.6);
        line(ex + 0.9, ey - 1.9, ex - 0.5, ey - 1.05);
        line(ex2 - 0.9, ey - 1.9, ex2 + 0.5, ey - 1.05);
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(facing * 0.15, 2.6, 1.7, Math.PI + 0.35, -0.35); ctx.stroke();
        break;
      case 'face_surprised':
        dot(ex, ey - 0.2, 0.92); dot(ex2, ey - 0.2, 0.92);
        ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.arc(facing * 0.15, 1.5, 0.95, 0, 6.284); ctx.stroke();
        break;
      case 'face_sleepy':
        line(ex - 0.9, ey, ex + 0.9, ey, 0.7);
        line(ex2 - 0.9, ey, ex2 + 0.9, ey, 0.7);
        line(facing * -0.6, 1.6, facing * 0.9, 1.6, 0.65);
        break;
      case 'face_cool':
        ctx.fillRect(-2.9, ey - 1.0, 5.8, 1.9);
        ctx.lineWidth = 0.6;
        line(-2.9, ey - 0.1, -3.9, ey - 0.5);
        line(2.9, ey - 0.1, 3.9, ey - 0.5);
        ctx.lineWidth = 0.75;
        ctx.beginPath(); ctx.arc(facing * 0.15, 1.3, 1.3, 0.35, Math.PI - 0.35); ctx.stroke();
        break;
      case 'face_robot':
        ctx.fillRect(ex - 0.75, ey - 0.75, 1.5, 1.5);
        ctx.fillRect(ex2 - 0.75, ey - 0.75, 1.5, 1.5);
        ctx.lineWidth = 0.55;
        for (let i = -1; i <= 1; i++) line(-1.5, 1.5 + i * 0.75, 1.5, 1.5 + i * 0.75, 0.45);
        break;
      case 'face_dead':
        ctx.lineWidth = 0.7;
        for (const cx of [ex, ex2]) {
          line(cx - 0.85, ey - 0.85, cx + 0.85, ey + 0.85);
          line(cx + 0.85, ey - 0.85, cx - 0.85, ey + 0.85);
        }
        break;
      default:
        dot(ex, ey, 0.65); dot(ex2, ey, 0.65);
    }
    ctx.restore();
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
    const b = SL.items.buildOf(o.build || (SL.save && SL.save.equipped && SL.save.equipped('build')));
    const colour = o.colour || skinColour(o.skin, t);
    const skin = SL.items.byId[o.skin];
    const fx = skin ? skin.fx : null;
    const eq = (slot) => (SL.save && SL.save.equipped ? SL.save.equipped(slot) : null);
    const styles = o.styles || { walk: o.walk || eq('walk'), jump: o.jump || eq('jump'), idle: o.idle || eq('idle') };
    const p = poseOf(o.pose || 'idle', o.phase || 0, facing, styles);
    const D = p.drop || 0;

    ctx.save();
    if (o.rot) ctx.rotate(o.rot);                 // used when he trips over
    if (o.squash && o.squash !== 1) {
      ctx.scale(2 - o.squash, o.squash);          // volume-ish preserving squash about the feet
    }
    ctx.translate(p.lean * 0.5, 0);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = (o.thin ? 2.3 : 3.0) * b.lw;
    ctx.globalAlpha = (o.alpha == null ? 1 : o.alpha) * (fx === 'ghost' ? 0.62 : 1);

    if (fx === 'glow' || fx === 'rainbow') { ctx.shadowColor = colour; ctx.shadowBlur = 10; }
    if (fx === 'sparkle') { ctx.shadowColor = 'rgba(255,209,102,.85)'; ctx.shadowBlur = 6; }

    /* build reshapes how far the limbs reach out; it never moves the feet or
       the head height, so the 18x30 hitbox stays honest */
    const sx = b.spread, sl = b.legs;
    const HIPD = HIP + D, SHD = SHOULDER + D;
    const L0 = p.legs[0], L1 = p.legs[1], A0 = p.arms[0], A1 = p.arms[1];
    /* legs — the hip drops, the feet stay put, so the knees bend */
    limb(ctx, 0, HIPD, L0[0] * sl, L0[1] + D * 0.55, L0[2] * sl, L0[3]);
    limb(ctx, 0, HIPD, L1[0] * sl, L1[1] + D * 0.55, L1[2] * sl, L1[3]);
    /* torso, with a gut on the heavier builds */
    ctx.beginPath(); ctx.moveTo(0, HIPD); ctx.lineTo(p.lean, SHD); ctx.stroke();
    if (b.belly > 0) {
      /* a big gut sags below the waist and grows taller as it grows wider,
         while the limbs keep whatever weight the build gave them */
      const cy = (HIPD + SHD) / 2 + b.belly * 0.14;
      const ry = (HIP - SHOULDER) / 2 + 0.5 + b.belly * 0.18;
      const lw = ctx.lineWidth;
      ctx.lineWidth = lw * 1.12;
      ctx.beginPath();
      ctx.ellipse(p.lean * 0.5 + facing * b.belly * 0.2, cy, b.belly, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = lw;
    }
    /* arms */
    limb(ctx, p.lean, SHD, A0[0] * sx, A0[1] + D, A0[2] * sx, A0[3] + D);
    limb(ctx, p.lean, SHD, A1[0] * sx, A1[1] + D, A1[2] * sx, A1[3] + D);
    /* head */
    ctx.beginPath();
    ctx.arc(p.lean * 1.4, HEAD_Y + D, HEAD_R * b.head, 0, Math.PI * 2);
    ctx.stroke();
    /* the head is normally an outline. For a silhouette it has to be solid, or
       the marker pen would let you draw a ring round the face but not a face. */
    if (o.mask) ctx.fill();
    if (fx === 'ghost') { ctx.globalAlpha *= 0.35; ctx.fill(); ctx.globalAlpha /= 0.35; }

    /* the face */
    ctx.shadowBlur = 0;
    ctx.save();
    ctx.translate(p.lean * 1.4, HEAD_Y + D);
    drawFace(ctx, o.face || (SL.save && SL.save.equipped ? SL.save.equipped('face') : null),
      colour, HEAD_R * b.head, facing, t);
    ctx.restore();

    ctx.save();
    ctx.translate(p.lean * 1.4, D);
    ctx.scale(b.head, b.head);
    ctx.translate(0, HEAD_Y * (1 / b.head - 1));      // keep the hat on the head
    drawHat(ctx, o.hat, colour, t, facing);
    ctx.restore();

    /* Whatever they drew on themselves, over the top of everything. It rides
       the lean and the crouch so it stays stuck to the body, but it does not
       bend with the limbs — it is drawn on, not painted per-bone. */
    if (o.doodle && SL.doodle) {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.translate(p.lean, D);
      if (facing < 0) ctx.scale(-1, 1);
      SL.doodle.stamp(ctx, o.alpha);
      ctx.restore();
    }

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

  SL.stick = { draw, drawHat, drawFace, logo, skinColour, H, HEAD_Y, HEAD_R };
})(window.SL);
