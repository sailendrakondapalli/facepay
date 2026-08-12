-- Fix RLS Policies for FacePay
-- Run this in Supabase SQL Editor to fix the 500 errors

-- Temporarily disable RLS for development
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE customer_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;

-- Alternative: Keep RLS but make policies more permissive
-- Uncomment these if you prefer to keep RLS enabled:

/*
-- Drop all existing policies first
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles; 
DROP POLICY IF EXISTS "Anyone can insert profiles during signup" ON profiles;
DROP POLICY IF EXISTS "Customers view own profile" ON customer_profiles;
DROP POLICY IF EXISTS "Anyone can insert customer profiles during signup" ON customer_profiles;
DROP POLICY IF EXISTS "Customers update own profile" ON customer_profiles;
DROP POLICY IF EXISTS "Merchants view own profile" ON merchant_profiles;
DROP POLICY IF EXISTS "Anyone can insert merchant profiles during signup" ON merchant_profiles;
DROP POLICY IF EXISTS "Merchants update own profile" ON merchant_profiles;
DROP POLICY IF EXISTS "Merchants can view customer profiles" ON customer_profiles;
DROP POLICY IF EXISTS "Merchants view all profiles" ON profiles;
DROP POLICY IF EXISTS "Customers view own transactions" ON transactions;
DROP POLICY IF EXISTS "Merchants view own transactions" ON transactions;
DROP POLICY IF EXISTS "Merchants can insert transactions" ON transactions;

-- Create simpler, more permissive policies
CREATE POLICY "Allow all operations on profiles"
  ON profiles FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on customer_profiles" 
  ON customer_profiles FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on merchant_profiles"
  ON merchant_profiles FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on transactions"
  ON transactions FOR ALL USING (true) WITH CHECK (true);
*/