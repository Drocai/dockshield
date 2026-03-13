# DockShield — Automated Marine Asset Protection (DaaS)

**Full-autonomous dock preservation subscription system.**  
Lead capture → Auto-quote → Stripe checkout → Email delivery → Customer activation.  
Zero human intervention required.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND (Vercel — Static PWA)                         │
│  CesiumJS 3D fly-in → Lead form → Tier selection        │
│  Calls: Supabase REST (lead INSERT) + Edge Functions     │
└───────────────┬──────────────────────┬──────────────────┘
                │                      │
                ▼                      ▼
┌───────────────────────┐  ┌──────────────────────────────┐
│  SUPABASE (PostgreSQL) │  │  EDGE FUNCTION: process-lead │
│  leads / quotes /      │  │  Auto-tier → Quote record →  │
│  customers tables      │  │  Stripe Checkout → Resend    │
│  + RLS policies        │  │  email → Return checkout URL │
└───────────────────────┘  └──────────────┬───────────────┘
                                          │
                                          ▼
                           ┌──────────────────────────────┐
                           │  STRIPE                       │
                           │  Subscription checkout        │
                           │  Webhook → stripe-webhook fn  │
                           │  → Activate customer record   │
                           └──────────────────────────────┘
```

### Pipeline Flow

1. **Lead enters address + email** → Frontend INSERT to `leads` table
2. **Selects tier** → Frontend calls `process-lead` Edge Function
3. **Edge Function** creates quote record, Stripe checkout session, emails payment link
4. **Frontend** shows checkout button with live Stripe URL
5. **Customer pays** → Stripe webhook fires → `stripe-webhook` Edge Function activates customer
6. **Customer record** created with service schedule — ready for fulfillment

---

## 60-Minute Deployment Playbook

### Step 1: Supabase Backend (15 min)

1. Create project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste contents of `supabase/schema.sql` → Run
3. Note your **Project URL** and **Anon Key** (Settings → API)
4. Note your **Service Role Key** (same page — keep secret)

### Step 2: API Keys (10 min)

| Service | Get Key At | Enable |
|---------|-----------|--------|
| Cesium Ion | [cesium.com/ion](https://cesium.com/ion/tokens) | Default token works |
| Google Maps | [console.cloud.google.com](https://console.cloud.google.com/apis) | Geocoding API + Map Tiles API |
| Stripe | [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) | Secret key (sk_live_...) |
| Resend | [resend.com/api-keys](https://resend.com/api-keys) | Verify sending domain |

### Step 3: Deploy Edge Functions (10 min)

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set APP_DOMAIN=https://dockshield.vercel.app

# Deploy functions
supabase functions deploy process-lead
supabase functions deploy stripe-webhook
```

### Step 4: Stripe Webhook (5 min)

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Add endpoint: `https://YOUR_PROJECT.supabase.co/functions/v1/stripe-webhook`
3. Select events: `checkout.session.completed`, `customer.subscription.deleted`
4. Copy the webhook signing secret → `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`

### Step 5: Frontend Deploy (10 min)

```bash
# Push to GitHub
git init && git add -A && git commit -m "DockShield MVP"
git remote add origin https://github.com/Drocai/dockshield.git
git push -u origin main

# Deploy to Vercel
# Option A: Vercel Dashboard → Import Git Repository
# Option B: Vercel CLI
npm i -g vercel
vercel --prod
```

Set environment variables in **Vercel Dashboard → Project Settings → Environment Variables**:
- `CESIUM_ION_TOKEN`
- `GOOGLE_MAPS_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### Step 6: Verify (10 min)

1. Visit your Vercel URL
2. Enter a test address and email
3. Confirm 3D fly-in works (requires Cesium + Google Maps keys)
4. Select a tier → confirm Stripe checkout opens
5. Complete test payment with Stripe test card: `4242 4242 4242 4242`
6. Verify in Supabase: lead → quote → customer records created
7. Verify email received (requires Resend setup)

---

## File Structure

```
daas-mvp/
├── api/
│   └── config.js              # Vercel serverless — injects public env vars
├── public/
│   ├── index.html             # PWA frontend (CesiumJS + lead capture + tier UI)
│   ├── manifest.json          # PWA manifest
│   └── sw.js                  # Service worker for offline support
├── supabase/
│   ├── config.toml            # Supabase project config
│   ├── schema.sql             # Full database schema + RLS + analytics view
│   └── functions/
│       ├── process-lead/
│       │   └── index.ts       # Auto-quote pipeline (quote → Stripe → email)
│       └── stripe-webhook/
│           └── index.ts       # Post-payment customer activation
├── vercel.json                # Vercel deployment config
├── .env.example               # Environment variable template
└── README.md                  # This file
```

---

## Unit Economics (Target per 100 Clients)

| Tier | Price | Mix | ARR |
|------|-------|-----|-----|
| Preventative | $49/mo | 20% | $11,760 |
| Comprehensive | $99/mo | 60% | $71,280 |
| Premium | $199/mo | 20% | $47,760 |
| **Total** | | **100** | **$130,800** |

**Target Gross Margin: 65-75%**

---

## Security Notes

- Supabase Anon Key is safe for client-side (RLS enforced)
- Service Role Key is ONLY in Edge Functions (server-side)
- Stripe Secret Key is ONLY in Edge Functions
- Frontend never touches secret keys
- RLS policies restrict anon to INSERT-only on leads table
- All other tables are service_role access only

---

## Monitoring

Query the pipeline health anytime:

```sql
SELECT * FROM pipeline_summary;
```

Returns: total_leads, new_leads, quoted_leads, active_leads, paid_quotes, active_customers, monthly_recurring_revenue.
