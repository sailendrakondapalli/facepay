-- Strengthen Database Constraints for Face Recognition Security
-- Run this in your Supabase SQL editor to add data integrity constraints

-- ============================================================================
-- 1. ENSURE UNIQUE USER ENROLLMENTS
-- ============================================================================

-- Add unique constraint on user_id in customer_biometrics (one face per user)
-- This prevents the same auth user from enrolling multiple times
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'customer_biometrics_user_id_key'
    ) THEN
        ALTER TABLE customer_biometrics 
        ADD CONSTRAINT customer_biometrics_user_id_key UNIQUE (user_id);
        RAISE NOTICE 'Added unique constraint on customer_biometrics.user_id';
    ELSE
        RAISE NOTICE 'Unique constraint on customer_biometrics.user_id already exists';
    END IF;
END $$;

-- Add unique constraint on customer_profiles.facepay_id
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'customer_profiles_facepay_id_unique'
    ) THEN
        -- First remove any duplicate facepay_ids if they exist
        UPDATE customer_profiles cp1
        SET facepay_id = cp1.user_id::text || '-' || EXTRACT(EPOCH FROM NOW())::text
        WHERE EXISTS (
            SELECT 1 FROM customer_profiles cp2
            WHERE cp2.facepay_id = cp1.facepay_id
            AND cp2.id < cp1.id
        );
        
        ALTER TABLE customer_profiles 
        ADD CONSTRAINT customer_profiles_facepay_id_unique UNIQUE (facepay_id);
        RAISE NOTICE 'Added unique constraint on customer_profiles.facepay_id';
    ELSE
        RAISE NOTICE 'Unique constraint on customer_profiles.facepay_id already exists';
    END IF;
END $$;

-- ============================================================================
-- 2. ADD CHECK CONSTRAINTS FOR DATA QUALITY
-- ============================================================================

-- Ensure quality_score is between 0 and 1
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'customer_biometrics_quality_score_check'
    ) THEN
        ALTER TABLE customer_biometrics 
        ADD CONSTRAINT customer_biometrics_quality_score_check 
        CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 1));
        RAISE NOTICE 'Added quality_score check constraint';
    ELSE
        RAISE NOTICE 'Quality_score check constraint already exists';
    END IF;
END $$;

-- Ensure biometric_similarity is between 0 and 1
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'transactions_biometric_similarity_check'
    ) THEN
        ALTER TABLE transactions 
        ADD CONSTRAINT transactions_biometric_similarity_check 
        CHECK (biometric_similarity IS NULL OR (biometric_similarity >= 0 AND biometric_similarity <= 1));
        RAISE NOTICE 'Added biometric_similarity check constraint';
    ELSE
        RAISE NOTICE 'Biometric_similarity check constraint already exists';
    END IF;
END $$;

-- Ensure transaction amount is positive
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'transactions_amount_positive'
    ) THEN
        ALTER TABLE transactions 
        ADD CONSTRAINT transactions_amount_positive 
        CHECK (amount > 0);
        RAISE NOTICE 'Added transaction amount positive check constraint';
    ELSE
        RAISE NOTICE 'Transaction amount positive check constraint already exists';
    END IF;
END $$;

-- Ensure transaction_limit is positive
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'customer_profiles_transaction_limit_positive'
    ) THEN
        ALTER TABLE customer_profiles 
        ADD CONSTRAINT customer_profiles_transaction_limit_positive 
        CHECK (transaction_limit > 0);
        RAISE NOTICE 'Added transaction_limit positive check constraint';
    ELSE
        RAISE NOTICE 'Transaction_limit positive check constraint already exists';
    END IF;
END $$;

-- ============================================================================
-- 3. ADD INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index on customer_profiles.user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_customer_profiles_user_id 
ON customer_profiles(user_id);

-- Index on customer_biometrics.user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_customer_biometrics_user_id 
ON customer_biometrics(user_id);

-- Index on transactions.customer_id for fast merchant queries
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id 
ON transactions(customer_id);

-- Index on transactions.merchant_id for fast merchant queries
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_id 
ON transactions(merchant_id);

-- Index on transactions.created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_transactions_created_at 
ON transactions(created_at DESC);

-- Index on customer_profiles.facepay_enabled for quick filtering
CREATE INDEX IF NOT EXISTS idx_customer_profiles_facepay_enabled 
ON customer_profiles(facepay_enabled) 
WHERE facepay_enabled = true;

-- ============================================================================
-- 4. ADD TRIGGERS FOR DATA INTEGRITY
-- ============================================================================

-- Auto-generate facepay_id if not provided
CREATE OR REPLACE FUNCTION generate_facepay_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.facepay_id IS NULL OR NEW.facepay_id = '' THEN
        NEW.facepay_id := 'FP-' || UPPER(SUBSTRING(NEW.user_id::text, 1, 8)) || '-' || LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_facepay_id ON customer_profiles;
CREATE TRIGGER trigger_generate_facepay_id
    BEFORE INSERT ON customer_profiles
    FOR EACH ROW
    EXECUTE FUNCTION generate_facepay_id();

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_customer_biometrics_timestamp ON customer_biometrics;
CREATE TRIGGER trigger_update_customer_biometrics_timestamp
    BEFORE UPDATE ON customer_biometrics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 5. CLEAN UP EXISTING DATA (OPTIONAL - BE CAREFUL!)
-- ============================================================================

-- Remove duplicate customer_biometrics entries (keep the newest one)
-- Uncomment the following block ONLY if you want to clean up duplicates
/*
DELETE FROM customer_biometrics cb1
WHERE EXISTS (
    SELECT 1 FROM customer_biometrics cb2
    WHERE cb2.user_id = cb1.user_id
    AND cb2.created_at > cb1.created_at
);
*/

-- ============================================================================
-- 6. VERIFICATION QUERIES
-- ============================================================================

-- Check for duplicate user enrollments
SELECT 
    user_id, 
    COUNT(*) as enrollment_count,
    STRING_AGG(id::text, ', ') as biometric_ids
FROM customer_biometrics
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Check for users without customer profiles
SELECT 
    cb.user_id,
    cb.id as biometric_id
FROM customer_biometrics cb
LEFT JOIN customer_profiles cp ON cb.user_id = cp.user_id
WHERE cp.id IS NULL;

-- Check data quality statistics
SELECT 
    COUNT(*) as total_enrollments,
    AVG(quality_score) as avg_quality,
    MIN(quality_score) as min_quality,
    MAX(quality_score) as max_quality,
    COUNT(CASE WHEN quality_score < 0.6 THEN 1 END) as low_quality_count
FROM customer_biometrics;

-- Check for duplicate facepay_ids
SELECT 
    facepay_id, 
    COUNT(*) as count
FROM customer_profiles
WHERE facepay_id IS NOT NULL
GROUP BY facepay_id
HAVING COUNT(*) > 1;

-- Display constraint summary
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    tc.table_name,
    kcu.column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
AND tc.table_name IN ('customer_profiles', 'customer_biometrics', 'transactions')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================
DO $$ 
BEGIN
    RAISE NOTICE '✅ Database security constraints applied successfully!';
    RAISE NOTICE '📊 Run the verification queries above to check data integrity';
    RAISE NOTICE '🔒 Duplicate enrollments are now prevented at database level';
END $$;
