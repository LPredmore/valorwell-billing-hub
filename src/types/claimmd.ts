import { z } from 'zod';

// Core ClaimMD API Types
export interface ClaimMdApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export interface ClaimMdEligibilityResponse {
  elig?: {
    error?: Array<{ error_code?: string; error_mesg?: string }>;
    benefit?: Array<ClaimMdBenefit>;
    plan_date?: string;
    plan_name?: string;
    plan_description?: string;
    plan_number?: string;
    ins_name_f?: string;
    ins_name_l?: string;
    ins_dob?: string;
    ins_sex?: string;
    ins_number?: string;
    eligid?: string;
    [key: string]: any;
  };
  id?: string;
  error?: string | { error_code?: string; error_mesg?: string; [key: string]: any };
  originalErrorData?: { error_code?: string; error_mesg?: string; [key: string]: any };
  [key: string]: any;
}

export interface ClaimMdBenefit {
  benefit_coverage_code?: string;
  benefit_coverage_description?: string;
  benefit_code?: string;
  benefit_amount?: string;
  benefit_percent?: string;
  benefit_level_code?: string;
  [key: string]: any;
}

// Validation Schemas
export const eligibilityRequestSchema = z.object({
  // Provider Information - Required
  prov_npi: z.string().min(10, 'Provider NPI must be at least 10 digits').max(10, 'Provider NPI must be exactly 10 digits'),
  prov_taxid: z.string().min(9, 'Provider Tax ID must be at least 9 characters'),
  prov_lname: z.string().min(1, 'Provider last name is required'),
  prov_fname: z.string().optional(),
  prov_addr_1: z.string().min(1, 'Provider address is required'),
  prov_addr_2: z.string().optional(),
  prov_city: z.string().min(1, 'Provider city is required'),
  prov_state: z.string().length(2, 'Provider state must be 2 characters'),
  prov_zip: z.string().min(5, 'Provider ZIP must be at least 5 digits'),

  // Subscriber Information - Required
  ins_number: z.string().min(1, 'Insurance policy number is required'),
  ins_name_l: z.string().min(1, 'Subscriber last name is required'),
  ins_name_f: z.string().min(1, 'Subscriber first name is required'),
  ins_dob: z.string().regex(/^\d{8}$/, 'Subscriber date of birth must be in YYYYMMDD format'),
  ins_sex: z.enum(['M', 'F', 'U'], { errorMap: () => ({ message: 'Gender must be M, F, or U' }) }),

  // Payer Information - Required
  payerid: z.string().min(1, 'Payer ID is required'),
  ins_name: z.string().min(1, 'Insurance company name is required'),

  // Service Information - Required
  service_type: z.string().default('98'),
  fdos: z.string().regex(/^\d{8}$/, 'From date of service must be in YYYYMMDD format'),
  tdos: z.string().regex(/^\d{8}$/, 'To date of service must be in YYYYMMDD format'),

  // Relationship - Required
  pat_rel: z.string().min(1, 'Patient relationship code is required'),

  // Patient Information - Optional (required only if different from subscriber)
  pat_name_l: z.string().optional(),
  pat_name_f: z.string().optional(),
  pat_dob: z.string().regex(/^\d{8}$/, 'Patient date of birth must be in YYYYMMDD format').optional(),
  pat_sex: z.enum(['M', 'F', 'U']).optional(),

  // Request tracking
  request_id: z.string().min(1, 'Request ID is required'),
});

export const providerDataSchema = z.object({
  practice_npi: z.string().min(10, 'Practice NPI must be at least 10 digits').max(10, 'Practice NPI must be exactly 10 digits'),
  practice_taxid: z.string().min(9, 'Practice Tax ID must be at least 9 characters'),
  practice_name: z.string().min(1, 'Practice name is required'),
  practice_address1: z.string().min(1, 'Practice address is required'),
  practice_address2: z.string().optional(),
  practice_city: z.string().min(1, 'Practice city is required'),
  practice_state: z.string().length(2, 'Practice state must be 2 characters'),
  practice_zip: z.string().min(5, 'Practice ZIP must be at least 5 digits'),
});

export const clientDataSchema = z.object({
  id: z.string().uuid('Client ID must be a valid UUID'),
  
  // Basic client information
  client_first_name: z.string().min(1, 'Client first name is required'),
  client_middle_name: z.string().optional(),
  client_last_name: z.string().min(1, 'Client last name is required'),
  client_date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format'),
  client_gender: z.string().min(1, 'Client gender is required'),

  // Primary insurance information
  client_policy_number_primary: z.string().min(1, 'Primary insurance policy number is required'),
  client_insurance_company_primary: z.string().min(1, 'Primary insurance company is required'),
  client_primary_payer_id: z.string().min(1, 'Primary payer ID is required'),
  
  // Subscriber information
  client_subscriber_relationship_primary: z.string().optional(),
  client_subscriber_name_primary: z.string().optional(),
  client_subscriber_dob_primary: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Subscriber date of birth must be in YYYY-MM-DD format').optional(),

  // Secondary insurance (optional)
  client_policy_number_secondary: z.string().optional(),
  client_insurance_company_secondary: z.string().optional(),
  client_secondary_payer_id: z.string().optional(),
  client_subscriber_relationship_secondary: z.string().optional(),
  client_subscriber_name_secondary: z.string().optional(),
  client_subscriber_dob_secondary: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Subscriber date of birth must be in YYYY-MM-DD format').optional(),

  // Tertiary insurance (optional)
  client_policy_number_tertiary: z.string().optional(),
  client_insurance_company_tertiary: z.string().optional(),
  client_tertiary_payer_id: z.string().optional(),
  client_subscriber_relationship_tertiary: z.string().optional(),
  client_subscriber_name_tertiary: z.string().optional(),
  client_subscriber_dob_tertiary: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Subscriber date of birth must be in YYYY-MM-DD format').optional(),
});

// Type exports
export type EligibilityRequest = z.infer<typeof eligibilityRequestSchema>;
export type ProviderData = z.infer<typeof providerDataSchema>;
export type ClientData = z.infer<typeof clientDataSchema>;

// Validation result types
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: z.ZodError;
  formattedErrors?: Record<string, string[]>;
}

// Eligibility status types
export interface EligibilityStatus {
  status: 'Active' | 'Inactive' | 'Error' | 'Not Found' | 'Info Needed' | 'Unknown';
  copay: number | null;
  deductible: number | null;
  coinsurancePercent: number | null;
  lastChecked?: string;
  claimMdId?: string | null;
}

// Insurance level enum
export enum InsuranceLevel {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
  TERTIARY = 'tertiary'
}

// Error codes mapping
export const CLAIMMD_ERROR_CODES: Record<string, string> = {
  '20': 'API key missing or invalid',
  '50': 'Invalid API endpoint or service',
  '60': 'Missing required parameters',
  '65': 'Invalid insurance information',
  '67': 'Patient not found in insurance database',
  '70': 'Insurance not active',
  '75': 'Subscriber/Insured not found. Verify policy number, name, and date of birth',
  '80': 'Network error or timeout',
  '90': 'Authorization error'
};