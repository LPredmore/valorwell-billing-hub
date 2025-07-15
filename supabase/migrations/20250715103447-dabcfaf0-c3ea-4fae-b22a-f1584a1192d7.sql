-- Database Enhancement Plan Implementation for Claim.MD API Integration

-- Migration 1: Add missing client fields
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_middle_name text;

-- Add secondary insurance eligibility fields
ALTER TABLE clients ADD COLUMN IF NOT EXISTS eligibility_status_secondary text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS eligibility_copay_secondary numeric;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS eligibility_deductible_secondary numeric;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS eligibility_coinsurance_secondary_percent numeric;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS eligibility_last_checked_secondary timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS eligibility_response_details_secondary_json jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS eligibility_claimmd_id_secondary text;

-- Add tertiary insurance eligibility fields
ALTER TABLE clients ADD COLUMN IF NOT EXISTS eligibility_status_tertiary text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS eligibility_copay_tertiary numeric;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS eligibility_deductible_tertiary numeric;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS eligibility_coinsurance_tertiary_percent numeric;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS eligibility_last_checked_tertiary timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS eligibility_response_details_tertiary_json jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS eligibility_claimmd_id_tertiary text;

-- Migration 2: Create provider_profiles table
CREATE TABLE IF NOT EXISTS provider_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinician_id uuid REFERENCES clinicians(id) ON DELETE CASCADE,
  npi_number text NOT NULL,
  taxonomy_code text NOT NULL,
  tax_id text,
  license_numbers jsonb DEFAULT '[]'::jsonb,
  specialties text[],
  is_primary boolean DEFAULT false,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(clinician_id, npi_number)
);

-- Enable RLS on provider_profiles
ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for provider_profiles
CREATE POLICY "Clinicians can manage their own provider profiles"
ON provider_profiles
FOR ALL
USING (auth.uid() = clinician_id);

CREATE POLICY "Admins can view all provider profiles"
ON provider_profiles
FOR SELECT
USING (user_has_admin_role(auth.uid()));

-- Migration 3: Create eligibility_audit table
CREATE TABLE IF NOT EXISTS eligibility_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  insurance_level text NOT NULL CHECK (insurance_level IN ('primary', 'secondary', 'tertiary')),
  verification_date timestamptz DEFAULT now(),
  request_payload jsonb,
  response_payload jsonb,
  status text NOT NULL,
  copay numeric,
  deductible numeric,
  coinsurance_percent numeric,
  error_message text,
  claimmd_transaction_id text,
  processing_time_ms integer,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on eligibility_audit
ALTER TABLE eligibility_audit ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for eligibility_audit
CREATE POLICY "Users can view eligibility audit for accessible clients"
ON eligibility_audit
FOR SELECT
USING (
  auth.uid() = client_id OR 
  EXISTS (
    SELECT 1 FROM clients 
    WHERE clients.id = eligibility_audit.client_id 
    AND (clients.client_assigned_therapist)::uuid = auth.uid()
  ) OR 
  user_has_admin_role(auth.uid())
);

CREATE POLICY "System can insert eligibility audit records"
ON eligibility_audit
FOR INSERT
WITH CHECK (true);

-- Migration 4: Create date conversion functions
CREATE OR REPLACE FUNCTION format_date_for_claimmd(input_date date)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN input_date IS NULL THEN ''
    ELSE to_char(input_date, 'YYYYMMDD')
  END;
$$;

CREATE OR REPLACE FUNCTION format_timestamp_for_claimmd(input_timestamp timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN input_timestamp IS NULL THEN ''
    ELSE to_char(input_timestamp, 'YYYYMMDD')
  END;
$$;

-- Function to convert ClaimMD date format back to PostgreSQL date
CREATE OR REPLACE FUNCTION parse_claimmd_date(claimmd_date text)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN claimmd_date IS NULL OR length(claimmd_date) != 8 THEN NULL
    ELSE to_date(claimmd_date, 'YYYYMMDD')
  END;
$$;

-- Migration 5: Create performance indexes
CREATE INDEX IF NOT EXISTS idx_clients_eligibility_primary 
ON clients(eligibility_status_primary, eligibility_last_checked_primary);

CREATE INDEX IF NOT EXISTS idx_clients_eligibility_secondary 
ON clients(eligibility_status_secondary, eligibility_last_checked_secondary);

CREATE INDEX IF NOT EXISTS idx_clients_eligibility_tertiary 
ON clients(eligibility_status_tertiary, eligibility_last_checked_tertiary);

CREATE INDEX IF NOT EXISTS idx_eligibility_audit_client_insurance 
ON eligibility_audit(client_id, insurance_level, verification_date DESC);

CREATE INDEX IF NOT EXISTS idx_provider_profiles_clinician 
ON provider_profiles(clinician_id, is_primary);

CREATE INDEX IF NOT EXISTS idx_clients_middle_name 
ON clients(client_middle_name) WHERE client_middle_name IS NOT NULL;

-- Create composite index for faster eligibility lookups
CREATE INDEX IF NOT EXISTS idx_clients_eligibility_composite
ON clients(id, eligibility_status_primary, eligibility_last_checked_primary, client_insurance_company_primary);

-- Add update trigger for provider_profiles
CREATE TRIGGER update_provider_profiles_updated_at
BEFORE UPDATE ON provider_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();