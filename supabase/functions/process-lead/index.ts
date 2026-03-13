// =================================================================
// process-lead: Full Autonomous Quote Pipeline
// =================================================================
// Triggered by frontend after lead capture + tier selection.
// Pipeline: Create Quote → Stripe Checkout → Email Link → Return URL
//
// Deploy: supabase functions deploy process-lead
// Secrets needed:
//   supabase secrets set STRIPE_SECRET_KEY=sk_...
//   supabase secrets set RESEND_API_KEY=re_...
//   supabase secrets set APP_DOMAIN=https://your-domain.com
// =================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      lead_id,
      email,
      address,
      dock_type,
      daas_tier,
      monthly_price,
    } = await req.json();

    // Validate
    if (!email || !daas_tier || !monthly_price) {
      throw new Error("Missing required fields: email, daas_tier, monthly_price");
    }

    // -------------------------------------------------------
    // 1. Initialize services
    // -------------------------------------------------------
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") as string, {
      apiVersion: "2022-11-15",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const APP_DOMAIN = Deno.env.get("APP_DOMAIN") || "https://dockshield.vercel.app";
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    // Tier metadata
    const TIERS: Record<number, { name: string; features: string }> = {
      1: { name: "Preventative", features: "Bi-annual wash + hazard report" },
      2: { name: "Comprehensive", features: "Wash + wood seal + pest treatment" },
      3: { name: "Premium", features: "Full service + drone reports + storm clearing" },
    };

    const tierInfo = TIERS[daas_tier] || TIERS[2];

    // -------------------------------------------------------
    // 2. Create Quote record
    // -------------------------------------------------------
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from("quotes")
      .insert({
        lead_id: lead_id || null,
        daas_tier,
        monthly_price,
        status: "processing",
      })
      .select()
      .single();

    if (quoteError) throw new Error(`Quote creation failed: ${quoteError.message}`);

    // -------------------------------------------------------
    // 3. Create Stripe Checkout Session
    // -------------------------------------------------------
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `DockShield ${tierInfo.name} Plan`,
              description: `Marine Asset Protection — ${tierInfo.features}`,
            },
            unit_amount: Math.round(monthly_price * 100),
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${APP_DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_DOMAIN}/?cancelled=true`,
      metadata: {
        quote_id: quote.id,
        lead_id: lead_id || "",
        daas_tier: String(daas_tier),
        dock_type: dock_type || "",
      },
    });

    // -------------------------------------------------------
    // 4. Update quote with Stripe link
    // -------------------------------------------------------
    await supabaseAdmin
      .from("quotes")
      .update({
        stripe_payment_link: session.url,
        status: "link_generated",
      })
      .eq("id", quote.id);

    // Also update lead status
    if (lead_id) {
      await supabaseAdmin
        .from("leads")
        .update({ status: "quoted" })
        .eq("id", lead_id);
    }

    // -------------------------------------------------------
    // 5. Send email with checkout link (via Resend)
    // -------------------------------------------------------
    if (RESEND_API_KEY) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "DockShield <noreply@dockshield.com>",
            to: [email],
            subject: `Your DockShield ${tierInfo.name} Quote — $${monthly_price}/mo`,
            html: `
              <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
                <h1 style="color: #0ea5e9; font-size: 28px; margin-bottom: 8px;">DockShield</h1>
                <h2 style="font-size: 22px; color: #1e293b; margin-bottom: 24px;">Your Protection Plan is Ready</h2>
                
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                  <p style="margin: 0 0 4px; color: #64748b; font-size: 13px;">SELECTED PLAN</p>
                  <p style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #0f172a;">${tierInfo.name} — $${monthly_price}/mo</p>
                  <p style="margin: 0 0 4px; color: #64748b; font-size: 13px;">PROPERTY</p>
                  <p style="margin: 0 0 16px; font-size: 15px; color: #0f172a;">${address || 'On file'}</p>
                  <p style="margin: 0 0 4px; color: #64748b; font-size: 13px;">INCLUDES</p>
                  <p style="margin: 0; font-size: 15px; color: #0f172a;">${tierInfo.features}</p>
                </div>

                <a href="${session.url}" style="display: block; text-align: center; background: #0ea5e9; color: white; font-weight: 600; font-size: 16px; padding: 16px 24px; border-radius: 10px; text-decoration: none; margin-bottom: 16px;">
                  Activate My Protection Plan
                </a>

                <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px;">
                  Visible biological growth reduces dock lifespan by 40%. Our preventative maintenance saves an average of $14,000 in early structural replacement.
                </p>
              </div>
            `,
          }),
        });
      } catch (emailErr) {
        // Non-fatal — log but don't fail the pipeline
        console.error("Email send failed:", emailErr);
      }
    }

    // -------------------------------------------------------
    // 6. Return checkout URL to frontend
    // -------------------------------------------------------
    return new Response(
      JSON.stringify({
        success: true,
        quote_id: quote.id,
        checkout_url: session.url,
        tier: tierInfo.name,
        price: monthly_price,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Pipeline error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
