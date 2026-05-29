# DockShield: The Depth — Build Progress

A free-roam boat game set in **Castor Bayou** (region: **Bayou Bay**), starring
The Depth — **The Reel**, **Lilly Loch**, and **The Fly**. Live at
https://dockshield.vercel.app (Vercel auto-deploys `public/` on push to `main`).

Single-file front end: `public/index.html` + `public/app.js` (THREE.js r128) +
`public/styles.css`. Backend (`api/`, `supabase/`) is intact but the live game
runs in `GAME_MODE='game'`; the legacy marketing funnel is gated behind
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

### Systems live now
- **Entry**: hero pick → 2 lore questions → free-roam (optional home-dock address, real geocoded).
- **World**: 1200u lake, day/night cycle, weather (live + 45s refresh), mist, named POIs, minimap with clip+clamp, cryptid shadow.
- **Driving**: 3 hero hulls w/ distinct profiles, hull integrity + damage resistance, reverse cap, foam ring, wake/spray.
- **Missions**: random drop-point beacons → 6 mini-games (battle, puzzle, runner, tetris, dock rescue, baitwell). Deep Dock boss when triggers fire.
- **Fishing**: cast (F when stopped), tension-band fight gated by line strength + rod control, splashes, ambient fish-jumps, 13 species across 4 rarities incl. gators, Keep/Release → bait + trophy.
- **Economy**: bait currency, 4 bait shops selling gear tiers + consumables (Patch Kit/Sonar Bank/Tournament Line/Scout Flare).
- **Meta** (persisted, `localStorage dockshield_save_v1`): Fish Codex, Trophy Board, best score, 13 achievements, gear loadout, mute, graphics quality.
- **Camera/UX**: photo mode (P), mission-queue ticker, sonar reveal of civilians/evidence, achievement toasts, two-tap END RUN.

---

## In progress — Phase IV (3 PRs in sequence)

Plan: `/root/.claude/plans/root-claude-uploads-acd62b7a-69a0-4b43-piped-pillow.md`

- **PR A — Duct + wet-screen droplets + audio** *(this branch)*
  - Duct the Rubber Ducky: uncatchable legendary, random rare spawn, 5 escape archetypes (slip/flop/dive/fly/bounce), persisted sighting stats, locked codex entry.
  - Wet-screen droplet overlay (`#wet-cv`), triggered by splashes/surge/turns/rain.
  - Audio polish: speed-pitched motor loop, water-lap ambient, new cues (quack/dig/croak/splash_big).
- **PR B — Shore foraging + bait inventory**
  - Beach the boat at shore camps → worm-dig / bug-catch / frog-grab / minnow-net mini-games → typed bait inventory that biases the catch roll.
- **PR C — Boatworks + hero themes + abilities**
  - Boatworks shop, per-hero boat upgrades (engine/lights/armor/electronics) with visible parts, hero accent kits (Reel chrome / Lilly flannel / Fly stealth), hero special abilities.

---

## Conventions
- Verify every change: `node --check public/app.js` + headless Playwright smoke (`?qa=1` debug hooks) + screenshot review before merge.
- One feature branch per PR; squash-merge to `main`; never push the model identifier into artifacts.
- `save_v1` is one JSON blob; every load path uses `||` defaults — no migration needed.
