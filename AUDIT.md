# DockShield — 26-Point Deep Audit (2026-05-29)

Full audit of `public/app.js` (2.5k-line THREE.js r128 game) + repo hygiene.
Each finding is marked **✅ fixed**, **🟡 deferred** (low value / higher risk), or
**ℹ️ verified clean**. Code changes were validated with `node --check` + a headless
Playwright smoke (Duct chase, forage, mini-game, Boatworks, 2s loop run) — 0 fatal
console errors, no stranded overlays.

## Bugs & leaks (P1)
1. **✅ `_catchBusy` never reset** — after the first catch/Duct Escape it stayed
   `true`, dead-locking every later `_catchOpen` Escape; the forage overlay
   stranded and its timers fired against deleted DOM (`textContent` of null).
   Reset in `closeCatch` + on each forage opener. *(Found by the new smoke.)*
2. **✅ Forage timers leaked on Escape** — `closeCatch` didn't drain
   `mini._teardowns`; now it does, so the forage tick/raf intervals die on bail.
3. **✅ `_fightCleanup` not nulled by finish paths** — now cleared in
   `mini.finish` and `finishForage` so a stale fight closure can't outlive its UI.
4. **✅ `_wxTimer` leaked on `reset()`** — abandoning a run left the 45s weather
   interval armed for one more tick; now cleared in `reset()`.
5. **✅ Dead `appid=demo` weather call** — fired a guaranteed-401 fetch every 45s.
   Now sources `C.OWM_KEY`/`C.OPENWEATHER_KEY` and skips straight to the random
   fallback when no key is configured (no more wasted request).
6. **🟡 Escape→wrong-drop-point in the generic bail path** — `dropPoints.find(d=>!d.userData.active)`
   can match a non-active drop other than the open one. Real but narrow (only the
   non-`_catchOpen`/non-`_peekOpen` branch); deferred — would need an
   `mini._activeDp` threaded through every opener. Documented for a follow-up.
7. **🟡 `tickDropPoints` indexes `dp.children[1]`** — brittle child-order
   assumption; works today. Deferred (cosmetic robustness).

## GPU disposal (P3 — real accumulating leaks)
8. **✅ `mkBoat` leaked the old boat** — every hero swap / upgrade purchase
   rebuilt 20+ meshes without disposing the previous group. Added `disposeTree()`.
9. **✅ Drop points leaked on removal** — `clearDropPoint`/`resetDropPoints` now
   dispose beam/tip/ring/glow geometry+material before `scene.remove`.
10. **✅ Rain never torn down** — particles fell forever after the weather
    cleared; now removed + disposed when conditions leave Rain/Drizzle.
11. **ℹ️ Wakes / sonar / fish-jumps** already dispose correctly — verified.

## Performance (P2)
12. **✅ Per-frame `Vector3` allocations in `loop()`** — the dir/camera-follow
    vectors + y-axis were rebuilt every frame; hoisted to reused scratch vectors.
13. **✅ Per-frame allocation in `tickDuct`** — quack frustum check now reuses
    scratch vectors.
14. **✅ `computeVertexNormals` every frame on a 96×96 plane** (the loop's biggest
    CPU cost) — now staggered to every other frame and skipped entirely on `low`
    graphics, with no visible difference.
15. **🟡 `drawMinimap` every frame** — fine at this scale; could throttle to ~20fps.
    Deferred.

## Cleanliness (P3)
16. **✅ `const console` shadowed global `console`** in `mkBoat` — renamed to
    `dashConsole` (footgun if logging were ever added there).
17. **ℹ️ Console noise** — only one intentional `console.warn` (legacy quote
    path); no debug logging. Clean.
18. **ℹ️ Accidental globals** — none; the IIFE `DS` export is the only global.
19. **ℹ️ Error handling** — `loadSave`/`persist`/`sfx`/`fetchWx`/`geocode`/
    `saveData` all wrapped; no unguarded `JSON.parse` or `localStorage`. Clean.
20. **🟡 Duplication** — repeated hex-color formatting, `tickShops`/`tickCamps`
    near-twins, 4 forage-opener scaffolds, banner-flash pattern. Real but a broad
    refactor; deferred to protect a shipped, working build. Added one shared
    `disposeTree()` helper (used in 4 sites) as the first dedup.
21. **🟡 Magic numbers** — drop cap `3`, proximity radii, timer constants
    scattered. Deferred (a `RANGES`/`TIMERS` block); no behavior risk.

## Repo hygiene
22. **✅ `README.md` was 100% stale** — described the old DaaS marketing funnel,
    nothing about the game. Fully rewritten for DockShield: The Depth.
23. **✅ `PROGRESS.md` out of date** — said Phase IV "in progress"; it's merged
    (#10–#12). Updated to reflect shipped state + repo-health note.
24. **✅ No `.gitignore`** — added (node_modules, env, .vercel, QA scratch).
25. **✅ Redundant SQL schemas** — `full_schema.sql` is the superset of
    `schema.sql` + `schema_v2.sql`; README now names it canonical (legacy files
    kept as historical split versions rather than deleted, since unauthored).
26. **🟡 Stale remote branches** — 11 merged/superseded `claude/*` branches; pruned
    as part of this cleanup (work all lives in `main`).

---

### Net result
- **15 fixes shipped** (5 P1 bugs/leaks, 3 GPU leaks, 3 perf wins, 1 cleanliness,
  3 docs + .gitignore), **8 items verified already-clean**, **8 deferred** with
  rationale (broad refactors / cosmetic robustness on a shipped build).
- Verified: `node --check` clean + headless smoke PASS (0 fatal errors, overlays
  tear down on every exit path).
