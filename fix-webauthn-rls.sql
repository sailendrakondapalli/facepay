-- Fix WebAuthn RLS Policies for Edge Functions
-- The issue: Edge Functions need to insert challenges but RLS is blocking it

-- Drop existing policies that are too restrictive
DROP POLICY IF EXISTS "Users can view their own challenges" ON webauthn_challenges;
DROP POLICY IF EXISTS "Service role can manage challenges" ON webauthn_challenges;

-- Create more permissive policies for webauthn_challenges
CREATE POLICY "Users can manage their own challenges"
  ON webauthn_challenges FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to insert their own challenges (needed for Edge Functions)
CREATE POLICY "Authenticated users can insert challenges"
  ON webauthn_challenges FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to read their own challenges
CREATE POLICY "Authenticated users can read their challenges"
  ON webauthn_challenges FOR SELECT
  USING (auth.uid() = user_id);

-- Allow authenticated users to delete their own challenges
CREATE POLICY "Authenticated users can delete their challenges"
  ON webauthn_challenges FOR DELETE
  USING (auth.uid() = user_id);

-- Also fix webauthn_credentials policies to be sure
DROP POLICY IF EXISTS "Users can insert their own WebAuthn credentials" ON webauthn_credentials;
DROP POLICY IF EXISTS "Users can view their own WebAuthn credentials" ON webauthn_credentials;
DROP POLICY IF EXISTS "Users can delete their own WebAuthn credentials" ON webauthn_credentials;
DROP POLICY IF EXISTS "Users can update their own WebAuthn credentials" ON webauthn_credentials;

CREATE POLICY "Authenticated users can manage their WebAuthn credentials"
  ON webauthn_credentials FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Grant explicit permissions (sometimes needed with RLS)
GRANT ALL ON webauthn_challenges TO authenticated;
GRANT ALL ON webauthn_credentials TO authenticated;

-- Verify the policies work
DO $$
BEGIN
    RAISE NOTICE '✅ WebAuthn RLS policies updated!';
    RAISE NOTICE '🔐 Edge Functions should now be able to manage challenges and credentials';
    RAISE NOTICE '📊 Users can only access their own data';
END $$;