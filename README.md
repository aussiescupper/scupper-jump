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

### Stick Ops

The first-person mode. A raycaster in the Wolfenstein mould — one ray per screen column, DDA
through a 24×24 grid, one vertical slice of wall drawn per hit — and since everything that is not a
wall is a billboard, the billboards are the same stick figures as everywhere else, hats and faces
and builds intact. Nothing here is an image file: the four wall textures are drawn into offscreen
canvases at boot, the same way every sound is synthesised.

Waves come at you in a maze that is generated fresh each run. Blocks are dropped in at random and
any block that would wall part of the floor off is taken straight back out, so there is never a
room you cannot walk out of. Two sorts of people want a word:

| | |
|---|---|
| Bruiser | walks in and swings |
| Gunner | hangs back and shoots, and sidesteps while doing it (from wave 2) |

They find you with a breadth-first flood from your own cell — every open square records how many
steps it is back to you, so anyone who has lost sight of you walks the corridors instead of milling
about in a corner. It is recomputed a few times a second; the map is only 576 cells.

Three weapons: the **Pistol** never runs out, the **SMG** is automatic, and the **Shotgun** throws
eight pellets. The last two come off the floor along with medkits, which is the reason to leave the
corner you like. Clearing a wave pays a bonus on top of the kills.

On a keyboard: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to move, <kbd>Q</kbd>/<kbd>E</kbd>
or the arrows to turn, click for the mouse look (it takes the pointer lock), <kbd>1</kbd>–<kbd>3</kbd>
or the scroll wheel to change weapon. On a touch screen the column splits down the middle — drag the
left half to walk, the right half to look, and there is a fire button in the corner.

### Smash Lab

A plain padded room — floor, two walls, a ceiling, nothing else. Stick figures **stand about on
the floor** and wander a little. Grab one with a finger or the mouse and it drops into a ragdoll on
the spot; fling it at a surface and you get paid for the damage. Throw one **through** the others
and they all go down like skittles.

Gravity in here is dialled down to 42% — bodies hang and drift rather than dropping like stones,
which gives you time to watch what you did. They still come down: a fall from the ceiling lands
hard enough to pay.

**Spawn**, **Props** and **Clear** sit top right, clear of the floor where everything happens.
Spawn tops the room up to fourteen; Clear wipes the bodies, the giblets and every stain. The
movement controls are hidden in here — there is nothing to drive.

**Props** opens a spawn list down the right-hand side. Eight of them are loose objects you pick up
and swing:

| | |
|---|---|
| Sword | long and light, takes limbs off |
| Cleaver | short, mean, barely needs a swing |
| Chainsaw | the chain runs whether you are moving or not |
| Buzz Saw | free-spinning blade, cuts on contact |
| Sledgehammer | all the weight in the head |
| Anvil | for dropping |
| Bowling Ball | heavy, round, rolls into a crowd |
| Bomb | 4-second fuse, or set it off with a hard enough hit |

The other two are fixtures that stay where you put them: a **Blender** you feed people into, which
minces and fills up as it goes, and a **Spike Bed** that punishes anything landing hard on it.

Every loose prop is a two-point Verlet capsule — a business end and a tail, held apart by one
distance constraint — so it swings, tumbles and takes a grab using the machinery the ragdolls
already use. The heavier end drags the lighter one round, which is why a sledgehammer swings like a
sledgehammer and a sword flicks like a sword. Blades test their whole sweep rather than just where
they ended up, or a fast swing would pass clean through somebody without touching them.

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

Some blocks have a **bystander** loitering on them. Walk up and punch — <kbd>F</kbd>, <kbd>X</kbd> or
<kbd>Shift</kbd>, or the fist button — and they come off for credits, ragdolling down the tower behind you. They are generated from their own
RNG stream after the tower is built, so adding them left all forty levels byte-for-byte unchanged.

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

The **Marker Pen** (450) unlocks the Draw tab, which is a sketchpad rather than a shelf. The ink
only marks the figure: everything is masked against his silhouette, so a stroke that runs off him
stops dead at the outline and one drawn entirely in mid-air is refused rather than stored invisibly.
The mask is his idle-pose outline fattened by about a unit — enough slack that a line down an arm
need not be pixel-perfect — with the head filled in so a face is drawable. It depends on the build,
so it is rebuilt when that changes and at no other time. The pad shows the masked result as you
draw, so what you watch going down is what sticks.

Whatever you scribble is kept as strokes in the stickman's own local units — the same space `SL.stick` draws
in, feet at the origin — so it travels into every mode at every size without being re-fitted, and
mirrors with him when he turns round. Replaying strokes per figure per frame would be daft, so they
are baked once into an offscreen canvas and blitted; the bake is thrown away only when the drawing
changes. Nine colours, three nib sizes, undo and clear.

It rides your ragdoll too. The skeleton's y axis runs opposite to `SL.stick`'s, so the hip-to-chest
bone supplies the angle and the scale and the drawing tumbles with the body. Limb scribbles drift a
little as the joints move; anything on the chest stays where you put it.

Only you wear it — bystanders, Smash Lab figures and Stick Ops enemies are drawn without it, since
the doodle is opt-in per draw call.

Nine **faces** — Two Dots, Cheerful, Furious, Startled, Half Asleep, Shades, Robot, X Eyes and
Featureless. Drawn in head-local space so they scale with whatever build you are wearing, and worn
everywhere he appears, including the bystanders you knock off blocks.

Six **builds** change his shape — Classic, Lanky, Stocky, Absolute Unit, Buff and Pipsqueak —
altering line weight, limb spread, head size and, on the heavier ones, a gut. These are drawing
only: the hitbox stays 18×30 whatever you pick, so nothing about the physics or a level's
difficulty shifts. Enemies in the Fight Pit and the Smash Lab draw from the same set, so a crowd
is a crowd of different shapes.

**Animations** are three more slots, mixed and matched from one tab: how he walks (Strut, Shuffle,
Sprinter, Moonwalk), how he jumps (Superhero, Cannonball, Star Jump, Doggy Paddle) and how he
stands about (Bouncer, Impatient, T-Pose, Little Dance). Every shop card plays the motion it is
selling rather than showing a still.

Plus ten skins (some with glow, ghosting, sparkle, ember and hue-cycling effects) and eight hats,
including a cork hat and an Akubra. Everything is drawn live — the shop previews are the same
renderer that draws the stickman in game.

## Controls

| | |
|---|---|
| Move | <kbd>A</kbd>/<kbd>D</kbd> or <kbd>←</kbd>/<kbd>→</kbd> |
| Punch | <kbd>F</kbd>, <kbd>X</kbd> or <kbd>Shift</kbd> — bystanders on blocks, and the Fight Pit |
| Shoot (Stick Ops) | click, <kbd>Space</kbd>, <kbd>F</kbd>, <kbd>X</kbd> or <kbd>Shift</kbd> |
| Jump | <kbd>Space</kbd>, <kbd>W</kbd> or <kbd>↑</kbd> — **hold for a higher jump** |
| Go limp / get up | <kbd>R</kbd>, or the stickman button at the bottom of the screen |
| Pause | <kbd>Esc</kbd> or <kbd>P</kbd> |
| Mute | <kbd>M</kbd> |

Restarting a level lives in the pause menu — <kbd>R</kbd> is the ragdoll toggle. The pause menu
also sells a **skip** for the level you are on, at 200 + 30 per level, which marks it cleared at
one star so it never passes for a real run.

On a touch device an on-screen pad appears automatically. Gamepads work too (left stick / d-pad
and the bottom face button).

The touch controls sit in two rows: move and jump along the bottom, punch and go-limp above them
on either side. Anything you can touch has to set `pointer-events:auto` — `#hud` and `#touch` are
both `pointer-events:none` so the canvas underneath stays draggable — and any new control needs a
slot that does not land on top of an existing one. Both mistakes are easy to make and neither
shows up in a screenshot; `document.elementFromPoint` on each control's centre catches them.

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
* Audio is synthesised from plain voice specs, which means the same specs can be rendered into an
  `OfflineAudioContext` and measured. `SL.audio.measure(name)` returns the peak and RMS of any
  effect — that is how the levels were set rather than by ear. Settings → Sound has a **Test**
  button that reports the live context state, for when a device is silencing the page.
* The context is **suspended whenever nothing is playing** — after ~2s of silence, or the moment all
  sound is switched off. An open-but-idle audio route is what many devices turn into a faint speaker
  hiss, and setting the bus gain to zero does not release it. It wakes on the next effect.
* On iOS the hardware mute switch silences web audio outright, whatever the in-game settings say.
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
js/doodle.js        the marker pen: strokes in body-local units, baked once
js/fps.js           Stick Ops: the raycaster, the maze, and the people in it
js/props.js         smash lab props: swings, cuts, blenders, bombs
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
