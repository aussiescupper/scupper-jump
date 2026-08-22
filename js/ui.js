/* Scupper Jump — DOM screens, shop, level select, HUD plumbing */
(function (SL) {
  'use strict';
  const { el, fmtTime, fmtNum } = SL.util;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));

  const stack = [];
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
    walletAll();
  }

  function hideScreens(showHud) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    current = null;
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
    const next = SL.save.data.unlocked;
    $('#btn-play-label').textContent = next > 1 ? ('Continue · Level ' + next) : 'Play';
    const best = SL.save.endlessBest();
    $('#btn-endless-best').textContent = best ? '· best ' + fmtNum(best) + 'm' : '';
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

  /* ---------------- shop ---------------- */
  function preview(skinId, hatId) {
    const c = document.createElement('canvas');
    const size = 56, dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr; c.height = size * dpr;
    const x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.save();
    x.translate(size / 2, size - 6);
    x.scale(1.16, 1.16);
    SL.stick.draw(x, { skin: skinId, hat: hatId, pose: 'idle', phase: 1.2, facing: 1, t: 0.6 });
    x.restore();
    return c;
  }

  function renderShop() {
    const grid = $('#shop-grid');
    grid.innerHTML = '';
    $$('#shop-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === shopTab));
    const items = SL.items.list(shopTab);
    const credits = SL.save.credits();

    for (const it of items) {
      const card = el('div', 'card');
      const art = el('div', 'card-art');

      if (it.type === 'skin') art.appendChild(preview(it.id, SL.save.equipped('hat')));
      else if (it.type === 'hat') art.appendChild(preview(SL.save.equipped('skin'), it.id));
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
      } else {
        const owned = SL.save.owns(it.id) || it.price === 0;
        const slot = it.type;
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
  function equip(slot, id) {
    SL.save.equip(slot, id);
    SL.audio.play('ui');
    renderShop();
  }
  function flashWallet() {
    const w = $('#wallet-shop');
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
    const map = { 'set-sfx': 'sfx', 'set-music': 'music', 'set-haptic': 'haptic', 'set-gore': 'gore', 'set-blood': 'blood', 'set-lowfx': 'lowfx', 'set-touch': 'forceTouch' };
    Object.keys(map).forEach(id => {
      const n = document.getElementById(id);
      if (n) n.checked = !!SL.save.setting(map[id]);
    });
    setTab(settingsTab);
    $('#set-version').textContent = SL.VERSION || '1.0.0';
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
      const txt = h.endless ? 'Endless · ' + h.themeName : 'Lvl ' + h.n + ' · ' + h.themeName;
      if (lvl.textContent !== txt) lvl.textContent = txt;
      $('#hud-coin-n').textContent = h.coins;
      $('#hud-coin-t').textContent = h.coinTotal;
      $('#hud-death-n').textContent = h.deaths;
      $('#hud-height-n').textContent = fmtNum(h.height);
      $('#hud-height').hidden = !h.endless;
      $('#hud-deaths').hidden = !!h.endless;
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

  function bind() {
    $('#btn-play').addEventListener('click', () => { SL.audio.play('ui'); playLevel(SL.save.data.unlocked); });
    $('#btn-endless').addEventListener('click', () => { SL.audio.play('ui'); playEndless(); });
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
    $('#btn-quit').addEventListener('click', () => { SL.audio.play('back'); SL.game.showcase(SL.save.data.unlocked); show('title', false); });

    $('#btn-next').addEventListener('click', () => { SL.audio.play('ui'); hideScreens(true); SL.game.nextLevel(); });
    $('#btn-replay').addEventListener('click', () => { SL.audio.play('ui'); hideScreens(true); SL.game.restart(); });
    $('#btn-cmp-shop').addEventListener('click', () => { SL.audio.play('ui'); stack.length = 0; stack.push('title'); show('shop', false); });
    $('#btn-cmp-menu').addEventListener('click', () => { SL.audio.play('back'); SL.game.showcase(SL.save.data.unlocked); show('title', false); });

    $('#btn-end-again').addEventListener('click', () => { SL.audio.play('ui'); playEndless(); });
    $('#btn-end-shop').addEventListener('click', () => { SL.audio.play('ui'); stack.length = 0; stack.push('title'); show('shop', false); });
    $('#btn-end-menu').addEventListener('click', () => { SL.audio.play('back'); SL.game.showcase(SL.save.data.unlocked); show('title', false); });

    const map = { 'set-sfx': 'sfx', 'set-music': 'music', 'set-haptic': 'haptic', 'set-gore': 'gore', 'set-blood': 'blood', 'set-lowfx': 'lowfx', 'set-touch': 'forceTouch' };
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
    SL.audio.play('back');
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-pause'));
    current = 'pause';
    document.getElementById('touch').hidden = true;
  }

  SL.ui = { show, hideScreens, back, bind, bindHud, walletAll, pauseGame, noteTouch, touchWanted, showRetry, paintRagdollBtn, get current() { return current; } };
})(window.SL);
