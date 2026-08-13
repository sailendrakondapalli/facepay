-- Enhanced FacePay Database Schema for Multi-Factor Authentication
-- Migration script to add customer security settings and WebAuthn support

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Customer Security Settings table
CREATE TABLE IF NOT EXISTS customer_security_settings (
  id uuid default uuid_generate_v4() primary key,
  customer_profile_id uuid references customer_profiles(id) on delete cascade unique,
  
  -- Transaction Limits
  max_transaction_amount numeric not null default 5000.00,
  daily_transaction_limit numeric not null default 20000.00,
  
  -- Authentication Method Preferences
  face_payment_enabled boolean not null default true,
  biometric_payment_enabled boolean not null default false,
  
  -- Security Preferences
  require_dual_factor boolean not null default false,
  liveness_detection_enabled boolean not null default true,
  
  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  -- Constraints
  CHECK (max_transaction_amount > 0),
  CHECK (daily_transaction_limit > 0),
  CHECK (daily_transaction_limit >= max_transaction_amount),
  CHECK (face_payment_enabled OR biometric_payment_enabled) -- At least one method must be enabled
);

-- WebAuthn Credentials table
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade,
  customer_profile_id uuid references customer_profiles(id) on delete cascade,
  
  -- WebAuthn Credential Data
  credential_id text not null unique, -- Base64URL encoded
  public_key bytea not null, -- NOT biometric data, just cryptographic public key
  counter bigint not null default 0,
  
  -- Device/Authenticator Information
  transports text[] default '{}', -- ['usb', 'nfc', 'ble', 'internal']
  device_type text not null check (device_type in ('platform', 'cross-platform')),
  aaguid uuid, -- Authenticator Attestation GUID
  
  -- User-Friendly Information
  friendly_name text not null default 'Biometric Device',
  device_info jsonb default '{}',
  
  -- Security and Management
  attestation_object bytea,
  client_data_json bytea,
  
  -- Status
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz default now(),
  
  -- Indexes for performance
  CONSTRAINT unique_credential_per_user UNIQUE (user_id, credential_id)
);

-- Enhanced Transaction Authorization table
CREATE TABLE IF NOT EXISTS transaction_authorizations (
  id uuid default uuid_generate_v4() primary key,
  transaction_id text not null,
  customer_profile_id uuid references customer_profiles(id),
  merchant_id uuid references merchant_profiles(id),
  
  -- Authentication Factors
  face_verified boolean default false,
  face_similarity numeric,
  face_embedding_id uuid,
  
  device_biometric_verified boolean default false,
  webauthn_credential_id text,
  webauthn_signature bytea,
  authenticator_type text,
  
  -- Security Metadata
  challenge text not null,
  challenge_expires_at timestamptz not null,
  ip_address inet,
  user_agent text,
  geolocation jsonb, -- { "latitude": 12.345, "longitude": 67.890 }
  
  -- Risk Assessment
  risk_score numeric default 0.0 check (risk_score >= 0.0 AND risk_score <= 1.0),
  fraud_flags text[] default '{}',
  
  -- Status and Timing
  status text not null default 'PENDING' check (status in ('PENDING', 'AUTHORIZED', 'DENIED', 'EXPIRED')),
  authorized_at timestamptz,
  created_at timestamptz default now(),
  
  -- Ensure one transaction per authorization
  CONSTRAINT unique_transaction_auth UNIQUE (transaction_id)
);

-- Payment Sessions table (temporary payment state)
CREATE TABLE IF NOT EXISTS payment_sessions (
  id uuid default uuid_generate_v4() primary key,
  session_id text not null unique,
  
  -- Session Data
  merchant_id uuid references merchant_profiles(id),
  customer_email text not null,
  amount numeric not null,
  currency text default 'INR',
  
  -- Security
  challenge text not null,
  nonce text not null,
  
  -- Status
  status text not null default 'INITIATED' check (status in ('INITIATED', 'AUTHENTICATING', 'AUTHORIZED', 'COMPLETED', 'FAILED', 'EXPIRED')),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  
  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enhanced audit logging table
CREATE TABLE IF NOT EXISTS security_audit_log (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id),
  customer_profile_id uuid references customer_profiles(id),
  
  -- Event Details
  event_type text not null, -- 'face_enrollment', 'face_authentication', 'webauthn_registration', 'webauthn_authentication', 'payment_attempt', 'settings_change'
  event_action text not null, -- 'success', 'failure', 'attempt'
  event_result jsonb not null default '{}',
  
  -- Authentication Details
  authentication_method text, -- 'face', 'device_biometric', 'dual_factor'
  similarity_score numeric,
  risk_score numeric,
  
  -- Request Context
  ip_address inet,
  user_agent text,
  request_id text,
  session_id text,
  
  -- Security Flags
  suspicious_activity boolean default false,
  fraud_indicators text[] default '{}',
  
  -- Metadata
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Daily transaction tracking view (for limit enforcement)
CREATE OR REPLACE VIEW daily_transaction_summary AS
SELECT 
  cp.id as customer_profile_id,
  DATE(t.created_at) as transaction_date,
  COUNT(*) as transaction_count,
  SUM(t.amount) as total_amount,
  MAX(t.created_at) as last_transaction_at
FROM customer_profiles cp
LEFT JOIN transactions t ON cp.id = t.customer_id
WHERE t.status = 'SUCCESS'
  AND t.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY cp.id, DATE(t.created_at);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customer_security_settings_customer_id 
  ON customer_security_settings (customer_profile_id);

CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id 
  ON webauthn_credentials (user_id);

CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_credential_id 
  ON webauthn_credentials (credential_id);

CREATE INDEX IF NOT EXISTS idx_transaction_auth_transaction_id 
  ON transaction_authorizations (transaction_id);

CREATE INDEX IF NOT EXISTS idx_transaction_auth_customer_id 
  ON transaction_authorizations (customer_profile_id);

CREATE INDEX IF NOT EXISTS idx_payment_sessions_session_id 
  ON payment_sessions (session_id);

CREATE INDEX IF NOT EXISTS idx_security_audit_user_id 
  ON security_audit_log (user_id);

CREATE INDEX IF NOT EXISTS idx_security_audit_event_type 
  ON security_audit_log (event_type);

CREATE INDEX IF NOT EXISTS idx_security_audit_created_at 
  ON security_audit_log (created_at);

-- Enhanced RPC function for validating transaction limits
CREATE OR REPLACE FUNCTION validate_transaction_limits(
  customer_profile_id_param uuid,
  transaction_amount numeric,
  transaction_currency text DEFAULT 'INR'
)
RETURNS TABLE (
  valid boolean,
  reason text,
  max_transaction_amount numeric,
  daily_transaction_limit numeric,
  current_daily_spending numeric,
  transactions_today integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  settings_row customer_security_settings%ROWTYPE;
  daily_spending numeric DEFAULT 0;
  daily_count integer DEFAULT 0;
BEGIN
  -- Get customer security settings
  SELECT * INTO settings_row 
  FROM customer_security_settings 
  WHERE customer_profile_id = customer_profile_id_param;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Customer security settings not found', 0::numeric, 0::numeric, 0::numeric, 0;
    RETURN;
  END IF;
  
  -- Check single transaction limit
  IF transaction_amount > settings_row.max_transaction_amount THEN
    RETURN QUERY SELECT 
      false, 
      'Transaction amount exceeds maximum limit of ₹' || settings_row.max_transaction_amount, 
      settings_row.max_transaction_amount,
      settings_row.daily_transaction_limit,
      0::numeric,
      0;
    RETURN;
  END IF;
  
  -- Calculate today's spending
  SELECT 
    COALESCE(SUM(t.amount), 0),
    COUNT(*)
  INTO daily_spending, daily_count
  FROM transactions t
  WHERE t.customer_id = customer_profile_id_param
    AND DATE(t.created_at) = CURRENT_DATE
    AND t.status = 'SUCCESS';
  
  -- Check daily limit
  IF (daily_spending + transaction_amount) > settings_row.daily_transaction_limit THEN
    RETURN QUERY SELECT 
      false, 
      'Transaction would exceed daily limit of ₹' || settings_row.daily_transaction_limit, 
      settings_row.max_transaction_amount,
      settings_row.daily_transaction_limit,
      daily_spending,
      daily_count;
    RETURN;
  END IF;
  
  -- All checks passed
  RETURN QUERY SELECT 
    true, 
    'Transaction within limits', 
    settings_row.max_transaction_amount,
    settings_row.daily_transaction_limit,
    daily_spending,
    daily_count;
END;
$$;

-- RPC function for getting customer authentication methods
CREATE OR REPLACE FUNCTION get_customer_auth_methods(
  customer_profile_id_param uuid
)
RETURNS TABLE (
  face_payment_enabled boolean,
  biometric_payment_enabled boolean,
  has_webauthn_credentials boolean,
  require_dual_factor boolean,
  webauthn_credential_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  settings_row customer_security_settings%ROWTYPE;
  credential_count integer DEFAULT 0;
BEGIN
  -- Get customer security settings
  SELECT * INTO settings_row 
  FROM customer_security_settings 
  WHERE customer_profile_id = customer_profile_id_param;
  
  IF NOT FOUND THEN
    -- Return default settings if not configured
    RETURN QUERY SELECT false, false, false, false, 0;
    RETURN;
  END IF;
  
  -- Count active WebAuthn credentials
  SELECT COUNT(*) INTO credential_count
  FROM webauthn_credentials
  WHERE customer_profile_id = customer_profile_id_param AND is_active = true;
  
  RETURN QUERY SELECT 
    settings_row.face_payment_enabled,
    settings_row.biometric_payment_enabled,
    credential_count > 0,
    settings_row.require_dual_factor,
    credential_count;
END;
$$;

-- RPC function for secure challenge generation
CREATE OR REPLACE FUNCTION generate_secure_challenge()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Generate 32 bytes (256 bits) of cryptographically secure random data
  RETURN encode(gen_random_bytes(32), 'base64');
END;
$$;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add update triggers
DROP TRIGGER IF EXISTS update_customer_security_settings_updated_at ON customer_security_settings;
CREATE TRIGGER update_customer_security_settings_updated_at 
  BEFORE UPDATE ON customer_security_settings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_sessions_updated_at ON payment_sessions;
CREATE TRIGGER update_payment_sessions_updated_at 
  BEFORE UPDATE ON payment_sessions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add default security settings for existing customers
INSERT INTO customer_security_settings (customer_profile_id, max_transaction_amount, daily_transaction_limit, face_payment_enabled, biometric_payment_enabled)
SELECT 
  cp.id,
  COALESCE(cp.transaction_limit, 5000.00),
  20000.00,
  true,
  false
FROM customer_profiles cp
WHERE NOT EXISTS (
  SELECT 1 FROM customer_security_settings css WHERE css.customer_profile_id = cp.id
)
ON CONFLICT (customer_profile_id) DO NOTHING;

-- Update existing transactions table to support enhanced authentication
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dual_factor_auth boolean default false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS webauthn_verified boolean default false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS authentication_factors jsonb default '{}';

-- Row Level Security (enable for production)
ALTER TABLE customer_security_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for customer_security_settings
CREATE POLICY "Users can view their own security settings" ON customer_security_settings
  FOR SELECT USING (
    customer_profile_id IN (
      SELECT cp.id FROM customer_profiles cp WHERE cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own security settings" ON customer_security_settings
  FOR UPDATE USING (
    customer_profile_id IN (
      SELECT cp.id FROM customer_profiles cp WHERE cp.user_id = auth.uid()
    )
  );

-- RLS Policies for webauthn_credentials
CREATE POLICY "Users can view their own WebAuthn credentials" ON webauthn_credentials
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own WebAuthn credentials" ON webauthn_credentials
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own WebAuthn credentials" ON webauthn_credentials
  FOR UPDATE USING (user_id = auth.uid());

-- RLS Policies for transaction_authorizations (merchants can view their transactions)
CREATE POLICY "Merchants can view their transaction authorizations" ON transaction_authorizations
  FOR SELECT USING (
    merchant_id IN (
      SELECT mp.id FROM merchant_profiles mp WHERE mp.user_id = auth.uid()
    )
  );

-- RLS Policies for payment_sessions (temporary - merchants can manage their sessions)
CREATE POLICY "Merchants can manage their payment sessions" ON payment_sessions
  FOR ALL USING (
    merchant_id IN (
      SELECT mp.id FROM merchant_profiles mp WHERE mp.user_id = auth.uid()
    )
  );

-- RLS Policies for security_audit_log
CREATE POLICY "Users can view their own audit log" ON security_audit_log
  FOR SELECT USING (user_id = auth.uid());

COMMENT ON TABLE customer_security_settings IS 'Customer-configurable security preferences and transaction limits';
COMMENT ON TABLE webauthn_credentials IS 'WebAuthn credentials for device biometric authentication (NO raw biometric data)';
COMMENT ON TABLE transaction_authorizations IS 'Detailed authentication records for each transaction';
COMMENT ON TABLE payment_sessions IS 'Temporary payment session state with challenges';
COMMENT ON TABLE security_audit_log IS 'Comprehensive security event logging for compliance';