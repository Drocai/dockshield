// /api/geocode.js — Server-side geocoding proxy
// Keeps Nominatim/Google calls server-side, adds fallback logic
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const DEFAULT = { lat: 34.1751, lng: -83.996 };

  try {
    const { address } = req.body || {};
    if (!address || address.trim().length < 3) {
      return res.status(400).json({ ...DEFAULT, confidence: 'error', error: 'Address required' });
    }

    const clean = address.trim();
    let lat = DEFAULT.lat, lng = DEFAULT.lng, formatted = clean, confidence = 'fallback';

    // Try Nominatim
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(clean)}&limit=1`,
        { headers: { 'User-Agent': 'DockShield/1.0' } }
      );
      if (r.ok) {
        const d = await r.json();
        if (d.length > 0) {
          lat = parseFloat(d[0].lat);
          lng = parseFloat(d[0].lon);
          formatted = d[0].display_name || clean;
          confidence = 'high';
        }
      }
    } catch (e) { /* fall through */ }

    // Try Google if Nominatim failed
    if (confidence === 'fallback' && process.env.GOOGLE_MAPS_API_KEY) {
      try {
        const r = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(clean)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
        );
        if (r.ok) {
          const d = await r.json();
          if (d.results?.length > 0) {
            lat = d.results[0].geometry.location.lat;
            lng = d.results[0].geometry.location.lng;
            formatted = d.results[0].formatted_address || clean;
            confidence = 'high';
          }
        }
      } catch (e) { /* fall through */ }
    }

    return res.status(200).json({ lat, lng, formatted, confidence });
  } catch (e) {
    return res.status(500).json({ ...DEFAULT, confidence: 'error', error: e.message });
  }
}
