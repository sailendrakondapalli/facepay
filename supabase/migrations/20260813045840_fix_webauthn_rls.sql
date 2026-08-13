-- Fix WebAuthn RLS Policies - Force Drop and Recreate
-- The issue: Edge Functions need to insert challenges but RLS is blocking it

-- Force drop ALL existing policies
DO $$
DECLARE
    pol record;
BEGIN
    -- Drop all policies on webauthn_challenges
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE tablename = 'webauthn_challenges'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || pol.policyname || '" ON ' || pol.tablename;
    END LOOP;
    
    -- Drop all policies on webauthn_credentials
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE tablename = 'webauthn_credentials'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || pol.policyname || '" ON ' || pol.tablename;
    END LOOP;
END $$;

-- Create simple, working policies for webauthn_challenges
CREATE POLICY "webauthn_challenges_user_access"
  ON webauthn_challenges FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create simple, working policies for webauthn_credentials  
CREATE POLICY "webauthn_credentials_user_access"
  ON webauthn_credentials FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Grant permissions explicitly
GRANT ALL ON webauthn_challenges TO authenticated;
GRANT ALL ON webauthn_credentials TO authenticated;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ WebAuthn RLS policies fixed!';
    RAISE NOTICE '🔐 Edge Functions can now manage challenges and credentials';
END $$;