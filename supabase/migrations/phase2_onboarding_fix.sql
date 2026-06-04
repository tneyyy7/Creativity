-- Migration to add robust onboarding state to profiles

-- 1. Add the column allowing NULL initially
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_onboarding_completed BOOLEAN;

-- 2. Mark all existing users as having completed onboarding 
-- so they aren't forced through the new flow
UPDATE profiles SET is_onboarding_completed = true WHERE is_onboarding_completed IS NULL;

-- 3. Now set the default for new users and make it NOT NULL
ALTER TABLE profiles ALTER COLUMN is_onboarding_completed SET DEFAULT false;
ALTER TABLE profiles ALTER COLUMN is_onboarding_completed SET NOT NULL;
