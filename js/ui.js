/* Scupper Jump — DOM screens, shop, level select, HUD plumbing */
(function (SL) {
  'use strict';
  const { el, fmtTime, fmtNum } = SL.util;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));

  const stack = [];
  const clampPct = (v) => (Math.max(0, Math.min(1, v)) * 100).toFixed(1);
  let current = 'title';
  let shopTab = 'upgrade';
  let settingsTab = 'game';

  /* ---------------- screens ---------------- */
  function show(name, push) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    if (push && current && current !== name) stack.push(current);
    current = name;
    document.getElementById('hud').hidden = true;
    document.getElementById('touch').hidden = true;
    if (name === 'title') { stack.length = 0; refreshTitle(); }
    if (name === 'levels') renderLevels();
    if (name === 'shop') renderShop();
    if (name === 'settings') renderSettings();
    if (name === 'draw') { if (!drawState.ready) bindPad(); paintPad(); }
    walletAll();
  }

  function hideScreens(showHud) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    current = null;
    document.getElementById('btn-ragdoll').hidden = false;
    if (!showHud) document.getElementById('retry').hidden = true;
    document.getElementById('hud').hidden = !showHud;
    document.getElementById('touch').hidden = !(showHud && touchWanted());
  }

  function back() {
    SL.audio.play('back');
    const prev = stack.pop() || 'title';
    show(prev, false);
  }

  let touchSeen = false;
  function touchWanted() {
    return SL.save.setting('forceTouch') || touchSeen ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }
  function noteTouch() { touchSeen = true; }

  /* ---------------- wallet ---------------- */
  function walletMarkup(node) {
    node.innerHTML = '';
    const dot = el('span', 'coin-dot');
    node.appendChild(dot);
    node.appendChild(el('b', null, fmtNum(SL.save.credits())));
    node.appendChild(el('span', 'lbl', 'Stick Credits'));
  }
  function walletAll() {
    ['#wallet-title', '#wallet-levels', '#wallet-shop'].forEach(sel => {
      const n = $(sel); if (n) walletMarkup(n);
    });
  }

  /* ---------------- title ---------------- */
  function refreshTitle() {
    const v = $('#title-version');
    if (v) v.textContent = SL.VERSION || '';
    const next = SL.save.data.unlocked;
    $('#btn-play-label').textContent = next > 1 ? ('Continue · Level ' + next) : 'Play';
    const best = SL.save.endlessBest();
    $('#btn-endless-best').textContent = best ? '· best ' + fmtNum(best) + 'm' : '';
    const wb = SL.save.arenaBest();
    $('#btn-arena-best').textContent = wb ? '· best wave ' + fmtNum(wb) : '';
    const ob = SL.save.opsBest();
    $('#btn-ops-best').textContent = ob ? '· best wave ' + fmtNum(ob) : '';
  }

  /* ---------------- level select ---------------- */
  function renderLevels() {
    const grid = $('#level-grid');
    grid.innerHTML = '';
    const unlocked = SL.save.data.unlocked;
    const count = Math.max(24, unlocked + 8);
    for (let n = 1; n <= count; n++) {
      const rec = SL.save.levelRecord(n);
      const b = el('button', 'lvl');
      if (rec) b.classList.add('done');
      if (n === unlocked) b.classList.add('next');
      if (n > unlocked) b.classList.add('locked');
      const th = SL.level.themeFor(n);
      const dot = el('i', 'theme'); dot.style.background = th.accent; b.appendChild(dot);
      b.appendChild(el('span', 'n', String(n)));
      const st = el('span', 'st');
      for (let i = 1; i <= 3; i++) {
        const s = document.createElement(rec && rec.s >= i ? 'b' : 'span');
        s.textContent = '★';
        st.appendChild(s);
      }
      b.appendChild(st);
      b.appendChild(el('span', 'tm', rec ? fmtTime(rec.t) : th.name.split(' ')[0]));
      b.title = 'Level ' + n + ' — ' + th.name;
      b.addEventListener('click', () => { SL.audio.play('ui'); playLevel(n); });
      grid.appendChild(b);
    }
  }

  /* ---------------- the prop tray ----------------
     Tap an entry and it drops into the room. The tray stays open so you can
     stack a few up before you start throwing. */
  function buildPropTray() {
    const list = $('#prop-list');
    list.innerHTML = '';
    for (const k of SL.props.CATALOGUE) {
      const row = document.createElement('button');
      row.className = 'prop-row';
      row.type = 'button';
      if (k.fixed) row.dataset.fixed = '1';
      row.innerHTML = '<span class="em"></span><span class="tx"><b></b><i></i></span>';
      row.querySelector('.em').textContent = k.icon;
      row.querySelector('b').textContent = k.name;
      row.querySelector('i').textContent = k.blurb;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        SL.audio.unlock();
        SL.lab.spawnProp(SL.game.S, k.id);
      });
      list.appendChild(row);
    }
  }

  function toggleTray(want) {
    const tray = $('#prop-tray');
    const on = want == null ? tray.hidden : want;
    tray.hidden = !on;
    $('#btn-lab-props').dataset.on = on ? '1' : '0';
    SL.audio.play(on ? 'ui' : 'back');
  }

  /* ---------------- shop ---------------- */
  function preview(skinId, hatId, buildId, opts) {
    opts = opts || {};
    const faceId = opts.face || SL.save.equipped('face');
    const c = document.createElement('canvas');
    const size = opts.big ? 88 : 56, dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr; c.height = size * dpr;
    const x = c.getContext('2d');
    const paint = (phase) => {
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, size, size);
      x.save();
      if (opts.zoomHead) {
        /* A face is four pixels across on a whole-body preview, and zooming the
           whole figure just fills the card with shoulders. Draw the head on its
           own — a portrait, not a shrunken man. */
        const col = SL.stick.skinColour(skinId, 0.6);
        const r = SL.stick.HEAD_R * SL.items.buildOf(buildId).head;
        const z = (size - 14) / (r * 2);
        x.translate(size / 2, size / 2);
        x.scale(z, z);
        /* In game the head is an outline and the face is drawn in the skin
           colour on the dark showing through it. Paint that dark in, or the
           face is skin-on-skin and disappears. */
        x.fillStyle = '#0e1421';
        x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fill();
        x.strokeStyle = col;
        x.lineWidth = 1.5;
        x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke();
        SL.stick.drawFace(x, faceId, col, r, 1, 0.6);
      } else if (opts.big) {
        x.translate(size / 2, size - 8);
        x.scale(1.5, 1.5);
      } else {
        x.translate(size / 2, size - 6);
        x.scale(1.16, 1.16);
        SL.stick.draw(x, { skin: skinId, hat: hatId, build: buildId, face: faceId,
          doodle: opts.doodle !== false, styles: opts.styles, pose: opts.pose || 'idle',
          phase, facing: 1, t: 0.6 });
      }
      x.restore();
    };
    if (opts.animate) {
      /* the card plays the motion it is selling */
      let ph = 0;
      const tick = () => {
        if (!c.isConnected) return;             // card gone: stop
        ph += 0.11;
        paint(ph);
        requestAnimationFrame(tick);
      };
      paint(0);
      requestAnimationFrame(tick);
    } else {
      paint(1.2);
    }
    return c;
  }

  function renderShop() {
    const grid = $('#shop-grid');
    grid.innerHTML = '';
    $$('#shop-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === shopTab));
    const items = SL.items.list(shopTab);
    const credits = SL.save.credits();

    if (shopTab === 'draw' && SL.doodle.owned()) { renderDrawPanel(grid); return; }

    let lastGroup = null;
    for (const it of items) {
      if (it.group && it.group !== lastGroup) {
        lastGroup = it.group;
        grid.appendChild(el('h3', 'shop-group', it.group));
      }
      const card = el('div', 'card');
      const art = el('div', 'card-art');

      if (it.type === 'skin') art.appendChild(preview(it.id, SL.save.equipped('hat'), SL.save.equipped('build')));
      else if (it.type === 'hat') art.appendChild(preview(SL.save.equipped('skin'), it.id, SL.save.equipped('build')));
      else if (it.type === 'build') art.appendChild(preview(SL.save.equipped('skin'), SL.save.equipped('hat'), it.id));
      else if (it.type === 'face') art.appendChild(preview(SL.save.equipped('skin'), 'hat_none', SL.save.equipped('build'), { face: it.id, zoomHead: true }));
      else if (it.type === 'walk' || it.type === 'jump' || it.type === 'idle') {
        const styles = { walk: SL.save.equipped('walk'), jump: SL.save.equipped('jump'), idle: SL.save.equipped('idle') };
        styles[it.type] = it.id;
        art.appendChild(preview(SL.save.equipped('skin'), SL.save.equipped('hat'), SL.save.equipped('build'),
          { styles, pose: it.type === 'walk' ? 'run' : it.type === 'jump' ? 'jump' : 'idle', animate: true }));
      }
      else art.textContent = it.glyph;
      card.appendChild(art);

      const body = el('div', 'card-body');
      const name = el('div', 'card-name');
      name.appendChild(el('span', null, it.name));
      if (it.type === 'upgrade') {
        const tier = SL.save.tier(it.id);
        const pips = el('span', 'pips');
        for (let i = 0; i < it.prices.length; i++) pips.appendChild(el('i', 'pip' + (i < tier ? ' on' : '')));
        name.appendChild(pips);
      }
      body.appendChild(name);

      let desc = it.desc;
      if (it.type === 'upgrade') {
        const tier = SL.save.tier(it.id);
        desc = tier >= it.prices.length
          ? 'Maxed — ' + it.tierDesc[it.prices.length - 1].replace(/^./, c => c.toLowerCase())
          : (tier > 0 ? 'Next: ' + it.tierDesc[tier] : it.desc);
      }
      body.appendChild(el('div', 'card-desc', desc));
      card.appendChild(body);

      const act = el('div', 'card-act');
      const btn = el('button', 'buy');

      if (it.type === 'upgrade') {
        const tier = SL.save.tier(it.id);
        if (tier >= it.prices.length) { btn.textContent = 'MAX'; btn.classList.add('max'); btn.disabled = true; card.classList.add('maxed'); }
        else {
          const price = it.prices[tier];
          btn.textContent = fmtNum(price);
          if (price > credits) btn.classList.add('poor');
          btn.addEventListener('click', () => buyUpgrade(it));
        }
      } else if (it.type === 'tool') {
        if (SL.save.owns(it.id)) {
          btn.textContent = 'Open';
          btn.classList.add('equip');
          btn.addEventListener('click', () => { SL.audio.play('ui'); show('draw'); });
        } else {
          btn.textContent = fmtNum(it.price);
          if (it.price > credits) btn.classList.add('poor');
          btn.addEventListener('click', () => buyTool(it));
        }
      } else {
        const owned = SL.save.owns(it.id) || it.price === 0;
        const slot = it.type;    // 'skin' | 'hat' | 'build'
        const equipped = SL.save.equipped(slot) === it.id;
        if (equipped) { btn.textContent = 'Worn'; btn.classList.add('on'); btn.disabled = true; card.classList.add('equipped'); }
        else if (owned) { btn.textContent = 'Wear'; btn.classList.add('equip'); btn.addEventListener('click', () => equip(slot, it.id)); }
        else {
          btn.textContent = fmtNum(it.price);
          if (it.price > credits) btn.classList.add('poor');
          btn.addEventListener('click', () => buyCosmetic(it));
        }
      }
      act.appendChild(btn);
      card.appendChild(act);
      grid.appendChild(card);
    }
  }

  /* Owning the pen turns the tab into a page about your drawing rather than a
     row of things to buy. */
  function renderDrawPanel(grid) {
    const panel = el('div', 'draw-panel');
    const art = el('div', 'draw-panel-art');
    art.appendChild(preview(SL.save.equipped('skin'), SL.save.equipped('hat'),
      SL.save.equipped('build'), { big: true }));
    panel.appendChild(art);

    const body = el('div', 'draw-panel-body');
    body.appendChild(el('h3', 'shop-group', 'Marker Pen'));
    const n = SL.doodle.strokes().length;
    body.appendChild(el('div', 'card-desc', n
      ? n + (n === 1 ? ' stroke' : ' strokes') + ' on you. It shows in every mode.'
      : 'Nothing on you yet. Open the pad and scribble.'));
    const row = el('div', 'menu-row');
    const open = el('button', 'btn btn-primary', '🖊️ Open the pad');
    open.addEventListener('click', () => { SL.audio.play('ui'); show('draw'); });
    row.appendChild(open);
    const wipe = el('button', 'btn btn-ghost', 'Clear all');
    wipe.disabled = !n;
    wipe.addEventListener('click', () => {
      if (SL.doodle.clear()) { SL.audio.play('back'); renderShop(); }
    });
    row.appendChild(wipe);
    body.appendChild(row);
    panel.appendChild(body);
    grid.appendChild(panel);
  }

  /* ---------------- the sketchpad ----------------
     The canvas is the figure's own local space blown up to fill the stage, so a
     stroke drawn here is stored in exactly the units SL.stick draws in and needs
     no re-fitting when it turns up on a 20px-tall figure in the Fight Pit. */
  const drawState = { colour: null, size: null, pts: null, scale: 1, ready: false };

  function drawUnits(e, cv) {
    const r = cv.getBoundingClientRect();
    const D = SL.doodle;
    return {
      x: D.X0 + (e.clientX - r.left) / r.width * D.W,
      y: D.Y0 + (e.clientY - r.top) / r.height * D.H
    };
  }

  function paintPad() {
    const cv = $('#draw-canvas');
    const D = SL.doodle;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = cv.clientWidth || 280;
    const cssH = cssW * (D.H / D.W);
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.height = cssH + 'px';
    const x = cv.getContext('2d');
    const k = cssW / D.W * dpr;
    x.setTransform(k, 0, 0, k, -D.X0 * k, -D.Y0 * k);
    x.clearRect(D.X0, D.Y0, D.W, D.H);

    /* the figure you are drawing on, and a faint floor so he is standing */
    x.strokeStyle = 'rgba(233,238,251,.14)';
    x.lineWidth = 0.4;
    x.beginPath(); x.moveTo(D.X0, 0.6); x.lineTo(D.X1, 0.6); x.stroke();
    SL.stick.draw(x, {
      skin: SL.save.equipped('skin'), hat: SL.save.equipped('hat'),
      build: SL.save.equipped('build'), face: SL.save.equipped('face'),
      pose: 'idle', phase: 1.1, facing: 1, t: 0.6
    });
    SL.doodle.paint(x, SL.doodle.strokes());
    if (drawState.pts && drawState.pts.length >= 4) {
      SL.doodle.paint(x, [{ c: drawState.colour, w: drawState.size, p: drawState.pts }]);
    }
    $('#draw-hint').hidden = SL.doodle.has() || !!drawState.pts;
  }

  function bindPad() {
    const D = SL.doodle;
    drawState.colour = D.COLOURS[0];
    drawState.size = D.SIZES[1];

    const pal = $('#draw-palette');
    pal.innerHTML = '';
    D.COLOURS.forEach((c) => {
      const b = el('button', 'swatch');
      b.style.background = c;
      b.dataset.c = c;
      b.addEventListener('click', () => {
        drawState.colour = c;
        $$('#draw-palette .swatch').forEach(o => o.classList.toggle('on', o.dataset.c === c));
        SL.audio.play('ui');
      });
      pal.appendChild(b);
    });
    pal.firstChild.classList.add('on');

    const sizes = $('#draw-sizes');
    sizes.innerHTML = '';
    D.SIZES.forEach((w, i) => {
      const b = el('button', 'nib' + (i === 1 ? ' on' : ''));
      const dot = el('i');
      dot.style.width = dot.style.height = (5 + i * 5) + 'px';
      b.appendChild(dot);
      b.addEventListener('click', () => {
        drawState.size = w;
        $$('#draw-sizes .nib').forEach((o, j) => o.classList.toggle('on', j === i));
        SL.audio.play('ui');
      });
      sizes.appendChild(b);
    });

    const cv = $('#draw-canvas');
    let id = null;
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      id = e.pointerId;
      try { cv.setPointerCapture(id); } catch (err) { /* ignore */ }
      const p = drawUnits(e, cv);
      drawState.pts = [p.x, p.y];
      paintPad();
    });
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id || !drawState.pts) return;
      e.preventDefault();
      const p = drawUnits(e, cv);
      const n = drawState.pts.length;
      /* skip points that have barely moved, or a slow drag eats the budget */
      if (Math.hypot(p.x - drawState.pts[n - 2], p.y - drawState.pts[n - 1]) < 0.25) return;
      drawState.pts.push(p.x, p.y);
      paintPad();
    });
    const finish = (e) => {
      if (e.pointerId !== id || !drawState.pts) return;
      id = null;
      SL.doodle.add(drawState.colour, drawState.size, drawState.pts);
      drawState.pts = null;
      SL.audio.play('ui');
      paintPad();
    };
    cv.addEventListener('pointerup', finish);
    cv.addEventListener('pointercancel', finish);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    $('#btn-draw-undo').addEventListener('click', () => {
      if (SL.doodle.undo()) { SL.audio.play('back'); paintPad(); }
    });
    $('#btn-draw-clear').addEventListener('click', () => {
      if (SL.doodle.clear()) { SL.audio.play('back'); paintPad(); }
    });
    $('#btn-draw-done').addEventListener('click', () => { SL.audio.play('ui'); back(); });
    drawState.ready = true;
  }

  function buyUpgrade(it) {
    const tier = SL.save.tier(it.id);
    const price = it.prices[tier];
    if (!SL.save.spend(price)) { SL.audio.play('nope'); flashWallet(); return; }
    SL.save.setTier(it.id, tier + 1);
    SL.audio.play('buy');
    SL.game.refreshMods();
    renderShop(); walletAll();
  }
  function buyCosmetic(it) {
    if (!SL.save.spend(it.price)) { SL.audio.play('nope'); flashWallet(); return; }
    SL.save.grant(it.id);
    SL.save.equip(it.type, it.id);
    SL.audio.play('buy');
    renderShop(); walletAll();
  }
  /* A tool has no slot to go in — buying it just unlocks what the tab does. */
  function buyTool(it) {
    if (!SL.save.spend(it.price)) { SL.audio.play('nope'); flashWallet(); return; }
    SL.save.grant(it.id);
    SL.audio.play('buy');
    renderShop(); walletAll();
  }
  function equip(slot, id) {
    SL.save.equip(slot, id);
    SL.audio.play('ui');
    renderShop();
  }
  function flashWallet() {
    const w = $('#wallet-shop') || $('#btn-skip');
    if (!w) return;
    w.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
      { duration: 260 }
    );
  }

  /* ---------------- settings ---------------- */
  function setTab(name) {
    settingsTab = name;
    $$('#settings-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.stab === name));
    $$('.stab').forEach(p => { p.hidden = p.dataset.stab !== name; });
  }

  function renderSettings() {
    const map = { 'set-sfx': 'sfx', 'set-haptic': 'haptic', 'set-gore': 'gore', 'set-blood': 'blood', 'set-lowfx': 'lowfx', 'set-touch': 'forceTouch' };
    Object.keys(map).forEach(id => {
      const n = document.getElementById(id);
      if (n) n.checked = !!SL.save.setting(map[id]);
    });
    setTab(settingsTab);
    $('#set-version').textContent = SL.VERSION || '1.0.0';
    refreshAudioState();
  }

  function refreshAudioState() {
    const n = $('#audio-state');
    if (!n) return;
    const a = SL.audio.state();
    n.textContent = !a.supported ? 'not supported by this browser'
      : a.ctx === 'running' ? 'on · ' + Math.round(a.sampleRate / 1000) + 'kHz'
      : a.ctx === 'suspended' && a.started ? 'idle — speaker released'
      : a.started ? 'starting (' + a.ctx + ') — tap Test'
      : 'not started yet — tap Test';
  }

  /* ---------------- HUD ---------------- */
  function paintRagdollBtn(limp) {
    const btn = document.getElementById('btn-ragdoll');
    btn.classList.toggle('on', !!limp);
    btn.setAttribute('aria-label', limp ? 'Get up (R)' : 'Go limp (R)');
    const c = btn.querySelector('canvas');
    const size = 38, dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr; c.height = size * dpr;
    const x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, size, size);
    x.save();
    /* standing when he can flop, flat on his back once he has */
    if (limp) {
      x.translate(size * 0.86, size * 0.68);
      x.rotate(-Math.PI / 2);
      x.scale(0.82, 0.82);
    } else {
      x.translate(size / 2, size - 3);
      x.scale(0.95, 0.95);
    }
    SL.stick.draw(x, {
      skin: SL.save.equipped('skin'), hat: null,
      pose: limp ? 'fall' : 'idle', phase: 1.1, facing: 1, t: 0.4,
      colour: limp ? '#ffb037' : 'rgba(233,238,251,.9)'
    });
    x.restore();
  }

  function bindHud() {
    SL.game.on('hud', (h) => {
      const lvl = $('#hud-level');
      const txt = h.lab ? 'Smash Lab' : h.arena ? 'Fight Pit' : h.fps ? 'Stick Ops'
        : (h.endless ? 'Endless · ' + h.themeName : 'Lvl ' + h.n + ' · ' + h.themeName);
      if (lvl.textContent !== txt) lvl.textContent = txt;
      $('#hud-coin-n').textContent = h.coins;
      $('#hud-coin-t').textContent = h.coinTotal;
      $('#hud-death-n').textContent = h.deaths;
      $('#hud-height-n').textContent = fmtNum(h.height);
      $('#hud-height').hidden = !h.endless;
      $('#hud-lab-n').textContent = fmtNum(h.labEarned);
      $('#hud-lab').hidden = !h.lab;
      $('#hud-deaths').hidden = !!h.endless || !!h.lab || !!h.arena || !!h.fps;
      $('#hud-coins').hidden = !!h.lab || !!h.arena || !!h.fps;
      /* nothing to drive in the lab — get the controls out of the way */
      $('#btn-ragdoll').hidden = !!h.lab;
      $('.climb-rail').hidden = !!h.lab;
      $('#lab-controls').hidden = !h.lab;
      if (!h.lab && !$('#prop-tray').hidden) toggleTray(false);
      if (h.lab) document.getElementById('touch').hidden = true;
      /* fight pit: health bar, wave, purse, and a fist instead of go-limp */
      $('#hud-wave-n').textContent = h.fps ? h.opsWave : h.wave;
      $('#hud-wave').hidden = !(h.arena || h.fps);
      $('#hud-cash-n').textContent = fmtNum(h.fps ? h.opsEarned : h.arenaEarned);
      $('#hud-cash').hidden = !(h.arena || h.fps);
      $('#hp-bar').hidden = !(h.arena || h.fps);
      /* first person: no climb rail, no ragdoll, its own fire controls */
      $('#ops-controls').hidden = !(h.fps && touchWanted());
      if (h.fps) {
        const frac = clampPct(h.hp / Math.max(1, h.hpMax));
        $('#hp-fill').style.width = frac + '%';
        $('#hp-fill').classList.toggle('low', h.hp / Math.max(1, h.hpMax) < 0.35);
        $('#btn-ragdoll').hidden = true;
        $('.climb-rail').hidden = true;
        document.getElementById('touch').hidden = true;
        const gn = $('#ops-gun-name');
        const label = h.opsAmmo || '';
        if (gn.textContent !== label) gn.textContent = label;
      }
      if (h.arena) {
        const frac = clampPct(h.hp / Math.max(1, h.hpMax));
        $('#hp-fill').style.width = frac + '%';
        $('#hp-fill').classList.toggle('low', h.hp / Math.max(1, h.hpMax) < 0.35);
        $('#btn-ragdoll').hidden = true;
        $('.climb-rail').hidden = true;
      }
      $('#btn-attack').hidden = !(touchWanted() && !h.lab && !h.fps);
      $('#hud-coin-sep').hidden = !!h.endless;
      $('#hud-coin-t').hidden = !!h.endless;
      $('#climb-fill').style.height = (h.progress * 100).toFixed(1) + '%';
      $('#climb-fill').classList.toggle('danger', !!h.endless);
    });
    SL.game.on('toast', (msg) => {
      const layer = $('#toast-layer');
      const t = el('div', 'toast', msg);
      layer.appendChild(t);
      setTimeout(() => t.remove(), 1150);
    });
    SL.game.on('complete', showComplete);
    SL.game.on('retry', showRetry);
    SL.game.on('limp', paintRagdollBtn);
    SL.game.on('endless', showEndless);
    SL.game.on('arena', showArena);
    SL.game.on('ops', showOps);
    paintRagdollBtn(false);
  }

  /* ---------------- death prompt ---------------- */
  const TITLES = { fell: 'Gone.', spike: 'Skewered.', saw: 'Minced.' };
  /* what got cut, by how far up the body the blade went through */
  function whereLine(where) {
    if (where == null) return 'Straight past the bottom.';
    if (where > 0.68) return 'Straight through the neck.';   // head-chest bone
    if (where > 0.53) return 'Cut across the chest.';        // chest-hip + both arms
    if (where > 0.36) return 'Cut clean in half.';           // chest-hip only
    if (where > 0.18) return 'Legs off at the hip.';         // hip-knee bones
    return 'Took his feet clean off.';                       // knee-foot bones
  }
  function showRetry(info) {
    const box = document.getElementById('retry');
    if (!info) { box.hidden = true; return; }
    document.getElementById('retry-title').textContent = TITLES[info.cause] || 'Splat.';
    document.getElementById('retry-sub').textContent =
      whereLine(info.where) +
      (touchWanted() ? ' Tap anywhere to try again.' : ' Click or press a key to try again.');
    box.hidden = false;
  }

  /* ---------------- knocked out ---------------- */
  function showArena(res) {
    $('#pit-title').textContent = res.isBest ? 'New best!' : 'Knocked out';
    $('#pit-crown').textContent = res.isBest ? '★' : '✊';
    $('#pit-wave').textContent = fmtNum(res.wave);
    const tally = $('#pit-tally');
    tally.innerHTML = '';
    const row = (k, v, plus) => {
      const d = el('div', plus ? 'plus' : null);
      d.appendChild(el('span', null, k));
      d.appendChild(el('b', null, v));
      tally.appendChild(d);
    };
    row('Best wave', fmtNum(res.best));
    row('Knocked out', fmtNum(res.kills));
    $('#pit-total').textContent = '+' + fmtNum(res.earned);
    $$('.screen').forEach(sc => sc.classList.toggle('active', sc.id === 'screen-arena'));
    current = 'arena';
    document.getElementById('touch').hidden = true;
    document.getElementById('hud').hidden = true;
    walletAll();
  }

  /* ---------------- Stick Ops run over ---------------- */
  function showOps(res) {
    if (!res) return;
    $('#ops-title').textContent = res.isBest ? 'Best run yet!' : 'You went down';
    $('#ops-crown').textContent = res.isBest ? '★' : '🎯';
    $('#ops-wave').textContent = fmtNum(res.wave);
    const tally = $('#ops-tally');
    tally.innerHTML = '';
    const row = (k, v) => {
      const d = el('div');
      d.appendChild(el('span', null, k));
      d.appendChild(el('b', null, v));
      tally.appendChild(d);
    };
    row('Best run', fmtNum(res.best));
    row('Dropped', fmtNum(res.kills));
    $('#ops-total').textContent = '+' + fmtNum(res.earned);
    $$('.screen').forEach(sc => sc.classList.toggle('active', sc.id === 'screen-ops'));
    current = 'ops';
    document.getElementById('touch').hidden = true;
    document.getElementById('hud').hidden = true;
    walletAll();
  }

  /* ---------------- endless run over ---------------- */
  function showEndless(res) {
    $('#end-title').textContent = res.isBest ? 'New best climb!' : 'Run over';
    $('#end-crown').textContent = res.isBest ? '★' : '♾';
    $('#end-h').textContent = fmtNum(res.height);
    const tally = $('#end-tally');
    tally.innerHTML = '';
    const row = (k, v, plus) => {
      const d = el('div', plus ? 'plus' : null);
      d.appendChild(el('span', null, k));
      d.appendChild(el('b', null, v));
      tally.appendChild(d);
    };
    row('Best climb', fmtNum(res.best) + ' m');
    row('Time', fmtTime(res.elapsed));
    if (res.climbCredits > 0) row('Height', '+' + fmtNum(res.climbCredits), true);
    if (res.coinValue > 0) row('Coins ' + res.coins, '+' + fmtNum(res.coinValue), true);
    if (res.mult > 1) row('Lucky Charm', '×' + res.mult.toFixed(2));
    $('#end-total').textContent = '+' + fmtNum(res.total);
    $$('.screen').forEach(sc => sc.classList.toggle('active', sc.id === 'screen-endless'));
    current = 'endless';
    document.getElementById('touch').hidden = true;
    document.getElementById('hud').hidden = true;
    walletAll();
  }

  /* ---------------- complete ---------------- */
  function showComplete(res) {
    const stars = $$('#cmp-stars span');
    stars.forEach((s, i) => s.classList.remove('on'));
    setTimeout(() => {
      stars.forEach((s, i) => setTimeout(() => {
        if (i < res.stars) { s.classList.add('on'); SL.audio.play('star'); }
      }, 220 + i * 260));
    }, 200);

    $('#cmp-title').textContent = 'Level ' + res.n + ' cleared';
    const tally = $('#cmp-tally');
    tally.innerHTML = '';
    for (const row of res.rows) {
      const d = el('div', 'plus');
      d.appendChild(el('span', null, row.k));
      d.appendChild(el('b', null, '+' + fmtNum(row.v)));
      tally.appendChild(d);
    }
    if (res.luckyMul > 1) {
      const d = el('div');
      d.appendChild(el('span', null, 'Lucky Charm'));
      d.appendChild(el('b', null, '×' + res.luckyMul.toFixed(2)));
      tally.appendChild(d);
    }
    if (res.replayMul < 1) {
      const d = el('div');
      d.appendChild(el('span', null, 'Already cleared'));
      d.appendChild(el('b', null, '×' + res.replayMul.toFixed(2)));
      tally.appendChild(d);
    }
    $('#cmp-total').textContent = '+' + fmtNum(res.total);

    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-complete'));
    current = 'complete';
    document.getElementById('touch').hidden = true;
    walletAll();
  }

  /* ---------------- actions ---------------- */
  function playLevel(n) {
    hideScreens(true);
    SL.game.start(n);
  }

  function playEndless() {
    hideScreens(true);
    SL.game.startEndless();
  }

  function playLab() {
    hideScreens(true);
    SL.game.startLab();
  }

  function playArena() {
    hideScreens(true);
    SL.game.startArena();
  }

  function playOps() {
    hideScreens(true);
    SL.game.startFps();
  }

  function bind() {
    $('#btn-play').addEventListener('click', () => { SL.audio.play('ui'); playLevel(SL.save.data.unlocked); });
    $('#btn-endless').addEventListener('click', () => { SL.audio.play('ui'); playEndless(); });
    $('#btn-lab').addEventListener('click', () => { SL.audio.play('ui'); playLab(); });
    $('#btn-arena').addEventListener('click', () => { SL.audio.play('ui'); playArena(); });
    $('#btn-ops').addEventListener('click', () => { SL.audio.play('ui'); playOps(); });
    $('#btn-ops-again').addEventListener('click', () => { SL.audio.play('ui'); playOps(); });
    $('#btn-ops-shop').addEventListener('click', () => { SL.audio.play('ui'); stack.length = 0; stack.push('title'); show('shop', false); });
    $('#btn-ops-menu').addEventListener('click', () => { SL.audio.play('back'); SL.game.showcase(SL.save.data.unlocked); show('title', false); });
    $('#btn-ops-gun').addEventListener('click', (e) => { e.stopPropagation(); SL.audio.unlock(); SL.fps.cycleGun(1); });
    $('#btn-pit-again').addEventListener('click', () => { SL.audio.play('ui'); playArena(); });
    $('#btn-pit-shop').addEventListener('click', () => { SL.audio.play('ui'); stack.length = 0; stack.push('title'); show('shop', false); });
    $('#btn-pit-menu').addEventListener('click', () => { SL.audio.play('back'); SL.game.showcase(SL.save.data.unlocked); show('title', false); });
    $('#btn-lab-spawn').addEventListener('click', (e) => { e.stopPropagation(); SL.audio.unlock(); SL.lab.addOne(SL.game.S); });
    $('#btn-lab-clear').addEventListener('click', (e) => { e.stopPropagation(); SL.audio.unlock(); SL.lab.clearRoom(SL.game.S); });
    buildPropTray();
    $('#btn-lab-props').addEventListener('click', (e) => { e.stopPropagation(); SL.audio.unlock(); toggleTray(); });
    $('#btn-props-close').addEventListener('click', (e) => { e.stopPropagation(); toggleTray(false); });
    $('#btn-props-clear').addEventListener('click', (e) => {
      e.stopPropagation(); SL.audio.unlock(); SL.lab.clearProps(SL.game.S);
    });
    $('#btn-levels').addEventListener('click', () => { SL.audio.play('ui'); show('levels', true); });
    $('#btn-shop').addEventListener('click', () => { SL.audio.play('ui'); show('shop', true); });
    $('#btn-settings').addEventListener('click', () => { SL.audio.play('ui'); show('settings', true); });
    $('#btn-howto').addEventListener('click', () => { SL.audio.play('ui'); show('howto', true); });
    $$('[data-back]').forEach(b => b.addEventListener('click', back));

    $$('#shop-tabs .tab').forEach(t => t.addEventListener('click', () => {
      shopTab = t.dataset.tab; SL.audio.play('ui'); renderShop();
    }));
    $$('#settings-tabs .tab').forEach(t => t.addEventListener('click', () => {
      SL.audio.play('ui'); setTab(t.dataset.stab);
    }));
    document.getElementById('btn-ragdoll').addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      SL.audio.unlock();
      SL.game.toggleLimp();
    });

    $('#btn-pause').addEventListener('click', () => pauseGame());
    $('#btn-resume').addEventListener('click', () => { SL.audio.play('ui'); hideScreens(true); SL.game.resume(); });
    $('#btn-restart').addEventListener('click', () => { SL.audio.play('ui'); hideScreens(true); SL.game.restart(); });
    $('#btn-skip').addEventListener('click', () => {
      const n = SL.game.S.level.n;
      if (SL.save.credits() < SL.game.skipPrice(n)) { SL.audio.play('nope'); flashWallet(); return; }
      hideScreens(true);
      SL.game.skipLevel();
    });
    $('#btn-quit').addEventListener('click', () => { SL.audio.play('back'); SL.game.showcase(SL.save.data.unlocked); show('title', false); });

    $('#btn-next').addEventListener('click', () => { SL.audio.play('ui'); hideScreens(true); SL.game.nextLevel(); });
    $('#btn-replay').addEventListener('click', () => { SL.audio.play('ui'); hideScreens(true); SL.game.restart(); });
    $('#btn-cmp-shop').addEventListener('click', () => { SL.audio.play('ui'); stack.length = 0; stack.push('title'); show('shop', false); });
    $('#btn-cmp-menu').addEventListener('click', () => { SL.audio.play('back'); SL.game.showcase(SL.save.data.unlocked); show('title', false); });

    $('#btn-end-again').addEventListener('click', () => { SL.audio.play('ui'); playEndless(); });
    $('#btn-end-shop').addEventListener('click', () => { SL.audio.play('ui'); stack.length = 0; stack.push('title'); show('shop', false); });
    $('#btn-end-menu').addEventListener('click', () => { SL.audio.play('back'); SL.game.showcase(SL.save.data.unlocked); show('title', false); });

    const map = { 'set-sfx': 'sfx', 'set-haptic': 'haptic', 'set-gore': 'gore', 'set-blood': 'blood', 'set-lowfx': 'lowfx', 'set-touch': 'forceTouch' };
    Object.keys(map).forEach(id => {
      const n = document.getElementById(id);
      if (!n) return;
      n.addEventListener('change', () => {
        SL.save.setSetting(map[id], n.checked);
        SL.audio.unlock();
        SL.audio.applySettings();
        SL.audio.play('ui');
      });
    });

    const testBtn = $('#btn-test-sound');
    if (testBtn) testBtn.addEventListener('click', () => {
      SL.audio.unlock();
      SL.save.setSetting('sfx', true);
      $('#set-sfx').checked = true;
      SL.audio.applySettings();
      SL.audio.play('win');
      refreshAudioState();
      setTimeout(refreshAudioState, 400);
      setTimeout(refreshAudioState, 3200);      // shows the route being released again
    });

    $('#btn-reset').addEventListener('click', () => {
      if (!confirm('Erase every level, coin and item you have earned?')) return;
      SL.save.reset();
      SL.audio.applySettings();
      SL.audio.play('nope');
      SL.game.showcase(1);
      show('title', false);
    });
  }

  function pauseGame() {
    if (!SL.game.pause()) return;
    const inLab = SL.game.pausedFrom === 'lab';
    $('#btn-restart').textContent = inLab ? '↻ Reset room' : '↻ Restart level';
    const skip = $('#btn-skip');
    if (SL.game.canSkip()) {
      const cost = SL.game.skipPrice(SL.game.S.level.n);
      $('#btn-skip-price').textContent = fmtNum(cost);
      skip.hidden = false;
      skip.classList.toggle('poor', SL.save.credits() < cost);
    } else {
      skip.hidden = true;
    }
    SL.audio.play('back');
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-pause'));
    current = 'pause';
    document.getElementById('touch').hidden = true;
  }

  SL.ui = { show, hideScreens, back, bind, bindHud, walletAll, pauseGame, noteTouch, touchWanted, showRetry, paintRagdollBtn, get current() { return current; } };
})(window.SL);
