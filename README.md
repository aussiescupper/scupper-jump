# Scupper Jump

A stick-figure tower climber that installs like a real app. Built for
[**ScupperLab**](https://github.com/aussiescupper) — no build step, no dependencies, no network
required after the first load.

> Climb the blocks. Reach the flag. Spend your Stick Credits.

## The game

You are a stickman at the bottom of a tower of blocks. Jump your way up and land on the golden
**goal block** at the top to clear the level. Level 1 is a gentle ladder of wide, solid blocks.
By level 25 you are threading crumbling ledges, sliding platforms, ice and sawblades with a
lethal floor climbing up behind you.

* **Levels are endless and deterministic.** Every tower is generated from its own level number, so
  level 7 is the same tower for everybody — and the generator *proves* each jump is possible using
  base physics before it places a block. No shop gear is ever required to finish a level.
* **Difficulty ramps to level 25**, then holds: blocks get narrower and further apart, and hazards
  are introduced one at a time so each one gets a level or two to itself.
* **Stick Credits** come from coins, gems, clear bonuses, beating par time and finishing without
  dying. Replaying a cleared level pays 30%.
* **Stars** — ★ clear it · ★★ clear it without dying · ★★★ and collect every coin.

### Going limp, and tripping over

Press <kbd>R</kbd> (or the button between the two thumb pads) and he drops into a ragdoll on the
spot. Press again and he picks himself up wherever he landed — which is not always where he
started, since a limp body slides. A live ragdoll never bleeds and never comes apart. Flop into
the red floor while limp and it counts as a death like any other.

### Dying

The stickman is a **Verlet ragdoll** — eleven points (head, chest, hip, elbows, hands, knees,
feet) held together by bones. When he dies he stops being driven and just flops: limbs trail,
the body folds over ledges, the head lolls on its neck.

A heart, two lungs, a liver and four gibs are soft bodies — they squash along the axis they were
hit on and spring back with an overshoot, so they jiggle rather than skitter like pebbles. The
intestines are a proper Verlet rope that slithers, drapes over blocks and hangs off ledges.

He comes apart **wherever the blade went through**. Every bone crossing the cut plane is severed
and simply stops holding, so the pieces separate on their own:

| Cut at | Result |
|---|---|
| neck | decapitated — the head bounces off on its own, rolling as it goes |
| chest | head-and-shoulders one way, hips-and-legs the other, both arms off |
| waist | cut clean in half |
| thigh | legs off at the hip |
| shin | takes his feet off |

Spikes cut at the tip height, so landing on them feet-first takes your legs — but jump up
*into* them and you lose your head. Sawblades cut through their own centre line, so where you
meet one decides what you lose. Falling into the floor severs nothing: he ragdolls down intact,
and bursts open if he lands hard enough.

A heart, two lungs, a liver, two lengths of intestine and four gibs spill from the cut. Everything
tumbles the whole way down the tower, spraying blood and leaving **permanent stains** on every
surface it touches. The mess stays for the rest of your attempt; it is only cleared when you leave
the level.

Fall off somewhere high and the body is not chased forever: the camera follows it down 700px —
more than a full screen, so you always see the whole tumble — then stops, lets it drop out of shot
and deletes it. Without that, dying near the top of a tall endless run drags the camera a couple of
thousand pixels and takes fifteen seconds about it. Short falls are unchanged and still land.

**Your previous bodies stay where they fell.** Respawn and the last one is still lying there,
organs and all, frozen — up to eight of them, cleared only when you leave the level. Since a corpse
works its way to the bottom, they pile up around the spawn point, so a bad run has you standing on
a heap of your own attempts with blood on every block you died over.

A **corpse** slides off ledges and eventually slips through them, because it belongs at the
bottom. A body you put down **on purpose** does not — it grips, settles on whatever block it lands
on, and stays there.

**Nothing stops it on its own.** The ragdoll runs until you tap, click or press a key.

Settings has a **Gore** tab with two independent switches:

| Blood | Dismemberment | Result |
|---|---|---|
| on | on | the lot |
| off | on | comes apart, entirely bloodless |
| on | off | stays whole, bleeds where he lands |
| off | off | a clean ragdoll |

### Fight Pit

Waves of stick figures come at you in a small arena. Punch with <kbd>F</kbd> or the fist button;
jump first and it lands as a heavier kick. They wind up visibly before swinging, so every hit is
dodgeable. Each one you drop pays out, each wave cleared pays a bonus, and it runs until you are
knocked out. Your best wave is kept.

It uses the ordinary platformer physics, so moving and jumping feel exactly as they do in a level.
Payouts are tuned against the other modes: an expert minute earns about 590, against the Smash
Lab's 495 and a level's 150–350.

### Smash Lab

A plain padded room — floor, two walls, a ceiling, nothing else. Stick figures **stand about on
the floor** and wander a little. Grab one with a finger or the mouse and it drops into a ragdoll on
the spot; fling it at a surface and you get paid for the damage. Throw one **through** the others
and they all go down like skittles.

Gravity in here is dialled down to 42% — bodies hang and drift rather than dropping like stones,
which gives you time to watch what you did. They still come down: a fall from the ceiling lands
hard enough to pay.

**Spawn** and **Clear** sit top right, clear of the floor where everything happens. Spawn tops the
room up to fourteen; Clear wipes the bodies, the giblets and every stain. The movement controls are
hidden in here — there is nothing to drive.

The bodies are the same Verlet ragdoll as everywhere else, so they come apart and bleed on a hard
enough hit. Payouts are rate-limited to one per body per wallop and capped per body — without that
a single throw bills for every limb that touches down and pays thousands. An active minute earns
roughly what a level does; standing still earns nothing.

### Endless

One tower with no top, a red floor that keeps rising, and one life per run. Difficulty is a
function of how high you are rather than which level you picked, and it stops getting harder at
520m. The tower is built a chunk at a time as you climb and pruned behind you, so a long run does
not grow without bound. Every metre pays Stick Credits; your best climb is kept.

### Blocks and hazards

| | | from level |
|---|---|---|
| Solid | dependable footing | 1 |
| Sliding | shifts side to side | 4 |
| Bouncer | flings you far above a normal jump | 5 |
| Crumbling | collapses ~0.4 s after you land, rebuilds after 3 s | 6 |
| Spikes | one third of a block's surface, instant restart | 8 |
| Ice | very low friction | 10 |
| Sawblade | patrols the gaps between blocks | 12 |

Eight themes rotate every four levels — The Back Fence, Outback Run, Bondi Rise, Reef Ascent,
Harbour Lights, Uluru at Dusk, Snowy Peaks, Southern Cross.

## The shop

| Gear | What it does |
|---|---|
| Spring Boots ×3 | +6% jump height per tier |
| Air Dash ×2 | double jump, then triple jump |
| Feather Fall ×2 | slower fall, softer terminal speed |
| Grip Gloves ×2 | sharper air steering, then a wall slide |
| Coin Magnet ×2 | pulls coins from 70px, then 140px |
| Lucky Charm ×2 | +15% then +35% credits earned |
| Guardian | start each attempt with a shield that soaks one hazard |
| Checkpoint Beacon | respawn at the halfway mark instead of the bottom |

Six **builds** change his shape — Classic, Lanky, Stocky, Absolute Unit, Buff and Pipsqueak —
altering line weight, limb spread, head size and, on the heavier ones, a gut. These are drawing
only: the hitbox stays 18×30 whatever you pick, so nothing about the physics or a level's
difficulty shifts. Enemies in the Fight Pit and the Smash Lab draw from the same set, so a crowd
is a crowd of different shapes.

Plus ten skins (some with glow, ghosting, sparkle, ember and hue-cycling effects) and eight hats,
including a cork hat and an Akubra. Everything is drawn live — the shop previews are the same
renderer that draws the stickman in game.

## Controls

| | |
|---|---|
| Move | <kbd>A</kbd>/<kbd>D</kbd> or <kbd>←</kbd>/<kbd>→</kbd> |
| Punch (Fight Pit) | <kbd>F</kbd>, <kbd>X</kbd> or <kbd>Shift</kbd> |
| Jump | <kbd>Space</kbd>, <kbd>W</kbd> or <kbd>↑</kbd> — **hold for a higher jump** |
| Go limp / get up | <kbd>R</kbd>, or the stickman button at the bottom of the screen |
| Pause | <kbd>Esc</kbd> or <kbd>P</kbd> |
| Mute | <kbd>M</kbd> |

Restarting a level lives in the pause menu — <kbd>R</kbd> is the ragdoll toggle. The pause menu
also sells a **skip** for the level you are on, at 200 + 30 per level, which marks it cleared at
one star so it never passes for a real run.

On a touch device an on-screen pad appears automatically. Gamepads work too (left stick / d-pad
and the bottom face button).

## Running it

Any static server will do — a service worker is required for install and offline, so `file://`
will not cut it.

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Add `?dev=1` to the URL to skip service-worker registration
while you are editing.

## Deploying to GitHub Pages

Push to `main` and the included workflow publishes the repository root:

```bash
git init && git add -A && git commit -m "Scupper Jump"
git branch -M main
git remote add origin git@github.com:aussiescupper/scupper-jump.git
git push -u origin main
```

Then in **Settings → Pages**, set *Source* to **GitHub Actions**. The game lands at
`https://aussiescupper.github.io/scupper-jump/`. Relative paths are used throughout, so it works
from any sub-path.

## PWA notes

* `manifest.webmanifest` — standalone display, portrait, maskable icons, shortcuts to Shop and Levels.
* `sw.js` — precaches every asset on install, cache-first for assets, network-first for navigation
  so updates land. **Bump `VERSION` in `sw.js` whenever you ship**, or returning players keep the
  old cache. The precache fetches with `{cache: 'reload'}` so it cannot re-cache stale copies that
  are still inside GitHub Pages' `max-age=600` window — without that, bumping `VERSION` can
  silently do nothing for ten minutes after a deploy.
* Icons are generated PNGs (192/512 plus maskable variants and an Apple touch icon).
* Progress lives in `localStorage` under `scupperlab.jump.v1`.

## Layout

```
index.html          screens, HUD, touch pad
styles.css          all styling
manifest.webmanifest
sw.js               offline cache
js/util.js          maths, seeded RNG, formatting
js/save.js          localStorage-backed progress
js/audio.js         WebAudio synth — every sound is generated, no audio files
js/items.js         shop catalogue + the modifiers it feeds to the physics
js/stick.js         the stickman renderer (game canvas AND shop previews)
js/lab.js           the smash lab: a room, some bodies, and a wallet
js/level.js         procedural towers, the endless tower, the reachability proof
js/gore.js          the Verlet ragdoll, the cut plane, organs, blood, stains
js/render.js        backdrop, blocks, coins, hazards, particles, camera
js/game.js          simulation, input, camera, scoring, main loop
js/ui.js            DOM screens, shop, level select
js/boot.js          wiring, PWA install, service worker
icons/              generated PNG icon set
```

### A note on the ragdoll

Points integrate in Verlet, then six relaxation passes pull the bones back to length with
collision resolved inside the loop — that is what keeps limbs from stretching under a hard impact
(measured bone stretch after a 1400px fall: 1.00–1.01× rest length).

Getting the body to the *bottom* rather than parking on a ledge takes three rules. Contacts under
55 px/s count as resting, not impacts, so a settled piece does not have its speed scrubbed every
frame. A stalled point is walked toward the nearer block edge — the far one if the near one is
jammed against a wall. And anything still stuck after 1.3 s slips straight through. Verified from
1400px up: every point ends flat on the floor, whatever the cut.

The camera tracks the centroid of the whole ragdoll rather than its lowest point, or it would
abandon the body to chase the first giblet that hit the floor.

### A note on the camera

The lethal floor climbs with the highest block you have actually **landed on**, not with your
airborne peak. Without that, a bouncer would fling you upward, drag the floor along with you, and
kill you on the way back down through your own launch pad. The view is allowed to rise above the
floor to keep you in shot and slides back down as you fall.

---

Made by [@aussiescupper](https://github.com/aussiescupper) · ScupperLab
