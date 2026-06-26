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
//
// Scope: the fallback is withheld on Vercel PREVIEW deploys (per-branch / per-commit
// *.vercel.app URLs) so throwaway branch builds can't read/write the production social
// tables. The three production domains are allowlisted; localhost, the test runner, and
// any custom domain are non-*.vercel.app, so they keep the fallback. (A signed-in tester
// on a preview just sees the offline banner — exactly the pre-activation behavior.)
(function () {
  var e = (window.__ENV__ = window.__ENV__ || {});
  // Production hosts that SHOULD get the live cloud config. 'dockshield-git-main-…' is the
  // main branch's git URL, which is the production target, so it belongs here too.
  var PROD_HOSTS = ['dockshield.vercel.app', 'dockshield-dojoroc.vercel.app', 'dockshield-git-main-dojoroc.vercel.app'];
  var h = (typeof location !== 'undefined' && location.hostname) || '';
  // A Vercel preview is any *.vercel.app host that isn't one of the production aliases.
  var isVercelPreview = /\.vercel\.app$/.test(h) && PROD_HOSTS.indexOf(h) === -1;
  // Treat URL + key as ONE atomic pair. If /api/config supplied even one half (e.g. a staging
  // URL but a blank key), do NOT fill the other half — mixing a real URL with the fallback key
  // would flip cloudReady() true and fire every auth/REST call at one project with another
  // project's key, which is worse than staying offline. Only apply the fallback when BOTH blank.
  if (!isVercelPreview && !e.SUPABASE_URL && !e.SUPABASE_ANON_KEY) {
    e.SUPABASE_URL = 'https://yjpfrrjuahtzpizcrhvf.supabase.co';
    e.SUPABASE_ANON_KEY = 'sb_publishable_QaLrLsyZL4_-IJbcAFtz6w_c-KE7pxX';
  }
})();
