/* Scupper Jump — shop catalogue + the modifiers it feeds into the physics */
(function (SL) {
  'use strict';

  /* --------- skins: colour + a visual quirk --------- */
  const SKINS = [
    { id: 'skin_classic', name: 'Charcoal',   price: 0,    colour: '#e9eefb', fx: null,       desc: 'The original stickman. Reliable.' },
    { id: 'skin_crimson', name: 'Crimson',    price: 120,  colour: '#ff6b6b', fx: null,       desc: 'A confident shade of red.' },
    { id: 'skin_azure',   name: 'Azure',      price: 120,  colour: '#57b6ff', fx: null,       desc: 'Cool, calm, still falls off blocks.' },
    { id: 'skin_lime',    name: 'Lime Zest',  price: 220,  colour: '#b6ff5c', fx: null,       desc: 'Highly visible. Mildly citrus.' },
    { id: 'skin_neon',    name: 'Neon',       price: 450,  colour: '#3ddc97', fx: 'glow',     desc: 'Glows in the dark. Always.' },
    { id: 'skin_ghost',   name: 'Ghost',      price: 700,  colour: '#cfe6ff', fx: 'ghost',    desc: 'Translucent, and leaves echoes behind.' },
    { id: 'skin_gold',    name: 'Gold Rush',  price: 900,  colour: '#ffd166', fx: 'sparkle',  desc: 'Solid gold. Sheds a little as you climb.' },
    { id: 'skin_ember',   name: 'Ember',      price: 1200, colour: '#ff8a3d', fx: 'fire',     desc: 'Trails embers from the feet.' },
    { id: 'skin_circuit', name: 'Circuit',    price: 1500, colour: '#5cffc1', fx: 'matrix',   desc: 'Drops little green bits of itself.' },
    { id: 'skin_aurora',  name: 'Aurora',     price: 2500, colour: null,      fx: 'rainbow',  desc: 'Cycles through the whole spectrum.' }
  ];

  /* --------- hats: pure decoration, drawn on the head --------- */
  const HATS = [
    { id: 'hat_none',  name: 'Bare Head', price: 0,    desc: 'Wind in the... head.' },
    { id: 'hat_cap',   name: 'Backwards Cap', price: 150, desc: 'Brim at the back, obviously.' },
    { id: 'hat_beanie',name: 'Beanie',    price: 200,  desc: 'For the high-altitude blocks.' },
    { id: 'hat_cork',  name: 'Cork Hat',  price: 300,  desc: 'Keeps the flies off. Very Aussie.' },
    { id: 'hat_akubra',name: 'Akubra',    price: 600,  desc: 'Outback formal wear.' },
    { id: 'hat_halo',  name: 'Halo',      price: 800,  desc: 'Unearned, but shiny.' },
    { id: 'hat_crown', name: 'Crown',     price: 1000, desc: 'King of the tower.' },
    { id: 'hat_prop',  name: 'Propeller Beanie', price: 1400, desc: 'Spins. Provides no lift whatsoever.' }
  ];

  /* --------- gear: tiered, permanent, changes how you play --------- */
  const GEAR = [
    { id: 'boots',  name: 'Spring Boots', glyph: '🥾', prices: [250, 600, 1200],
      tierDesc: ['Jump 6% higher.', 'Jump 12% higher.', 'Jump 18% higher.'],
      desc: 'Reinforced soles. More height on every jump.' },
    { id: 'dash',   name: 'Air Dash', glyph: '💨', prices: [800, 1900],
      tierDesc: ['Unlocks a double jump.', 'Unlocks a triple jump.'],
      desc: 'A second — then a third — kick of air under the feet.' },
    { id: 'glide',  name: 'Feather Fall', glyph: '🪶', prices: [350, 900],
      tierDesc: ['Fall 10% slower.', 'Fall 18% slower, softer terminal speed.'],
      desc: 'Take the edge off gravity. More time to line up a landing.' },
    { id: 'grip',   name: 'Grip Gloves', glyph: '🧤', prices: [300, 850],
      tierDesc: ['Sharper mid-air steering.', 'Adds a wall slide on the side walls.'],
      desc: 'Sharper steering in the air, then a grip on the walls.' },
    { id: 'magnet', name: 'Coin Magnet', glyph: '🧲', prices: [500, 1100],
      tierDesc: ['Pulls coins from 70px.', 'Pulls coins from 140px.'],
      desc: 'Coins come to you instead of the other way round.' },
    { id: 'lucky',  name: 'Lucky Charm', glyph: '🍀', prices: [700, 1600],
      tierDesc: ['+15% credits earned.', '+35% credits earned.'],
      desc: 'Every end-of-level payout gets bigger.' },
    { id: 'shield', name: 'Guardian', glyph: '🛡', prices: [1800],
      tierDesc: ['Start each level with a shield that soaks one hazard.'],
      desc: 'Spikes and blades get one free pass per attempt.' },
    { id: 'beacon', name: 'Checkpoint Beacon', glyph: '🚩', prices: [2000],
      tierDesc: ['Respawn at the halfway mark instead of the bottom.'],
      desc: 'Plants a flag at the halfway mark of every tower.' }
  ];

  const byId = {};
  SKINS.forEach(s => (byId[s.id] = Object.assign({ type: 'skin' }, s)));
  HATS.forEach(h => (byId[h.id] = Object.assign({ type: 'hat' }, h)));
  GEAR.forEach(g => (byId[g.id] = Object.assign({ type: 'upgrade' }, g)));

  /* Roll every owned upgrade into one set of numbers the game reads each frame. */
  function modifiers() {
    const t = (id) => SL.save.tier(id);
    const boots = t('boots'), dash = t('dash'), glide = t('glide'),
          grip = t('grip'), magnet = t('magnet'), lucky = t('lucky');
    return {
      jumpMul:    1 + boots * 0.06,
      airJumps:   dash,                                  // extra jumps beyond the first
      fallMul:    glide === 0 ? 1 : glide === 1 ? 0.90 : 0.82,
      termMul:    glide >= 2 ? 0.86 : 1,
      airControl: 1 + grip * 0.28,
      wallSlide:  grip >= 2,
      magnet:     magnet === 0 ? 0 : magnet === 1 ? 70 : 140,
      payoutMul:  lucky === 0 ? 1 : lucky === 1 ? 1.15 : 1.35,
      shield:     t('shield') >= 1,
      beacon:     t('beacon') >= 1
    };
  }

  function price(item, nextTier) {
    if (item.type === 'upgrade') return item.prices[nextTier] ?? null;
    return item.price;
  }
  const maxTier = (item) => (item.type === 'upgrade' ? item.prices.length : 1);

  SL.items = { SKINS, HATS, GEAR, byId, modifiers, price, maxTier,
    list: (type) => (type === 'skin' ? SKINS : type === 'hat' ? HATS : GEAR).map(i => byId[i.id]) };
})(window.SL);
