# DockShield: The Depth — Build Progress

A free-roam, GTA-style boat game set in **Castor Bayou** (region: **Bayou Bay**),
starring The Depth — **The Reel**, **Lilly Loch**, and **The Fly**. Live at
https://dockshield.vercel.app (Vercel auto-deploys `public/` on push to `main`).

Single-file front end: `public/index.html` + `public/app.js` (THREE.js r128) +
`public/styles.css`. The legacy marketing funnel (`api/`, `supabase/`) is intact
but the live game runs in `GAME_MODE='game'`; the funnel is gated behind
`GAME_MODE='business'` and revivable.

---

## Shipped (merged to main)

| PR | Title | Highlights |
| --- | --- | --- |
| #2 | Swamp reskin | SHA-verified drop, "The Depth" branding, trust-panel voice |
| #3 | Polish v1 | Tiered ROI, hull integrity, blackwater surge, visible sun |
| #4 | Castor Bayou canon | Heroized operatives, civilians, sonar ping, evidence, radio chatter, cryptid shadow |
| #5 | Free-roam pivot | Dropped the email gate → 2 lore questions; open world; 4 mini-games (battle/puzzle/runner/tetris); drop-point beacons |
| #6 | Hyper 1 | 20 audit fixes + 10 enhancements + dock rescue + baitwell clicker + address→home-dock pin |
| #7 | Hyper 2 | 20 audit fixes + localStorage persistence + Fish Codex + WebAudio SFX + weather-boosted fishing + sonar reveal |
| #8 | Boss/economy | Bait currency + Tackle Shop consumables, real `/api/geocode`, Deep Dock boss arena (3-phase), 10 achievements, Settings panel, sky-dome shader + additive bloom + graphics-quality tiers |
| #9 | Gear/shops | Gear ladder (rod/reel/line/box × 4 tiers), 4 dockable bait shops, fishing fight tension minigame, splash + fish-jump visuals, gator catches (incl. Bull gator), parametric per-hero ExtrudeGeometry hulls, photo mode, mission-queue ticker |
| #10 | **Phase IV-A — Duct + droplets + audio** | Duct the Rubber Ducky (uncatchable legendary, 5 escape archetypes, persisted sighting stats, locked codex entry); wet-screen droplet overlay; audio polish (quack/dig/croak/splash_big) |
| #11 | **Phase IV-B — Foraging + bait inventory** | 4 shore camps; beach with **G** → worm-dig / bug-catch / frog-grab / minnow-net mini-games; typed bait pantry that biases the catch roll; equip via Tackle Shop |
| #12 | **Phase IV-C — Boatworks + hero themes + abilities** | Castor Boatworks shop, per-hero boat upgrades (engine/lights/armor/electronics) with visible parts; hero accent kits (Reel chrome / Lilly flannel / Fly stealth); hero special abilities |
| R20 | **Bayou Files + forage juice** | 5-chapter lore arc unlocked by progression milestones (launch / rescue / evidence / deep water / full extraction), redacted-until-earned, rendered in the Codex with an `Archivist` achievement; canvas particle layer on all 5 forage mini-games (dirt bursts, swat flash, catch ripples, net wake/sparkle); zero-dep in-game error capture (`DS.errors()`); SessionStart hook + ops log |
| R21 | **Underwater cinematic** | A canvas2D veil over the THREE.js scene that fires for the Deep Dock boss — murky-blue gradient, drifting caustic shimmer, rising bubble particles, edge vignette. Activates on `openBoss`, drops on win/lose/flee, and is wired into `resetRunFlags()` as a safety net |
| R22 | **Cloud auth + save sync + vendored THREE** | Supabase magic-link sign-in (zero-dep, raw REST against `/auth/v1/otp`), per-user `player_saves` RLS-protected table, debounced pull-on-login + push-on-persist with a max-wins merge (achievements/codex/bayouFiles unionized, progression maxed). Marina "Sign in to sync" pill; gracefully hidden when no SUPABASE config. THREE.js vendored at `/vendor/three.min.js` so cold starts skip a CDN hop and offline/headless loads still work |
| R23 | **Winter + 4 new species** | Snow weather variant — pale-blue grade, washed sun, ~140 snowflake particles drifting on wind, tighter fog. Offline fallback rotation gets a ~12% chance of Snow; live OpenWeatherMap "Snow" is recognized automatically. Four new species: **Brook trout** + **Ice carp** (uncommon, winter-favored), **Northern pike** (rare, winter-favored), **Spectral catfish** (legendary, night-only — daylight zeros its roll weight). `f.winter` species spike 2.6× during snow and suppress 0.35× when clear |
| R24 | **Pier Hut (first walk-in space)** | A wooden hut on the marina, visible from across the lake — plank walls, gable roof, glowing window + chimney smoke, porch lantern. Drive close + press **H** to enter. Interior overlay houses three boards: the **Codex Board** (visual species grid with caught species lit up), the **Mission Board** (active drop points + distances), and the **Tackle Counter** (one-tap shortcut into the existing shop) |
| R25 | **Daily challenge + leaderboard** | A new `public.challenge_runs` Supabase table (public-read RLS for the leaderboard, authed self-only write). 8 deterministic daily challenges keyed off `localDayKey()` — same prompt for every player on the same day. Marina overlay shows today's challenge tile; tap → leaderboard panel with top 10 scores. End-of-run check posts your score automatically; offline completions queue in `localStorage` and drain on next sign-in |
| R26 | **Cross-device achievement broadcasts** | A new `public.unlock_broadcasts` table (public read, authed self-only insert) records every achievement unlock from every signed-in player. On the marina overlay, the client polls the feed every 12s and pops "AROUND THE BAYOU · `<player>` just unlocked `<X>`" toasts for unlocks since you last looked. Poll stops the moment you launch a run and resumes on the next marina rebuild. Zero-dep (REST polling, no WebSocket SDK) — sub-15s feels-live latency |
| R27 | **Boat Paint Shop** | 9 paint kits (3 universal: Chrome, Inkwave, Copper Bay — owned across heroes; 6 hero-specific signature kits: Reel's Tournament Gold + Carbon, Lilly's Backwater Camo + Magnolia Bloom, Fly's Arctic Stealth + Neon Recon). Per-hero `paintOwned`/`equippedPaint` persisted in save. New "Paint Shop" tab inside the Boatworks shop with color swatches, buy + equip flow. `mkBoat` reads `paintFor(cls)` so equipped paint overrides the hero's stock accents palette across the hull theme |
| R28 | **Seasonal world skin (winter)** | When `wx.c==='Snow'` the world becomes winter: snow caps on every tree crown + stump top, a frost decal across the marina dock, and 12 floating ice patches drifting on the water with subtle bob. Driven from `applyWeatherVisuals()` so it follows the same boundary as snowflakes. Disposed cleanly when the weather flips back (no stranded geometry/materials). Idempotent across the 45s wx refresh ticks |
| R29 | **Pier Hut interior polish** | The Pier Hut now opens to six boards instead of three. **Trophy Wall** mounts the all-time biggest fish + top 3 species by score. **Run Journal** logs the last 5 runs (date, hero, outcome, civs saved, score, duration); the journal entry is pushed automatically when a run ends, persisted in `save_v1.runHistory`. **Jukebox** previews the three ambient music modes (explore / chase / golden) — the live run-loop auto-detects the right mode once you're back on the water. Codex Board, Mission Board, Tackle Counter unchanged |
| R30 | **Weekly tournament** | A new `public.tournament_runs` Supabase table (PK on `(user_id, week_key)`, public-read RLS, authed self-only upsert). Postgres BEFORE-UPDATE trigger keeps the higher of new/existing score so only the player's best counts. Every `endGame` posts the run's score automatically (idempotent — trigger handles dedup). New marina tile + leaderboard panel renders top 20 for the current ISO week with medals and a "YOU" highlight on your own row. Weeks turn over Mondays 00:00 UTC |
| R31 | **8 more species + 3 species lures** | Codex grows 17→25. **Common**: Sunfish, Yellow perch (both `surface`-tagged). **Uncommon**: Black drum (`bottom`), White bass (`surface`), Mud minnow (`bottom`). **Rare**: Snakehead (`cover`, fight 3, gator-class), River cat (`bottom`). **Legendary**: Ghost gar (`night`-locked, fight 3, gator-class). Three new crafted lures with recipes wired into the existing tackle bench: 🎯 Topwater Popper (2× surface fish), 🌀 Spinnerbait (3× cover species — snakeheads + rare bias), ⚖️ Bottom Jig (2× bottom species). Lure-specific `surface` / `cover` / `bottom` tags drive the bias |
| R32 | **Achievement Showcase Wall** | The Pier Hut grows a seventh board. Players pick up to 6 unlocked achievements to pin onto a purple-trimmed wall — name + body line per slot, empty slots show "PIN ONE" placeholders. A MANAGE button opens a picker grid of every unlocked achievement; tap to toggle. Cap of 6 enforced (further picks disabled when full). Persisted in `save_v1.pinnedAchievements` so the wall travels with cloud sync |
| R33 | **Friends system (profiles + friendships)** | Two new Supabase tables. **`profiles`**: per-player public handle index (UNIQUE `lower(handle)` for case-insensitive search), public read, authed self-only write. Synced on every sign-in + on handle changes. **`friendships`**: directional `(requester, responder, status)` with status `pending → accepted`. RLS lets either side see/update/delete the row. Front-end: marina pill below the tournament tile showing friend count + pending badge; click → full overlay with incoming requests, mutual friends, sent requests, and a handle search input. Send / accept / decline / cancel / remove all wired through REST against the new tables. Foundation for R34+ "Friends only" feeds |
| R34 | **Crew-only feeds (tournament tab + broadcasts)** | Tournament panel grows tabs: **ALL · TOP 20** and **YOUR CREW** (count). Crew view filters to friends + the player's own row, highlighting friend rows with a green left border + "CREW" badge. Toggle is instant — no re-fetch, re-renders against cached rows. Cross-device broadcast feed gets a "Crew only" toggle in the Friends panel — persisted in `localStorage` so it survives reloads. When on: toasts only fire for friend handles, kicker flips from "AROUND THE BAYOU" to **"YOUR CREW"**. Falls back to the broad feed if no friends are loaded yet so the player never gets a silent feed |
| R35 | **Audit pass (loop-time cache)** | Surgical micro-perf round driven by a focused code-review agent. `loop()` already caches `t = Date.now() * 0.001` once per frame; the six per-frame tick functions (`tickShops`, `tickCamps`, `tickPierHut`, `tickAI`, `tickPh`, `tickSonar`) now take `t` as a parameter so they don't re-call `Date.now()` per shop/camp/AI boat. Defensive fallback when called without an arg (any QA/dev caller still works). Verified the agent's other claims — wet/underwater resize listeners are init-once (not stacking), Duct decoy mesh is disposed on animation end (line 3344) — so no live leak fixes were needed |
| R36 | **Profile panel + Friend invite links** | Tap any handle anywhere — tournament leaderboard, friends list, broadcast toast text — to open the player's profile modal. Shows their handle, boat, weekly tournament rank/score, friendship status with you, and a context-aware action button (Add Friend / Accept / Sent / Remove / nothing if it's yours). Your own profile shows a copy-to-clipboard **share invite URL** of the form `?invite=USERID`. When anyone opens that URL while signed in, the invite is captured at boot, the URL bar scrubbed, and once auth resolves the friend's profile panel auto-pops with their Add Friend button pre-armed. Delegated click handler on `.prof-link` spans so every overlay's handle text becomes clickable without per-panel rewiring |
| R37 | **Crew presence on minimap** | `profiles` grows `pos_x`, `pos_z`, `seen_at` columns. During a run, the local player upserts position every 5s. While signed in (marina or in-run), the client polls friend positions every 8s and filters to anyone seen within the last 3 minutes. Minimap renders each "online" friend as a green dot (soft halo + crisp core) under the player's own marker — the run feels populated even in single-player. Lifecycle: presence upsert starts on `startGame`, stops on `endGame`; the friend poll starts on sign-in and continues across marina/run states |

### Systems live now
- **Entry**: hero pick → 2 lore questions → free-roam (optional home-dock address, real geocoded).
- **World**: 1200u lake, day/night cycle, weather (live + 45s refresh), mist, named POIs, minimap with clip+clamp, cryptid shadow.
- **Driving**: 3 hero hulls w/ distinct profiles, hull integrity + damage resistance, reverse cap, foam ring, wake/spray. Hero abilities (Reel rescue-bait bonus, Lilly resist, Fly sonar/speed).
- **Missions**: random drop-point beacons → 6 mini-games (battle, puzzle, runner, tetris, dock rescue, baitwell). Deep Dock boss when triggers fire.
- **Fishing**: cast (F when stopped), tension-band fight gated by line strength + rod control, splashes, ambient fish-jumps, 13 species across 4 rarities incl. gators, Keep/Release → bait + trophy. Equipped bait biases the roll.
- **Duct**: rare random spawn, F to engage, **7** rigged escape archetypes (slip / dive / fly / flop / bounce / **tape** / **decoy**), +15 bait consolation, persisted sightings/attempts/near-catches, locked `🦆 Duct · ???` codex entry. Never lands. "Almost!" toast at peak ≥80%.
- **Foraging**: 4 shore camps, beach + G → 4 forage mini-games → typed bait inventory (worm/cricket/frog/minnow/crayfish).
- **Economy**: bait currency, 4 bait shops (gear tiers + consumables) + Castor Boatworks (per-hero upgrades).
- **Boat upgrades**: engine/lights/armor/electronics × 3 tiers per hero, visible parts on the hull.
- **Meta** (persisted, `localStorage dockshield_save_v1`): Fish Codex, Trophy Board, best score, achievements, gear loadout, bait pantry, boat upgrades, mute, graphics quality.
- **Camera/UX**: photo mode (P), mission-queue ticker, sonar reveal of civilians/evidence, achievement toasts, wet-screen droplets, two-tap END RUN.
- **Lore**: the **Bayou Files** — a 5-chapter case file in the Codex that opens one chapter at a time as you hit story beats (first launch, first rescue, recovering evidence, facing the deep water, full extraction). Locked chapters read redacted; unlocking fires a `BAYOU FILE` toast. Collect all five for the `Archivist` achievement.

---

## Repo health (last audit: 2026-05-29)

- `README.md` rewritten for the game (was stale DaaS marketing copy).
- `.gitignore` added (node_modules, env, vercel, QA scratch).
- `package.json` + committed smoke harness (`test/smoke.js`) → `npm run verify`.
- Stale merged remote branches pruned; Phase IV trilogy (#10–#12) merged & verified live.
- `app.js` audited + optimized (overlay/timer leaks, GPU disposal, loop perf) — see `AUDIT.md`.
- Legacy SQL: `full_schema.sql` is canonical; `schema.sql` / `schema_v2.sql` are historical split versions.

### Immersion pass (high-ROI)
- **Audio**: continuous speed-pitched motor loop + ambient water-lap bed (WebAudio, mute-gated).
- **Camera feel**: speed-punch FOV (widens with throttle), screen-shake on surge/impact.
- **Visual grade**: cinematic vignette + letterbox haze overlay (`#grade`, pure CSS, shown during a run).

### Polish v2 (2026-05-29)
- **Duct V2**: 2 new escape archetypes (`tape` slaps a duct-tape patch on the hook; `decoy` visually splits into 2 Ducts). `DUCT_ESCAPES.length === 7`.
- **Visuals**: water sun-glint additive sprite tracking sun-direction; sign-bloom at night with hysteresis (Boatworks + Duct glow); boat speed-rim bloom on the foam ring above 0.6 throttle.
- **Boss arena**: phase-transition `#grade` flashes; 600ms "final beat" before win/lose `mini.finish` (overlay fade + `splash_big` cue, world keeps ticking — no time-scale desync). New `boss_clean` achievement (win without dropping below 50% starting hull).
- **Achievements**: tiny queue around the existing `showAchToast` so rapid unlocks don't clobber; new entries `duct_25_attempts`, `duct_three_near`, `boss_clean`; non-persistent "Almost!" toast variant on Duct chase peaks ≥80%.
- **Settings**: Audio Volume + Screen Shake sliders. Single-read-site multipliers: `_audVol` in `sfx()` peak + `engineAudio.gain`/`lapGain`; `_shakeMul` at the camera-shake consumption site. Persist as plain numbers in `save_v1`.
- **Economy**: bait-counter pulse (`#h-bait` CSS animation, green on gain, red on spend).
- **QA hooks**: `DS.qaDuctEscape(kind)`, `DS.qaUnlock(ids)`, `DS.qaPulseBait(d)`, `DS.getSave()` — all gated on `?qa=1`.

### Visual round 3 — night sky + water reflection
- **Night sky**: 520-point starfield on a high dome + a soft-textured moon & halo, faded in by darkness (`nightAmt` from sun height); moon arcs opposite the sun.
- **Moon-glint**: the water glint now switches from warm sun (day) to cool moonlight (night) instead of vanishing.
- **Water reflection**: PMREM env map (tiny sky gradient) on the water material only — metalness water now mirrors a believable sky instead of black. Defensive `try/catch` so it no-ops on backends that can't build it.
- **Soft sprites**: shared radial-gradient `CanvasTexture` for the moon/halo/stars/glint so none render as hard squares.
- **QA hook**: `DS.qaForceNight()` jumps the day/night clock to deep night (verifiable screenshot).

### Round 17 — music variants + dynamic hull damage VFX + player handle / boat name
- **Music variants** — same 3 pad oscillators retargeting frequency on context switch. `explore` (A minor, default) → `chase` (C minor, faster LFO, on Duct/boss/Gator King) → `golden` (F major9, warmer, on golden-hour flash). One `setMode()` glides freq + LFO with no restart click.
- **Dynamic hull damage VFX** — emissive crack glow on the cabin pulses below 50% hull, dark smoke sprite over the motor below 25%, smoke-puff particles pushed into the wake every ~24 frames at low hull. Reuses the existing `wakes[]` lifecycle.
- **Player handle + boat name** — `playerHandle` and `boatName` persisted in save_v1, surfaced as `🎣 Your Handle` / `Boat Name` inputs on s1. HUD operative pill shows `THE REEL · MONEY PIT`; all 3 share PNGs (trophy / streak / achievements) imprint the handle in the footer.
- Smoke now **52/52 PASS, 0 fatal**.

### Round 16 — hero callout + run-best pill + wind arrow + auto-save dot + streak-reset friendliness
- **Cinematic hero ID card** — flashes the operative's badge + name + ability after pick on s1 (~1.2s, click-to-skip). Reinforces hero identity right at run start.
- **Run-best pill** — top-center "NEW BEST · 🐊 Bull gator +160" flash when a catch beats this run's prior best. Separate from `bestFish` (all-time persisted).
- **Wind direction arrow** — small rotating glyph next to the weather pill that points where the wind is going (meteorological `wd + 180`).
- **Auto-save indicator** — tiny green dot next to the HUD score, pulses opaque for 500ms on every `persist()` call.
- **Streak-reset toast** — friendly "STREAK RESET · Your N-day streak broke. Welcome back." when a player returns after a gap with a streak ≥3 days, before the new streak starts counting up.
- Smoke now **48/48 PASS, 0 fatal**.

### Round 15 — tab-pause + underwater fish silhouette + hook-set celebration + per-hero rod color + achievements share PNG
- **Tab visibility pause** — `visibilitychange` listener silences engine/storm/music/reel/camp audio, stashes `S.on`, restores on visible. Critical baseline so the game doesn't bleed in a background tab.
- **Underwater fish silhouette** — a soft dark ellipse circles the bobber during the wait phase (radius 1.8u), spirals in during pretell (radius 0.6u), vanishes on nibble. Sells "something is swimming around your line."
- **Hook-set celebration** — bigger splash (×1.5 particle count, golden tint), camera punch via `_shake`, brief 220ms golden `#grade` flash, `flashDamage(0.25)` on big fish so the strike has weight.
- **Per-hero rod color** — `_bobberLine` material now picks `BT[S.bc].accents.stripe` (Reel blue stripe, Lilly lime, Fly bright blue) so the fishing line itself reads the operative.
- **Achievements share PNG** — `DS.exportAchievements()` paints a 1200×630 OG card with the unlock count + 5 most-recent badges; "💾 Share PNG" button in the Achievements panel.
- Smoke now **44/44 PASS, 0 fatal**.

### Round 14 — reel-whine into Duct + boss, streak share card, Pier's Notes 30-day toggle, visual rod line
- **Reel-whine in Duct chase** (`endDuct` stop wired) — the R13 continuous-tension oscillator now sings during Duct fights too.
- **Reel-whine in Deep Dock boss** phase-3 reel — frequency tracks tension, stops via `mini.addTeardown`.
- **Streak share PNG** — `DS.exportStreak()` paints a 1200×630 OG-card (🔥 Day N at the Bayou + best streak). "💾 SHARE" button next to the s1 streak pill.
- **Pier's Notes 30-day toggle** — Codex Duct sparkline switches 14 ↔ 30 day window via an in-card button; best-week green highlight strip marks the 7-day window with the most attempts.
- **Visual fishing line** — thin grey `THREE.LineSegments` from the boat's rod-tip to the bobber, refreshed each frame in `tickBobber` so it swings with the bobber. Disposed alongside the bobber.
- Smoke now **41/41 PASS, 0 fatal**.

### Round 13 — Phase V (research-driven): fishing feel + streak + catalysts + mobile polish
Deep-research-informed pass: web-searched Dredge postmortem, Russian Fishing 4, Sea of Thieves, GTA V density principles, three.js r128 perf, mobile WebGL best practices (MDN/Apple HIG/Material 48dp). 5-critic adversarial plan pass + 3-finder bughunt review.

- **Bobber pretell** (Dredge/RF4): 400ms `pretell` phase in `tickBobber` — bobber wobbles ±0.15 rad + mini-dips BEFORE the `nibble` F-window opens. Sells the strike instead of springing it. Cast-prompt repaints with "SOMETHING'S NIBBLING — wait for the dip…". Mistimed taps during pretell spook the fish (same as wait phase).
- **`reelAudio`** — continuous sawtooth-through-lowpass that runs during `openFight`. Freq tracks `tension` 220→880Hz; gain `(0.02 + tension*0.07) * _audVol * _sfxVol`. Sharp creak `sfx('hit')` at tension≥0.85 (rate-limited 0.85s). Mirrors `stormAudio` lazy-build. Stopped in all 6 cleanup paths.
- **Daily streak** (Plotline 2.3× DAU): `streak:{count,lastPlayed,max}` in `save_v1`; `localDayKey()` avoids UTC drift. Milestone toasts at 3/14/100; real `streak_7`/`streak_30` achievements with progress bars. New "Streaks" category. HUD pill on s1: 🔥 Day N at the Bayou · best M.
- **Catalyst events** (Sea of Thieves "story seeds"): `catalyst.maybe(t)` ticker mirrors `storm.maybe(t)`. Every 60–120s, 1.2% roll fires one of 3 audio-only events: gator splash + Lilly radio, distant barge horn + Fly radio, waterbird call + Reel radio. Guarded against `miniActive|_catchOpen|_peekOpen|DUCT.active|_castInFlight|_bobberState`.
- **Stump rendering**: shared `CylinderGeometry` + `MeshStandardMaterial` across all 70 stumps (variance via `mesh.scale`/rotation). Same for 12 debris boxes. Skipped full `InstancedMesh` — r128 `instanceColor` needs shader-chunk patch + collision code iterates `stumps[]`.
- **Mobile polish**: removed `user-scalable=no` from viewport (WCAG + iOS-ignores it); `touch-action:none` on canvas + #touch zone; `#touch button { min-width/height:48px }` (Material 48dp / HIG 44pt); one-shot `_audioCtx.resume()` on `pointerdown/touchend/keydown` for iOS Safari; unified `_isMob` const (now matches iPhone/iPad too).
- **7 QA hooks**: `qaForceNibble`, `qaAudioProbe`, `qaAdvanceDay`, `qaResetStreak`, `qaTriggerCatalyst`, `qaForceFight`, `qaStumpCount`. Smoke now **38/38 PASS, 0 fatal**.

### Round 12 — hero identity overhaul + 3-stage fishing + mobile touch + golden hour + crayfish hole + boat horn + species log
- **Hero identity overhaul**: full repaint per operative + UI tint.
  - **The Reel** → red hull + white pinstripes + blue racing stripe + gold star emblems (tournament-flashy).
  - **Lilly Loch** → muddy camo cabin + pink top stripe + lime-green inner-tube floats + daisy emblems.
  - **The Fly** → matte black stealth hull + cyan-blue glowing tracer line + sonar mast (recon).
  - `BT[cls].accents` palette drives every accent so a future hero can be added by editing one table.
  - CSS `body.hero-reel|lilly|fly` tints the HUD values, mission ticker `<b>`, and operative pill text-shadow to match.
- **3-stage fishing** (real-fishing feel):
  - **Cast** (1.2s arc, was 2.5s) → bobber lands at the bow.
  - **Wait** (random 2-7s, biased by rarity) → bobber sits idle-bobbing on the water.
  - **NIBBLE** — bobber dips ~1.2s, radio whispers "BITE! Tap F." Hit the window → clean **hook set** + fight. Miss → fish steals the bait. Early strike → spooks the fish.
  - `_bobberState` + `tickBobber(t)` drive an in-world bobber mesh; disposed cleanly on cancel/end/reset.
- **Mobile touch UX**:
  - Bigger joysticks (96px / 44px knobs, was 80/36).
  - New buttons: **DOCK**, **FORAGE**, **BOBBER B**, **HORN** alongside PING + FISH/HOOK.
  - `touchDock`/`touchForage`/`touchBobber`/`touchHorn` route to the right action by context (FISH/HOOK doubles as the hook-set if a bobber is in the water).
- **Crayfish Hole** (East Rocks): brand-new flip-the-rocks clicker — most rocks empty, ~30% hide a crayfish, ~12% a minnow. Catch them in the 1.2s reveal window before they re-burrow. Rocks slowly re-roll so a patient player keeps having things to flip.
- **Boat horn**: tap **E** away from a shop (or HORN on mobile) → two-pop horn + cheeky per-hero radio line. Rate-limited 1.2s.
- **First-cast hint pip**: subtle "Press F to cast" pulses in the lower-center when stopped over castable water and `S._castedThisRun` is false.
- **Golden-hour color flash**: amber `#grade` tint fires at sunrise and sunset (dayness crossing 0.12), edge-triggered so it pulses exactly once per crossing. Radio cue too.
- **Achievement toast click-to-dismiss**: tap the toast to clear it early; the queue's next toast is armed instantly so impatient players catch up.
- **Per-species first-land log** (`speciesLog` in save): every species records its first-catch date + spot + score. Codex pill tooltip now reads `species lore — First landed YYYY-MM-DD at Spot Name (+score)`.

### Round 11 — Boatworks tutorial + replay tutorials + minimap zoom + shop labels + trophy export + ach progress bars + music + audio sub-sliders
- **Boatworks first-visit tutorial**: color-coded labels for the 4 slots (Engine/Lights/Armor/Electronics), BEST VALUE tip, dismissible. Added to the `TUTORIALS` table.
- **Replay Tutorials button** in Settings → Controls — `DS.replayTutorials()` clears every seen flag except `intro` (so a reload won't re-fire the cinematic).
- **Minimap zoom toggle** (M key): switches `_mmZoom` between 1.0 and 2.2, projection follows the boat when zoomed in.
- **Per-shop overhead labels**: `CanvasTexture` name sprite per shop; fades in within 40u (full) → 80u (half), always partially visible at night within 100u.
- **Trophy export** (`DS.exportTrophy()`): paints the player's biggest catch onto a 1200×630 open-graph PNG (emoji, name in rarity color, score, date, tagline) and triggers a browser download. "💾 Save" button on the Codex trophy card.
- **Achievement progress bars** for tiered entries — each ACH entry can carry a `p()` function returning `{cur,max}`; locked rows render a thin orange→gold gradient bar + "X / Y" readout. Wired for codex_half, codex_full, bait_baron, duct_ten_attempts, worm_farmer, pantry_stocked, duct_25_attempts, duct_three_near.
- **Music** (`music` object): 3-voice triangle pad (A minor) through a lowpass filter modulated by a 0.07Hz LFO. Ducks under fight overlays, muffles to 550Hz in foul weather, brightens to 1100Hz on Clear. Mute + master + bus volume all gate it.
- **Audio sub-sliders**: SFX / Engine / Ambient / Music separate from Master in the Audio tab. Each bus consumer reads `master*bus`. Persisted as plain numbers; legacy saves default to 1.0 so they sound identical to before.
- Smoke now **31/31 PASS, 0 fatal**.

### Round 10 — pantry tabs + trophy + Duct chart + tutorials + grouped achievements + hero idle + intro
- **Bait pantry tabs**: ALL / FORAGED / CRAFTED. Crafted-only filter even hides the Bare hook button.
- **Persistent biggest catch** (`bestFish` in save): updated on every land, surfaced as a colored "TROPHY · BIGGEST EVER" card at the top of the Codex with the fish's rarity color + score + date.
- **Pier's Notes Duct chart** (`ductLog` in save): per-day stacked sparkline of sightings / attempts / near-catches for the last 14 days. Trimmed to 30 days max so the blob stays bounded.
- **One-time tutorial overlays** for cast / Duct / forage — show on the first encounter, dismissible, persisted in `tutorialSeen` so they never repeat. Cinematic title-card intro on first load.
- **Achievements grouped by category**: Fishing / Duct / Rescue / Gear & Boat / Foraging & Craft, each with per-category "X/Y" progress + colored header. Falls back to a Misc bucket for any unmapped ids.
- **Per-hero idle bob**: Reel = balanced (2.2Hz / 0.20 amp), Lilly = slow wide pontoon (1.6Hz / 0.28 amp), Fly = quick knife-bow (2.6Hz / 0.14 amp). Extra sway when stopped so each boat reads with its own personality at dock.
- **Cinematic intro card**: title fade ("A Castor Bayou Story" → DockShield · The Depth → tagline) over the existing idle-cam sweep, ~5.5s total, click-to-skip. Shown once via `tutorialSeen.intro`.
- Smoke now **26/26 PASS, 0 fatal**.

### Round 9 — hero radio + Codex search/filter + sonar reveals Duct + loyalty + Gator King phase-3 + hero abilities in boss arenas
- **Per-hero catch chatter**: each hero (Reel / Lilly / Fly) gets distinct radio lines on common / rare / legendary / gator catches. 12 new voice strings.
- **Codex search/filter**: case-insensitive search box + tier pills (All / Common / Uncommon / Rare / Legendary / Caught only). Per-tier "X / Y" counters.
- **Sonar reveals Duct**: a 2s gold ring pulse around Duct on the minimap after a ping + a rate-limited Fly radio cue ("Sonar tagged something duck-shaped").
- **Loyalty discount tiers**: lifetime bait spent unlocks Drifter (0) → Regular (500, 3% off) → Local (2000, 6% off) → Old Salt (5000, 10% off). All shop / gear / Boatworks purchases route through `loyaltyBuy`; price labels show the strike-through original next to the discounted price.
- **Gator King phase 3**: tail-slap dodge — a warning bar sweeps; tap DODGE (Space) in the gold window of the bar. 3 successful dodges → win. Lilly resist halves slap damage. Fly recon widens the phase-1 strike band.
- **Hero abilities in Deep Dock boss**: Lilly = 30% damage resist on all phase damage; Fly = -1 sonar hit needed in phase 1; Reel = wider phase-3 release peak band. Surfaced as a tiny hero-active pill in the kicker.
- Smoke now **24/24 PASS, 0 fatal** — adds Codex search, loyalty tier surface.

### Round 8 — Duct compass + camp ambient + settings tabs + 3 craft recipes + run summary
- **Duct compass marker on the minimap**: a pulsing gold dot that sits at Duct's position, clamping to the rim with a directional arrow chevron when he's beyond the dial. Doesn't require sonar — Duct's always findable now.
- **Per-camp ambient audio** (`campAudio`): each shore camp has a flavor sound (frog-pond bandpass, creek high-pass, crayfish-hole low rumble, worm-bed cricket-band) that fades up within 50u of the camp + fades out as you leave. Lazy-built on the shared AudioContext, mute-gated, stopped on photo/end/reset.
- **Settings tabs**: Audio / Graphics / Controls. Reduces visual noise and gives room for new options. `_setTab` persists across reopens. Controls tab now lists the `B` bobber-bounce key.
- **Multi-recipe craft bench** (`CRAFT_RECIPES`): generalized the duct-only craft flow into a table. Added **🪞 Calm Minnow Rig** (5 minnow + 5 worm) → +35% rare on uncommon spots, no spook factor. Added **📣 Loud Cricket Charm** (6 cricket + 1 frog) → +25% uncommon, doubles bites at lure-marked spots. New `first_craft` achievement; both wired into `rollFish` biases.
- **Run summary sparkline**: end-of-run haul now shows a proportional tier-bar (legendary / rare / uncommon / common stacked) plus a "Biggest" callout for the highest-score catch.
- **Mobile touch handlers** on the bobber dots (regular fight + Duct) so a tap registers without the click-event delay.
- Smoke now **22/22 PASS, 0 fatal** — adds settings-tabs render + persist, multi-recipe count, Duct compass live.

### Round 6+7 — Codex / forage backdrops / Boatworks polish / bobber-in-boss / thunder ambience
- **Codex entries** for the Duct Tape Lure (locked until crafted) and Gator King (locked until defeated). Color-coded blocks with lore, live stats, and unlock state.
- **Forage backdrops** for all 4 games via a shared `mini.paintForageBg(ctx,W,H,core,edge,grain)` helper — biome-specific palettes (worm dirt, bug meadow + grass tufts, frog marsh + lily pads, minnow water + current lines). No more flat color boxes.
- **Boatworks cost preview**: every upgrade button now shows the post-purchase balance as a native title tooltip on hover, plus a gold "BEST VALUE" badge on the cheapest currently-buyable upgrade.
- **Bobber-bounce in the boss arena's phase-3**: a small rhythm bar with tap-on-peak (`B`) gives a +2.5% tension nudge — lets the player hold the bar in the release sweet-spot longer instead of relying purely on auto-climb.
- **Storm ambience** (`stormAudio`): low-pass-filtered noise loop that fades up during Rain/Drizzle and down when it clears. Mute-gated, built lazily on the shared AudioContext, stopped on photo/end/reset.
- Smoke now **20/20 PASS, 0 fatal** — adds Gator King UI, Codex polish entries, and Boatworks cost preview assertions.

### Round 5 — Duct Tape Lure + bobber-bounce in regular fight + Gator King + lightning
- **Duct Tape Lure** (`baitInv.ducttape`): craftable at any tackle shop from rare forage (3 crayfish + 4 frog + 6 minnow). Equipping it during a Duct fight widens the bobber peak window from 8% to 28%. Still doesn't catch him. Lore lands: "people swear by it, doesn't work." Achievement: `duct_lure_crafted`.
- **Bobber-bounce in the regular fishing fight**: same rhythm mechanic as the Duct chase, optional, bonus progress on peak hits. Rod tier (`eqRod().control`) widens the peak window — gear gates the difficulty.
- **Gator King mini-boss**: auto-spawns at East Rocks Crayfish Hole (185, 80) once the player has logged all 3 trigger gators. 2-phase fight (timed strike windows → tension band). Wins → +800 score + +60 bait + `gator_king` achievement.
- **Lightning storm hazard**: during Rain/Drizzle, occasional strikes flash the screen white-blue, kick the shake, dump a wet-droplet burst. If `|spd|>0.7` at strike → hull damage + `storm_survivor` achievement. Rate-limited (~one strike every 12-18s).
- **QA hooks** (`?qa=1` gated): `DS.qaSeedDuctRecipe()`, `DS.qaSpawnGatorKing()`, `DS.qaOpenGatorKing()`, `DS.qaStrikeLightning()`. Smoke now **17/17 PASS, 0 fatal**.

### Round 4 — Duct bobber-bounce + god rays + caustics + hero rim + forage polish
- **Duct bobber-bounce rhythm sub-game**: a gold bobber oscillates on a sine inside a separate bar above the tension band; the dashed window at 46–54% is the peak target. **Tap `B`** (or click the bobber) when it's in the window for a progress bonus + streak counter; misses subtract progress and reset the streak. **Phase + frequency reroll on every tap**, so the rhythm is "always changing" — each Duct fight feels distinct.
- **God-ray light shafts**: 3 soft additive sprite cones radiating down from the sun. Peak opacity during golden-hour window (dayness 0.05–0.55), Clear weather only, skipped on Low gfx. Sway slowly on `t`.
- **Caustics shimmer**: a wider additive ring under the boat (`bMesh.userData.caustics`) that ripples + rotates with `t`; opacity grows slightly with speed. Reads as light-through-water.
- **Hero rim lighting**: per-hero colored `PointLight` mounted low + behind the cabin so the hull picks up a colored side-rim against the sky/water (matches `BT[cls].col`).
- **Forage worm-dig polish**: radial-gradient backdrop + grain stippling + dug-out highlight rings, replacing the flat brown canvas.
- Smoke now asserts **13 checks** (bobber UI element present on Duct chase).

---

## Conventions
- Verify every change: `node --check public/app.js` + headless Playwright smoke (`?qa=1` debug hooks) + screenshot review before merge.
- One feature branch per PR; merge to `main` (Vercel deploys on merge).
- `save_v1` is one JSON blob; every load path uses `||` defaults — no migration needed.

---

## Roadmap candidates (next pass)
- Gator-king mini-boss at East Rocks once all gators are caught.
- Lightning-storm day hazard (electrical hull damage at speed during a strike).
- Supabase-backed leaderboard (best score / biggest catch / most Duct attempts).
- Bobbers / lures as a 5th gear slot with attract patterns.
- Dawn/night-only timed missions.
