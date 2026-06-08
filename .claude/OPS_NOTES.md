# DockShield Ops Notes

Living, session-spanning log of incidents, gotchas, and "remember this for next time" items
so I (Claude) don't keep relearning the same things across sessions.

## Known external services
- **dockshield.vercel.app** — production game (Vercel, team `dojoroc`, project `prj_uDhJM6zN17HkqaumIcDE6DRzTxX9`). Static SPA. No sign-in flow.
- **GitHub** `Drocai/dockshield` — only repo I have GitHub MCP access to.
- **Supabase** — schema lives in `supabase/` (auth_user_id columns exist on the business/marina side, but no front-end auth UI is wired yet).
- **wecu-automagic.netlify.app** — separate Netlify project. Out of scope for dockshield work but the user logs into it with `djmc16120@gmail.com`.

## Incidents (rolling)
- **2026-06-08 · Netlify sign-in glitch (resolved).** User briefly could not sign in to wecu-automagic.netlify.app with djmc16120@gmail.com. Self-resolved. Not a dockshield issue. Logged so future sessions don't chase it.

## Error tooling cheat sheet
- **Client-side errors** (any session, no SDK): `DS.errors()` on the live site — reads the localStorage ring buffer wired into `public/index.html`. `DS.errorsClear()` to reset.
- **Server-side errors** (Vercel): `mcp__41b2...get_runtime_logs` with `projectId=prj_uDhJM6zN17HkqaumIcDE6DRzTxX9 teamId=team_4gsjcLKhFj7Rmz0qWV7qEtf6`.
- **PR babysit**: subscribe via `mcp__github__subscribe_pr_activity`. Delivers CI fails + reviews; does NOT deliver silent passes — user must re-ping for that.
- **Session start health**: `.claude/hooks/session-start.sh` auto-fires; reports syntax/HTML balance/dirty/branch.
