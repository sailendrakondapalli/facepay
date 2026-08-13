-- WebAuthn Schema - Complete Fresh Start
-- This script drops everything and recreates from scratch

-- Step 1: Drop all existing tables (if they exist) in reverse dependency order
DROP TABLE IF EXISTS payment_authorizations CASCADE;
DROP TABLE IF EXISTS webauthn_challenges CASCADE;
DROP TABLE IF EXISTS webauthn_credentials CASCADE;

-- Step 2: Create webauthn_credentials table
CREATE TABLE webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- WebAuthn credential data
  credential_id TEXT UNIQUE NOT NULL,  -- Base64URL encoded credential ID
  public_key BYTEA NOT NULL,            -- User's public key (NOT biometric data)
  counter BIGINT DEFAULT 0,             -- Signature counter for replay attack prevention
  
  -- Device information
  transports TEXT[],                    -- ['usb', 'nfc', 'ble', 'internal']
  device_type TEXT DEFAULT 'platform',  -- 'platform' (built-in) or 'cross-platform' (security key)
  aaguid TEXT,                          -- Authenticator AAGUID
  
  -- Metadata
  friendly_name TEXT,                   -- User-friendly name (e.g., "Windows Hello", "Touch ID")
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

-- Step 3: Create payment_authorizations table
CREATE TABLE payment_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Face identification (WHO)
  face_similarity DECIMAL(5,4),
  face_embedding_id UUID REFERENCES customer_biometrics(id),
  face_verified_at TIMESTAMP WITH TIME ZONE,
  
  -- Device biometric authorization (PROOF)
  webauthn_credential_id UUID REFERENCES webauthn_credentials(id),
  webauthn_verified BOOLEAN DEFAULT FALSE,
  webauthn_verified_at TIMESTAMP WITH TIME ZONE,
  challenge TEXT NOT NULL,
  signature BYTEA,
  
  -- Security metadata
  ip_address INET,
  user_agent TEXT,
  geolocation JSONB,
  risk_score DECIMAL(3,2),  -- 0.00 to 1.00
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 4: Create webauthn_challenges table
CREATE TABLE webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge TEXT UNIQUE NOT NULL,
  transaction_data JSONB,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 5: Create indexes
CREATE INDEX idx_webauthn_credentials_user_id ON webauthn_credentials(user_id);
CREATE INDEX idx_webauthn_credentials_credential_id ON webauthn_credentials(credential_id);
CREATE INDEX idx_payment_authorizations_user_id ON payment_authorizations(user_id);
CREATE INDEX idx_payment_authorizations_transaction_id ON payment_authorizations(transaction_id);
CREATE INDEX idx_payment_authorizations_created_at ON payment_authorizations(created_at DESC);
CREATE INDEX idx_webauthn_challenges_user_id ON webauthn_challenges(user_id);
CREATE INDEX idx_webauthn_challenges_challenge ON webauthn_challenges(challenge);
CREATE INDEX idx_webauthn_challenges_expires_at ON webauthn_challenges(expires_at);

-- Step 6: Create cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_webauthn_challenges()
RETURNS void AS $$
BEGIN
  DELETE FROM webauthn_challenges WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Step 7: Enable Row Level Security
ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- Step 8: Create RLS policies for webauthn_credentials
CREATE POLICY "Users can view their own WebAuthn credentials"
  ON webauthn_credentials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own WebAuthn credentials"
  ON webauthn_credentials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own WebAuthn credentials"
  ON webauthn_credentials FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own WebAuthn credentials"
  ON webauthn_credentials FOR UPDATE
  USING (auth.uid() = user_id);

-- Step 9: Create RLS policies for payment_authorizations
CREATE POLICY "Users can view their own payment authorizations"
  ON payment_authorizations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage payment authorizations"
  ON payment_authorizations FOR ALL
  USING (auth.role() = 'service_role');

-- Step 10: Create RLS policies for webauthn_challenges
CREATE POLICY "Users can view their own challenges"
  ON webauthn_challenges FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage challenges"
  ON webauthn_challenges FOR ALL
  USING (auth.role() = 'service_role');

-- Step 11: Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON webauthn_credentials TO authenticated;
GRANT SELECT ON payment_authorizations TO authenticated;
GRANT SELECT ON webauthn_challenges TO authenticated;

-- Step 12: Add helpful comments
COMMENT ON TABLE webauthn_credentials IS 'Stores WebAuthn public keys for device biometric authentication. NEVER stores actual biometric data.';
COMMENT ON COLUMN webauthn_credentials.credential_id IS 'WebAuthn credential ID (public identifier)';
COMMENT ON COLUMN webauthn_credentials.public_key IS 'Public key for signature verification. NOT biometric data.';
COMMENT ON COLUMN webauthn_credentials.counter IS 'Signature counter for replay attack prevention';
COMMENT ON TABLE payment_authorizations IS 'Tracks dual-factor biometric payment authorizations (face + device biometric)';
COMMENT ON TABLE webauthn_challenges IS 'Temporary storage for WebAuthn challenges (expires after 5 minutes)';

-- Success message
DO $$ 
BEGIN
    RAISE NOTICE '✅ WebAuthn schema created successfully from scratch!';
    RAISE NOTICE '📊 Created 3 tables: webauthn_credentials, payment_authorizations, webauthn_challenges';
    RAISE NOTICE '🔐 RLS policies configured';
    RAISE NOTICE '✨ Database is ready for WebAuthn implementation';
END $$;