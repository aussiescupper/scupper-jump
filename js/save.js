/* Scupper Jump — persistence */
(function (SL) {
  'use strict';
  const KEY = 'scupperlab.jump.v1';

  const DEFAULTS = () => ({
    credits: 0,
    unlocked: 1,          // highest level the player may enter
    owned: { skin_classic: 1, hat_none: 1 },
    upgrades: {},          // id -> tier owned (1-based)
    equip: { skin: 'skin_classic', hat: 'hat_none' },
    progress: {},          // levelNumber -> {t:bestTime, d:bestDeaths, c:bestCoins, s:stars}
    stats: { runs: 0, deaths: 0, jumps: 0, coins: 0, earned: 0, playtime: 0 },
    settings: { sfx: true, music: false, haptic: true, lowfx: false, forceTouch: false, gore: true },
    seen: { howto: false }
  });

  let data = DEFAULTS();
  let timer = 0;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const base = DEFAULTS();
        data = Object.assign(base, parsed);
        // deep-merge the nested buckets so new fields survive upgrades
        data.owned = Object.assign(base.owned, parsed.owned || {});
        data.equip = Object.assign(base.equip, parsed.equip || {});
        data.stats = Object.assign(base.stats, parsed.stats || {});
        data.settings = Object.assign(base.settings, parsed.settings || {});
        data.seen = Object.assign(base.seen, parsed.seen || {});
        data.upgrades = parsed.upgrades || {};
        data.progress = parsed.progress || {};
      }
    } catch (e) {
      console.warn('[save] could not read, starting fresh', e);
      data = DEFAULTS();
    }
    return data;
  }

  function flush() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { console.warn('[save] write failed', e); }
  }

  function save() {                 // debounced
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  }

  function reset() {
    data = DEFAULTS();
    flush();
  }

  SL.save = {
    get data() { return data; },
    load, save, flush, reset,

    credits: () => data.credits,
    addCredits(n) { data.credits = Math.max(0, Math.round(data.credits + n)); if (n > 0) data.stats.earned += n; save(); },
    spend(n) { if (data.credits < n) return false; data.credits -= n; save(); return true; },

    owns: (id) => !!data.owned[id],
    grant(id) { data.owned[id] = 1; save(); },
    tier: (id) => data.upgrades[id] || 0,
    setTier(id, t) { data.upgrades[id] = t; save(); },

    equipped: (slot) => data.equip[slot],
    equip(slot, id) { data.equip[slot] = id; save(); },

    levelRecord: (n) => data.progress[n] || null,
    recordLevel(n, rec) {
      const cur = data.progress[n];
      const merged = cur ? {
        t: Math.min(cur.t, rec.t),
        d: Math.min(cur.d, rec.d),
        c: Math.max(cur.c, rec.c),
        s: Math.max(cur.s, rec.s)
      } : rec;
      data.progress[n] = merged;
      if (n + 1 > data.unlocked) data.unlocked = n + 1;
      save();
      return merged;
    },
    cleared: (n) => !!data.progress[n],

    setting(k) { return data.settings[k]; },
    setSetting(k, v) { data.settings[k] = v; save(); },

    bump(k, n) { data.stats[k] = (data.stats[k] || 0) + (n == null ? 1 : n); save(); }
  };
})(window.SL);
