-- WebAuthn Schema - Fix for Partial Migration
-- This script handles the case where tables already exist but setup is incomplete

-- First, let's check what we have and add missing columns/tables safely

-- Add missing columns to webauthn_credentials if they don't exist
DO $$ 
BEGIN
    -- Add aaguid if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'webauthn_credentials' AND column_name = 'aaguid'
    ) THEN
        ALTER TABLE webauthn_credentials ADD COLUMN aaguid TEXT;
        RAISE NOTICE 'Added aaguid column to webauthn_credentials';
    END IF;

    -- Add friendly_name if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'webauthn_credentials' AND column_name = 'friendly_name'
    ) THEN
        ALTER TABLE webauthn_credentials ADD COLUMN friendly_name TEXT;
        RAISE NOTICE 'Added friendly_name column to webauthn_credentials';
    END IF;

    -- Add last_used_at if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'webauthn_credentials' AND column_name = 'last_used_at'
    ) THEN
        ALTER TABLE webauthn_credentials ADD COLUMN last_used_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added last_used_at column to webauthn_credentials';
    END IF;
END $$;

-- Create payment_authorizations table only if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payment_authorizations') THEN
        CREATE TABLE payment_authorizations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES auth.users(id),
          face_similarity DECIMAL(5,4),
          face_embedding_id UUID REFERENCES customer_biometrics(id),
          face_verified_at TIMESTAMP WITH TIME ZONE,
          webauthn_credential_id UUID REFERENCES webauthn_credentials(id),
          webauthn_verified BOOLEAN DEFAULT FALSE,
          webauthn_verified_at TIMESTAMP WITH TIME ZONE,
          challenge TEXT NOT NULL,
          signature BYTEA,
          ip_address INET,
          user_agent TEXT,
          geolocation JSONB,
          risk_score DECIMAL(3,2),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        RAISE NOTICE 'Created payment_authorizations table';
    ELSE
        RAISE NOTICE 'Table payment_authorizations already exists';
    END IF;
END $$;

-- Create webauthn_challenges table only if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'webauthn_challenges') THEN
        CREATE TABLE webauthn_challenges (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          challenge TEXT UNIQUE NOT NULL,
          transaction_data JSONB,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        RAISE NOTICE 'Created webauthn_challenges table';
    ELSE
        RAISE NOTICE 'Table webauthn_challenges already exists';
    END IF;
END $$;

-- Create indexes (IF NOT EXISTS - these are safe to run multiple times)
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id ON webauthn_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_credential_id ON webauthn_credentials(credential_id);
CREATE INDEX IF NOT EXISTS idx_payment_authorizations_user_id ON payment_authorizations(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_authorizations_transaction_id ON payment_authorizations(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_authorizations_created_at ON payment_authorizations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_user_id ON webauthn_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_challenge ON webauthn_challenges(challenge);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires_at ON webauthn_challenges(expires_at);

-- Function to clean up expired challenges
CREATE OR REPLACE FUNCTION cleanup_expired_webauthn_challenges()
RETURNS void AS $$
BEGIN
  DELETE FROM webauthn_challenges WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on all tables (safe to run multiple times)
ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies (ensures correct configuration)
DROP POLICY IF EXISTS "Users can view their own WebAuthn credentials" ON webauthn_credentials;
DROP POLICY IF EXISTS "Users can insert their own WebAuthn credentials" ON webauthn_credentials;
DROP POLICY IF EXISTS "Users can delete their own WebAuthn credentials" ON webauthn_credentials;
DROP POLICY IF EXISTS "Users can update their own WebAuthn credentials" ON webauthn_credentials;
DROP POLICY IF EXISTS "Users can view their own payment authorizations" ON payment_authorizations;
DROP POLICY IF EXISTS "Service role can manage payment authorizations" ON payment_authorizations;
DROP POLICY IF EXISTS "Users can view their own challenges" ON webauthn_challenges;
DROP POLICY IF EXISTS "Service role can manage challenges" ON webauthn_challenges;

-- Create policies
CREATE POLICY "Users can view their own WebAuthn credentials"
  ON webauthn_credentials FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own WebAuthn credentials"
  ON webauthn_credentials FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own WebAuthn credentials"
  ON webauthn_credentials FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own WebAuthn credentials"
  ON webauthn_credentials FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own payment authorizations"
  ON payment_authorizations FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage payment authorizations"
  ON payment_authorizations FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view their own challenges"
  ON webauthn_challenges FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage challenges"
  ON webauthn_challenges FOR ALL USING (auth.role() = 'service_role');

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON webauthn_credentials TO authenticated;
GRANT SELECT ON payment_authorizations TO authenticated;
GRANT SELECT ON webauthn_challenges TO authenticated;

-- Add helpful comments
COMMENT ON TABLE webauthn_credentials IS 'Stores WebAuthn public keys for device biometric authentication. NEVER stores actual biometric data.';
COMMENT ON COLUMN webauthn_credentials.credential_id IS 'WebAuthn credential ID (public identifier)';
COMMENT ON COLUMN webauthn_credentials.public_key IS 'Public key for signature verification. NOT biometric data.';
COMMENT ON COLUMN webauthn_credentials.counter IS 'Signature counter for replay attack prevention';
COMMENT ON TABLE payment_authorizations IS 'Tracks dual-factor biometric payment authorizations (face + device biometric)';
COMMENT ON TABLE webauthn_challenges IS 'Temporary storage for WebAuthn challenges (expires after 5 minutes)';

-- Final success message
DO $$ 
BEGIN
    RAISE NOTICE '✅ WebAuthn schema fix completed successfully!';
    RAISE NOTICE '📊 Summary: All missing tables and columns have been added';
    RAISE NOTICE '🔐 RLS policies configured correctly';
    RAISE NOTICE '✨ Database is ready for WebAuthn implementation';
END $$;
