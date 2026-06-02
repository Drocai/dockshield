# DockShield: The Depth

A free-roam, GTA-style boat game set on **Castor Bayou** (region: **Bayou Bay**).
Pick a hero, run rescue operations across an open lake, fish 13 species, hunt the
uncatchable legendary rubber ducky **Duct**, forage your own bait, and upgrade
your boat at the Boatworks — all in a single static page, no build step.

**Play it live:** https://dockshield.vercel.app

---

## Tech at a glance

| | |
| --- | --- |
| **Engine** | THREE.js r128 (CDN), one IIFE assigned to `window.DS` |
| **Front end** | `public/index.html` + `public/app.js` + `public/styles.css` — no bundler, no framework |
| **Persistence** | `localStorage` (`dockshield_save_v1` save blob + `dockshield_gfx` graphics prefs) |
| **Serverless** | `api/config.js` (public env injection) · `api/geocode.js` (address → home-dock pin) |
| **Hosting** | Vercel — auto-deploys `public/` on push to `main` (`outputDirectory: public`, no build command) |
| **PWA** | `public/manifest.json` + `public/sw.js` (offline shell) |

The game is entirely client-side. The `supabase/` tree and the Stripe/Resend
edge functions are the **legacy DaaS marketing funnel** (see
[Legacy backend](#legacy-backend-daas-funnel) below); the live experience runs in
`GAME_MODE='game'`. The funnel is gated behind `GAME_MODE='business'` and remains
revivable but is not part of the game.

---

## The game

### Heroes
Each operative has a distinct hull profile, handling, weather tolerance, and a
special ability.

| Hero | Class | Role | Ability |
| --- | --- | --- | --- |
| **The Reel** | runabout | Rescue · Control | +25% bait from civilian rescues |
| **Lilly Loch** | pontoon barge | Brawler · Traversal | +0.1 baseline hull damage resistance |
| **The Fly** | knife-bow speedboat | Recon · Trap | 2s sonar cooldown + 5% top speed |

### Loop
Hero pick → 2 lore questions → free roam. Optional: enter a real address to drop
your home dock (geocoded via `/api/geocode`).

- **World** — 1200u lake, day/night cycle, live weather (45s refresh) + mist,
  named POIs, minimap, a cryptid shadow patrolling the deep.
- **Missions** — random drop-point beacons open 6 mini-games (battle, puzzle,
  runner, tetris, dock rescue, baitwell). The 3-phase **Deep Dock** boss fires on
  trigger.
- **Fishing** — cast with **F** when stopped; a tension-band fight gated by line
  strength and rod control; 13 species over 4 rarities, including gators and the
  Bull gator.
- **Duct the Rubber Ducky** — an uncatchable legendary that spawns rarely. Engage
  with **F**; he escapes via one of 5 archetypes (slip / dive / fly / flop /
  bounce), pays a +15 bait consolation, and logs sightings/attempts/near-catches
  in a locked Codex entry. He never lands.
- **Foraging** — beach the boat at a shore camp and press **G** to open
  worm-dig / bug-catch / frog-grab / minnow-net mini-games. Forage builds a typed
  **bait inventory** (worm/cricket/frog/minnow/crayfish) that biases your catch roll.
- **Economy** — bait is the currency. Five docks:

  | Shop | Stock |
  | --- | --- |
  | Garbone Bait & Cold Beer | starter rods/reels/line/box + consumables |
  | Castor Marina Pro Shop | mid-tier gear |
  | Spillway Salvage | high-tier reels/line/box |
  | The Deep Dock Outfitter | depth-rated top gear |
  | **Castor Boatworks** | engine / lights / armor / electronics upgrades (per hero, visible parts) |

- **Meta (persisted)** — Fish Codex, Trophy Board, best score, achievements,
  gear loadout, bait pantry, boat upgrades, mute, graphics quality.

### Controls
| Key | Action |
| --- | --- |
| **W A S D** | drive |
| **F** | cast / set the hook on a nibble / engage Duct (when stopped) |
| **B** | bobber-bounce tap (rhythm bonus during fights + Duct) |
| **E** | dock at a shop (slow + close) — or boat horn when away from a shop |
| **G** | forage at a shore camp (slow + close) |
| **P** | photo mode |
| **M** | toggle minimap zoom |
| **Space** | reel / fight action |
| **Esc** | close overlay |

Mobile gets touch buttons for **PING / FISH/HOOK / DOCK / FORAGE / BOBBER B / HORN** alongside the throttle + steer joysticks.

---

## Develop

No install is required to run the static game. Serve `public/` and open it:

```bash
python3 -m http.server 8765 --directory public
# → http://127.0.0.1:8765
```

### Verify changes
The front end is hand-written and verified without a bundler. The smoke suite requires Playwright and Chromium:

```bash
npm install
npx playwright install chromium
npm run verify
```

Add `?qa=1` to the URL to expose headless debug hooks on `DS` for smoke tests
(Playwright with swiftshader WebGL):

| Hook | Effect |
| --- | --- |
| `DS.qaOpen('battle'\|'puzzle'\|…\|'boss')` | force-open a mini-game overlay |
| `DS.qaSpawnDuct()` | spawn Duct next to the boat |
| `DS.qaDockCamp()` | open the first forage camp |
| `DS.duct()` | open the Duct chase directly |

### Conventions
- `save_v1` is a single JSON blob; every load path uses `||` defaults, so there
  is **no migration** — new fields are always optional.
- One feature branch per change; merge to `main`; Vercel deploys on merge.
- Verify every change with `node --check` + a headless smoke + screenshot review
  before merge.

**Do not touch** (deploy-critical / out of game scope):
`public/manifest.json`, `public/sw.js`, `api/`, `supabase/functions/*`,
`vercel.json`.

---

## Project layout

```
public/
  index.html        # markup + overlays (HUD, mini-game canvas, prompts)
  app.js            # the entire game (THREE.js scene + systems + UI)  ← DS IIFE
  styles.css        # all styling
  manifest.json     # PWA manifest        (do not touch)
  sw.js             # service worker       (do not touch)
api/
  config.js         # injects public env into the page
  geocode.js        # address → lat/lng for the home-dock pin
supabase/           # LEGACY DaaS funnel backend (not used by the game)
vercel.json         # static deploy config
PROGRESS.md         # build history + roadmap
```

---

## Legacy backend (DaaS funnel)

Before the game pivot, DockShield was an automated dock-protection subscription
service: lead capture → auto-quote → Stripe checkout → email delivery. That
pipeline still lives in the repo and can be revived by flipping `GAME_MODE` to
`'business'`.

- `supabase/full_schema.sql` — canonical schema (leads/quotes/customers +
  the later marina-platform tables). `schema.sql` and `schema_v2.sql` are the
  historical split versions it supersedes.
- `supabase/functions/process-lead` — quote → Stripe checkout → Resend email.
- `supabase/functions/stripe-webhook` — post-payment customer activation.
- `supabase/functions/geocode` — server-side geocode for the funnel.

Deployment of the funnel (Supabase + Stripe + Resend secrets) is documented
inline in those files and in `.env.example`.
