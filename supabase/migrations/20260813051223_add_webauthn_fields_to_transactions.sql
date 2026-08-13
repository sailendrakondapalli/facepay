-- Add WebAuthn fields to transactions table for dual-factor authentication tracking

-- Add new columns to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS webauthn_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS webauthn_credential_id UUID,
ADD COLUMN IF NOT EXISTS dual_factor_auth BOOLEAN DEFAULT FALSE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_transactions_webauthn_verified 
ON transactions(webauthn_verified);

CREATE INDEX IF NOT EXISTS idx_transactions_dual_factor_auth 
ON transactions(dual_factor_auth);

-- Add helpful comment
COMMENT ON COLUMN transactions.webauthn_verified 
IS 'True if payment was authorized using device biometric (Windows Hello/Touch ID/fingerprint)';

COMMENT ON COLUMN transactions.dual_factor_auth 
IS 'True if payment used both face recognition AND device biometric authorization';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Transaction table updated for dual-factor authentication!';
    RAISE NOTICE '🔐 New fields: webauthn_verified, dual_factor_auth';
    RAISE NOTICE '📊 Ready for dual-factor biometric payments';
END $$;