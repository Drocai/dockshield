// =================================================================
// stripe-webhook: Post-Payment Customer Activation
// =================================================================
// Receives Stripe webhook events. On successful subscription:
// 1. Creates customer record in Supabase
// 2. Updates lead status to 'active'
// 3. Sets initial service schedule
//
// Deploy: supabase functions deploy stripe-webhook
// Secrets: supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
// Stripe Dashboard → Webhooks → Add endpoint:
//   URL: https://<project>.supabase.co/functions/v1/stripe-webhook
//   Events: checkout.session.completed, customer.subscription.deleted
// =================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") as string, {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// Service schedule templates by tier
const SCHEDULES: Record<string, object> = {
  "1": {
    frequency: "bi-annual",
    services: ["pressure_wash", "hazard_report"],
    next_service: null, // Set dynamically
  },
  "2": {
    frequency: "quarterly",
    services: ["pressure_wash", "wood_seal", "pest_treatment", "hazard_report"],
    next_service: null,
  },
  "3": {
    frequency: "monthly",
    services: ["pressure_wash", "wood_seal", "pest_treatment", "drone_inspection", "storm_clearing", "hazard_report"],
    next_service: null,
  },
};

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  try {
    const body = await req.text();

    if (!webhookSecret || !signature) {
      throw new Error("Stripe webhook signature verification is required");
    }

    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    // -------------------------------------------------------
    // Handle: checkout.session.completed
    // -------------------------------------------------------
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const meta = session.metadata || {};

      const tier = meta.daas_tier || "2";
      if (!Object.prototype.hasOwnProperty.call(SCHEDULES, tier)) {
        throw new Error(`Invalid subscription tier: ${tier}`);
      }

      const schedule = { ...SCHEDULES[tier] };

      // Calculate next service date (30 days from now)
      const nextService = new Date();
      nextService.setDate(nextService.getDate() + 30);
      (schedule as any).next_service = nextService.toISOString();

      // Create customer record
      const { error: custError } = await supabaseAdmin
        .from("customers")
        .insert({
          lead_id: meta.lead_id || null,
          stripe_customer_id: session.customer as string,
          active_tier: parseInt(tier),
          service_schedule: schedule,
        });

      if (custError) console.error("Customer insert error:", custError);

      // Update lead status
      if (meta.lead_id) {
        await supabaseAdmin
          .from("leads")
          .update({ status: "active" })
          .eq("id", meta.lead_id);
      }

      // Update quote status
      if (meta.quote_id) {
        await supabaseAdmin
          .from("quotes")
          .update({ status: "paid" })
          .eq("id", meta.quote_id);
      }

      console.log(`Customer activated: ${session.customer_email} — Tier ${tier}`);
    }

    // -------------------------------------------------------
    // Handle: customer.subscription.deleted (churn)
    // -------------------------------------------------------
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      // Deactivate customer
      await supabaseAdmin
        .from("customers")
        .update({ active_tier: 0 })
        .eq("stripe_customer_id", customerId);

      console.log(`Subscription cancelled: ${customerId}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }
});
