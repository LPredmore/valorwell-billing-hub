-- Remove redundant provider_profiles table and related objects
DROP TABLE IF EXISTS provider_profiles CASCADE;
DROP INDEX IF EXISTS idx_provider_profiles_clinician;

-- Remove provider_profiles related policies (they're already dropped with CASCADE)
-- The table was redundant since we already have clinicians table with all required provider information