// DockShield · client environment fallback.
//
// The app reads its Supabase config from window.__ENV__, which the /api/config
// route (served by api/config.js) injects at runtime from Vercel environment
// variables. index.html loads it as <script src="/api/config">. When those env vars
// aren't set (e.g. a fresh deploy), the social + cloud layer stays dark.
//
// This file provides a FALLBACK so the publishable Supabase config is always
// present on the static deploy. It only fills BLANKS — if real values are
// injected via /api/config (loaded before this script), those always win.
//
// Safety: SUPABASE_ANON_KEY here is a *publishable* key (sb_publishable_…),
// the kind Supabase designs for client-side use. Every table is protected by
// Row-Level Security (public-read where intended, authed self-only writes),
// so the key is safe to ship to the browser — which it is anyway, since the
// runtime /api/config path serves the exact same value to every client.
//
// Billable secrets (maps key, Stripe, service-role key) are NOT here and never
// should be — those stay server-side only.
(function () {
  var e = (window.__ENV__ = window.__ENV__ || {});
  if (!e.SUPABASE_URL) e.SUPABASE_URL = 'https://yjpfrrjuahtzpizcrhvf.supabase.co';
  if (!e.SUPABASE_ANON_KEY) e.SUPABASE_ANON_KEY = 'sb_publishable_QaLrLsyZL4_-IJbcAFtz6w_c-KE7pxX';
})();
