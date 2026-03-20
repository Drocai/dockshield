-- =================================================================
-- DockShield + PierPressure — Unified Schema v2
-- =================================================================
-- Run AFTER schema.sql (additive migration)
-- Supabase Dashboard → SQL Editor → New Query → Run
-- =================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ---------------------------------------------------------------
-- USERS — Extended profile linked to Supabase Auth
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_auth ON users(auth_user_id);

-- ---------------------------------------------------------------
-- MARINAS — Physical marina locations
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marinas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326),
  lat NUMERIC,
  lng NUMERIC,
  depth_map_url TEXT,           -- URL to depth heightmap in Supabase Storage
  shoreline_mask_url TEXT,       -- URL to shoreline material mask
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Lake Lanier as default marina
INSERT INTO marinas (slug, name, lat, lng, active) VALUES
  ('lake-lanier', 'Lake Lanier — Forsyth County', 34.2279, -83.9199, true)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------
-- MARINA CONFIGS — Per-marina simulation + product settings
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marina_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marina_id UUID REFERENCES marinas(id) ON DELETE CASCADE,
  active BOOLEAN DEFAULT true,
  config_json JSONB DEFAULT '{
    "maxConcurrentUsers": 50,
    "defaultAtmosphereMode": "baseline",
    "adminLockedMode": null,
    "tickRateHz": 15,
    "weatherRefreshMinutes": 10,
    "qualityPresets": ["ultra","high","medium","safe-mobile"]
  }'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(marina_id)
);

-- ---------------------------------------------------------------
-- MEMBERSHIPS — Role-based marina access
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  marina_id UUID REFERENCES marinas(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'boater')),
  is_platform_super_admin BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, marina_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_marina ON memberships(marina_id);
CREATE INDEX IF NOT EXISTS idx_memberships_role ON memberships(role);

-- ---------------------------------------------------------------
-- DOCKS — Physical dock structures within a marina
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS docks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marina_id UUID REFERENCES marinas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dock_type TEXT DEFAULT 'fixed' CHECK (dock_type IN ('fixed','floating','seawall','boat_lift','multi')),
  position_x NUMERIC DEFAULT 0,
  position_z NUMERIC DEFAULT 0,
  rotation_deg NUMERIC DEFAULT 0,
  length_m NUMERIC DEFAULT 10,
  width_m NUMERIC DEFAULT 3,
  shore_material TEXT DEFAULT 'wood' CHECK (shore_material IN ('wood','concrete','sand','composite')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docks_marina ON docks(marina_id);

-- ---------------------------------------------------------------
-- SLIPS — Bookable positions within docks
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dock_id UUID REFERENCES docks(id) ON DELETE CASCADE,
  marina_id UUID REFERENCES marinas(id) ON DELETE CASCADE,
  slip_number TEXT NOT NULL,
  position_x NUMERIC DEFAULT 0,
  position_z NUMERIC DEFAULT 0,
  max_length_m NUMERIC DEFAULT 8,
  max_beam_m NUMERIC DEFAULT 3,
  depth_m NUMERIC DEFAULT 2.5,
  status TEXT DEFAULT 'available' CHECK (status IN ('available','occupied','reserved','maintenance')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slips_dock ON slips(dock_id);
CREATE INDEX IF NOT EXISTS idx_slips_status ON slips(status);

-- ---------------------------------------------------------------
-- BOATS — Registered boat profiles (tied to users)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS boats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  marina_id UUID REFERENCES marinas(id) ON DELETE CASCADE,
  boat_class TEXT NOT NULL DEFAULT 'regular' CHECK (boat_class IN ('regular','pontoon','speedboat')),
  display_name TEXT,
  color_hex TEXT DEFAULT '#e8e8e8',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_boats_user ON boats(user_id);
CREATE INDEX IF NOT EXISTS idx_boats_marina ON boats(marina_id);

-- ---------------------------------------------------------------
-- SESSIONS — Simulation sessions (solo or shared)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marina_id UUID REFERENCES marinas(id) ON DELETE CASCADE,
  mode TEXT DEFAULT 'solo' CHECK (mode IN ('solo', 'shared')),
  atmosphere_mode TEXT DEFAULT 'baseline' CHECK (atmosphere_mode IN ('baseline', 'live')),
  atmosphere_locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'crashed')),
  max_participants INTEGER DEFAULT 50,
  seed TEXT,                      -- Deterministic replay seed
  started_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  summary_json JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sessions_marina ON sessions(marina_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- ---------------------------------------------------------------
-- SESSION TOKENS — Short-lived auth for WebSocket connections
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_tokens_hash ON session_tokens(token_hash);

-- ---------------------------------------------------------------
-- BOATS RUNTIME — Last known authoritative physics state
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS boats_runtime_last (
  boat_id UUID PRIMARY KEY REFERENCES boats(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  state_json JSONB DEFAULT '{}'::jsonb,
  tick_number BIGINT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- RESERVATIONS — Slip bookings
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slip_id UUID REFERENCES slips(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  marina_id UUID REFERENCES marinas(id) ON DELETE CASCADE,
  boat_id UUID REFERENCES boats(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','cancelled','completed')),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT no_overlap EXCLUDE USING gist (
    slip_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (status IN ('pending','confirmed'))
);

CREATE INDEX IF NOT EXISTS idx_reservations_slip ON reservations(slip_id);
CREATE INDEX IF NOT EXISTS idx_reservations_user ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);

-- ---------------------------------------------------------------
-- WEATHER SNAPSHOTS — Normalized weather cache
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weather_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marina_id UUID REFERENCES marinas(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('baseline','noaa','openweather','mixed')),
  observed_at TIMESTAMPTZ NOT NULL,
  wind_speed_mps NUMERIC DEFAULT 0,
  wind_direction_deg NUMERIC DEFAULT 0,
  gust_speed_mps NUMERIC DEFAULT 0,
  rain_intensity NUMERIC DEFAULT 0,
  visibility_meters NUMERIC DEFAULT 10000,
  lightning_hazard BOOLEAN DEFAULT false,
  confidence TEXT DEFAULT 'high' CHECK (confidence IN ('high','medium','low')),
  raw_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weather_marina ON weather_snapshots(marina_id, created_at DESC);

-- ---------------------------------------------------------------
-- ALERT RULES — Configurable alert thresholds per marina
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marina_id UUID REFERENCES marinas(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warn','critical')),
  threshold_json JSONB DEFAULT '{}'::jsonb,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- ALERTS — Emitted during simulation
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  boat_id UUID REFERENCES boats(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warn','critical')),
  message TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alerts_session ON alerts(session_id);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);

-- ---------------------------------------------------------------
-- SCENARIO PRESETS — Deterministic training/demo/stress configs
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scenario_presets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marina_id UUID REFERENCES marinas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  seed TEXT,
  env_json JSONB DEFAULT '{
    "windSpeedMps": 0,
    "windDirectionDeg": 180,
    "rainIntensity": 0,
    "visibilityMeters": 10000,
    "waveAmplitude": 0.3,
    "lightningHazard": false
  }'::jsonb,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default scenarios
INSERT INTO scenario_presets (marina_id, name, seed, env_json) VALUES
  ((SELECT id FROM marinas WHERE slug = 'lake-lanier'), 'Calm Training', 'calm-001', '{"windSpeedMps":1,"windDirectionDeg":180,"rainIntensity":0,"visibilityMeters":10000,"waveAmplitude":0.2,"lightningHazard":false}'::jsonb),
  ((SELECT id FROM marinas WHERE slug = 'lake-lanier'), 'Moderate Chop', 'chop-001', '{"windSpeedMps":6,"windDirectionDeg":225,"rainIntensity":0.1,"visibilityMeters":5000,"waveAmplitude":0.8,"lightningHazard":false}'::jsonb),
  ((SELECT id FROM marinas WHERE slug = 'lake-lanier'), 'Storm Warning', 'storm-001', '{"windSpeedMps":15,"windDirectionDeg":270,"rainIntensity":0.8,"visibilityMeters":500,"waveAmplitude":2.0,"lightningHazard":true}'::jsonb)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------
-- ANALYTICS — Session summaries for dashboard
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marina_id UUID REFERENCES marinas(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_marina ON analytics_events(marina_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type);

-- ---------------------------------------------------------------
-- EXTENDED PIPELINE VIEW — Merges DockShield + PierPressure
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW platform_summary AS
SELECT
  (SELECT COUNT(*) FROM leads) AS total_leads,
  (SELECT COUNT(*) FROM leads WHERE status = 'active') AS active_leads,
  (SELECT COUNT(*) FROM customers WHERE active_tier > 0) AS paying_customers,
  (SELECT COALESCE(SUM(q.monthly_price), 0) FROM customers c JOIN quotes q ON c.lead_id = q.lead_id WHERE c.active_tier > 0 AND q.status = 'paid') AS mrr,
  (SELECT COUNT(*) FROM marinas WHERE active = true) AS active_marinas,
  (SELECT COUNT(*) FROM memberships WHERE active = true) AS total_members,
  (SELECT COUNT(*) FROM memberships WHERE role = 'admin' AND active = true) AS admin_count,
  (SELECT COUNT(*) FROM sessions WHERE status = 'active') AS active_sessions,
  (SELECT COUNT(*) FROM boats) AS registered_boats,
  (SELECT COUNT(*) FROM reservations WHERE status = 'confirmed') AS active_reservations;

-- ---------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------

-- Users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own" ON users FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
CREATE POLICY "users_update_own" ON users FOR UPDATE TO authenticated USING (auth_user_id = auth.uid());
CREATE POLICY "service_all_users" ON users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Marinas (public read)
ALTER TABLE marinas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marinas_public_read" ON marinas FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "service_all_marinas" ON marinas FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Memberships
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read_own" ON memberships FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));
CREATE POLICY "service_all_memberships" ON memberships FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Docks (read if member of marina)
ALTER TABLE docks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "docks_read_members" ON docks FOR SELECT TO authenticated
  USING (marina_id IN (
    SELECT marina_id FROM memberships
    WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()) AND active = true
  ));
CREATE POLICY "service_all_docks" ON docks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Slips
ALTER TABLE slips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "slips_read_members" ON slips FOR SELECT TO authenticated
  USING (marina_id IN (
    SELECT marina_id FROM memberships
    WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()) AND active = true
  ));
CREATE POLICY "service_all_slips" ON slips FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Boats
ALTER TABLE boats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "boats_read_own" ON boats FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));
CREATE POLICY "boats_insert_own" ON boats FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));
CREATE POLICY "service_all_boats" ON boats FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_read_active" ON sessions FOR SELECT TO authenticated USING (status = 'active');
CREATE POLICY "service_all_sessions" ON sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Reservations
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reservations_read_own" ON reservations FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));
CREATE POLICY "reservations_insert_own" ON reservations FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));
CREATE POLICY "service_all_reservations" ON reservations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Weather (public read)
ALTER TABLE weather_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weather_public_read" ON weather_snapshots FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_all_weather" ON weather_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Alerts
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_read_session" ON alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_all_alerts" ON alerts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Scenario presets (public read)
ALTER TABLE scenario_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "presets_public_read" ON scenario_presets FOR SELECT TO authenticated USING (active = true);
CREATE POLICY "service_all_presets" ON scenario_presets FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Analytics
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_analytics" ON analytics_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Marina configs
ALTER TABLE marina_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "configs_read_members" ON marina_configs FOR SELECT TO authenticated
  USING (marina_id IN (
    SELECT marina_id FROM memberships
    WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()) AND active = true
  ));
CREATE POLICY "service_all_configs" ON marina_configs FOR ALL TO service_role USING (true) WITH CHECK (true);
