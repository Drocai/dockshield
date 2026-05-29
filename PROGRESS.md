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
