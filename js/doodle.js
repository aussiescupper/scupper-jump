/* Scupper Jump — the marker pen.

   Whatever you scribble on yourself is kept as strokes in the stickman's own
   local space — the same units SL.stick draws in, feet at the origin — so it
   travels with him into every mode, at every size, without being re-fitted.

   Replaying the strokes on every figure on every frame would be daft, so they
   are baked once into an offscreen canvas and blitted. The bake is thrown away
   whenever the drawing changes, and nowhere else. */
(function (SL) {
  'use strict';

  /* The patch of local space you are allowed to draw on: a box round the
     figure, wide enough for arms flung out and tall enough to clear a hat. */
  const X0 = -16, X1 = 16, Y0 = -34, Y1 = 4;
  const W = X1 - X0, H = Y1 - Y0;
  const PX = 9;                       // bake resolution, pixels per local unit
  const MAX_STROKES = 260;            // localStorage is not infinite
  const MAX_PTS = 220;                // per stroke

  const COLOURS = ['#ff5d6c', '#ffb037', '#ffd166', '#3ddc97', '#57b6ff',
    '#c9a4ff', '#ff8a3d', '#e9eefb', '#0a0e18'];
  const SIZES = [0.7, 1.5, 3.0];

  let baked = null;                   // the offscreen canvas, or null if stale

  const store = () => {
    const d = SL.save.data;
    if (!d.doodle) d.doodle = { strokes: [] };
    if (!Array.isArray(d.doodle.strokes)) d.doodle.strokes = [];
    return d.doodle;
  };
  const strokes = () => store().strokes;
  const has = () => strokes().length > 0;
  const owned = () => SL.save.owns('tool_marker');

  function invalidate() { baked = null; }

  /** Add one stroke: {c, w, p:[x,y,x,y,…]} in local units. */
  function add(colour, width, pts) {
    if (pts.length < 4) {
      /* a tap is a dot, which is a stroke of one point doubled */
      if (pts.length < 2) return;
      pts = [pts[0], pts[1], pts[0] + 0.01, pts[1] + 0.01];
    }
    const s = strokes();
    const trimmed = pts.length > MAX_PTS * 2 ? thin(pts, MAX_PTS) : pts;
    s.push({ c: colour, w: width, p: trimmed.map((v) => Math.round(v * 10) / 10) });
    while (s.length > MAX_STROKES) s.shift();
    invalidate();
    SL.save.flush();
  }

  /** Drop points evenly until the stroke fits, keeping both ends. */
  function thin(pts, want) {
    const n = pts.length / 2;
    const out = [];
    for (let i = 0; i < want; i++) {
      const j = Math.min(n - 1, Math.round(i * (n - 1) / (want - 1)));
      out.push(pts[j * 2], pts[j * 2 + 1]);
    }
    return out;
  }

  function undo() {
    const s = strokes();
    if (!s.length) return false;
    s.pop();
    invalidate();
    SL.save.flush();
    return true;
  }

  function clear() {
    const s = strokes();
    if (!s.length) return false;
    s.length = 0;
    invalidate();
    SL.save.flush();
    return true;
  }

  /** Paint the strokes into a context already in local units. */
  function paint(ctx, list) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of list) {
      const p = s.p;
      if (!p || p.length < 4) continue;
      ctx.strokeStyle = s.c;
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      ctx.stroke();
    }
  }

  /** The baked canvas, or null when there is nothing drawn. */
  function canvas() {
    if (!has()) return null;
    if (baked) return baked;
    const c = document.createElement('canvas');
    c.width = W * PX; c.height = H * PX;
    const x = c.getContext('2d');
    x.setTransform(PX, 0, 0, PX, -X0 * PX, -Y0 * PX);
    paint(x, strokes());
    baked = c;
    return baked;
  }

  /** Blit onto a figure. The caller is already in the figure's local units. */
  function stamp(ctx, alpha) {
    const c = canvas();
    if (!c) return;
    if (alpha != null && alpha !== 1) {
      ctx.save(); ctx.globalAlpha *= alpha;
      ctx.drawImage(c, X0, Y0, W, H);
      ctx.restore();
      return;
    }
    ctx.drawImage(c, X0, Y0, W, H);
  }

  SL.doodle = {
    add, undo, clear, canvas, stamp, paint, has, owned, invalidate,
    strokes, COLOURS, SIZES, X0, X1, Y0, Y1, W, H
  };
})(window.SL);
