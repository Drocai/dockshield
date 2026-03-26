// =================================================================
// geocode: Server-side address geocoding proxy
// =================================================================
// Normalizes + geocodes addresses via Nominatim (free, no key needed)
// Falls back to a default Lake Lanier coordinate if geocoding fails.
// Returns: { lat, lng, formatted, confidence }
//
// Deploy: supabase functions deploy geocode
// =================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Lake Lanier default center
const DEFAULT_LAT = 34.1751;
const DEFAULT_LNG = -83.996;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { address } = await req.json();

    if (!address || address.trim().length < 3) {
      throw new Error("Address required (minimum 3 characters)");
    }

    const clean = address.trim();

    // Try Nominatim (OpenStreetMap)
    let lat = DEFAULT_LAT;
    let lng = DEFAULT_LNG;
    let formatted = clean;
    let confidence = "fallback";

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(clean)}&limit=1&addressdetails=1`;
      const res = await fetch(url, {
        headers: { "User-Agent": "DockShield/1.0 (dock-protection-service)" },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          lat = parseFloat(data[0].lat);
          lng = parseFloat(data[0].lon);
          formatted = data[0].display_name || clean;
          confidence = "high";

          // If result is far from Lake Lanier area, flag it
          const distFromLanier = Math.sqrt(
            Math.pow(lat - 34.2279, 2) + Math.pow(lng - (-83.9199), 2)
          );
          if (distFromLanier > 1) {
            confidence = "low-proximity";
          }
        }
      }
    } catch (geoErr) {
      console.error("Nominatim error:", geoErr);
      // Fall through to default
    }

    // If Nominatim failed and Google Maps key is available, try Google
    const GOOGLE_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (confidence === "fallback" && GOOGLE_KEY) {
      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(clean)}&key=${GOOGLE_KEY}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.results?.length > 0) {
            lat = data.results[0].geometry.location.lat;
            lng = data.results[0].geometry.location.lng;
            formatted = data.results[0].formatted_address || clean;
            confidence = "high";
          }
        }
      } catch (googleErr) {
        console.error("Google geocode error:", googleErr);
      }
    }

    return new Response(
      JSON.stringify({ lat, lng, formatted, confidence }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message, lat: DEFAULT_LAT, lng: DEFAULT_LNG, confidence: "error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
