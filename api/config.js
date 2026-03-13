// /api/config.js — Vercel Serverless Function
// Serves public-safe environment variables to the frontend PWA.
// Set these in Vercel Dashboard → Project Settings → Environment Variables.

export default function handler(req, res) {
  // Only expose public/client-safe keys
  const config = {
    CESIUM_ION_TOKEN: process.env.CESIUM_ION_TOKEN || '',
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || '',
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  };

  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache
  res.status(200).send(`window.__ENV__ = ${JSON.stringify(config)};`);
}
