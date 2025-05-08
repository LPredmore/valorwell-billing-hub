
// Shared utility for formatting claims for Claim.MD

/**
 * This module provides functions to format appointment data into claim formats
 * accepted by Claim.MD, including JSON and CSV formats.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { format as formatDate } from "https://deno.land/std@0.204.0/datetime/format.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

// Create a Supabase client with the service role key for server-side operations
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Type definitions for the data structures
interface Appointment {
  id: string;
  client_id: string;
  clinician_id: string;
  type: string;
  status: string;
  start_at: string;
  end_at: string;
  cpt_code: string;
  modifiers?: string[];
  diagnosis_code_pointers?: string;
  place_of_service_code?: string;
  billed_amount?: number;
  claim_status?: string;
}

interface Client {
  id: string;
  client_first_name: string;
  client_last_name: string;
  client_date_of_birth: string;
  client_gender?: string;
  client_policy_number_primary?: string;
  client_group_number_primary?: string;
  client_insurance_company_primary?: string;
  client_primary_payer_id?: string;
  client_subscriber_name_primary?: string;
  client_subscriber_dob_primary?: string;
  client_subscriber_relationship_primary?: string;
  client_diagnosis?: string[];
}

interface Practice {
  id: string;
  practice_name: string;
  practice_npi: string;
  practice_taxid: string;
  practice_taxonomy: string;
  practice_address1: string;
  practice_address2?: string;
  practice_city: string;
  practice_state: string;
  practice_zip: string;
}

interface Clinician {
  id: string;
  clinician_first_name: string;
  clinician_last_name: string;
  clinician_npi_number?: string;
  clinician_taxonomy_code?: string;
}

// Updated interface to match Claim.MD's exact expected format
interface ClaimMDPayload {
  fileid: string;
  claim: Array<{
    claim_id: string;
    pat_first_name: string;
    pat_last_name: string;
    pat_dob: string; // YYYY-MM-DD format
    pat_gender: string; // M or F
    pat_address1?: string;
    pat_city?: string;
    pat_state?: string;
    pat_zip?: string;
    sub_first_name: string;
    sub_last_name: string;
    sub_dob: string; // YYYY-MM-DD format
    sub_rel: string; // Relationship code
    sub_id: string;
    sub_group?: string;
    payer_name: string;
    payer_id?: string;
    bill_taxid: string;
    bill_npi: string;
    bill_name: string;
    bill_taxonomy: string;
    bill_address1: string;
    bill_address2?: string;
    bill_city: string;
    bill_state: string;
    bill_zip: string;
    prov_npi: string;
    prov_name: string;
    prov_taxonomy?: string;
    diag_1?: string;
    diag_2?: string;
    diag_3?: string;
    diag_4?: string;
    diag_5?: string;
    diag_6?: string;
    diag_7?: string;
    diag_8?: string;
    diag_9?: string;
    diag_10?: string;
    diag_11?: string;
    diag_12?: string;
    charge: Array<{
      from_date: string; // YYYY-MM-DD format
      thru_date: string; // YYYY-MM-DD format
      cpt: string;
      mod_1?: string;
      mod_2?: string;
      mod_3?: string;
      mod_4?: string;
      pos: string;
      diag_ref: string;
      charge: string; // Amount as string
    }>;
  }>;
}

/**
 * Formats a date string to YYYY-MM-DD format required by Claim.MD
 * @param dateString Date string in any format
 * @returns Date string in YYYY-MM-DD format
 */
function formatClaimMdDate(dateString: string): string {
  if (!dateString) return '';
  
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Format to YYYY-MM-DD
    return formatDate(date, "yyyy-MM-dd");
  } catch (error) {
    console.error(`Error formatting date ${dateString}:`, error);
    return '';
  }
}

/**
 * Maps relationship value to proper EDI code for Claim.MD
 * @param relationship Relationship description
 * @returns EDI relationship code
 */
function mapRelationshipToCode(relationship: string | null | undefined): string {
  if (!relationship) return '18'; // Default to Self
  
  const rel = relationship.toLowerCase();
  if (rel.includes('self')) return '18';  // Self
  if (rel.includes('spouse')) return '01'; // Spouse
  if (rel.includes('child')) return '19';  // Child
  if (rel.includes('other')) return 'G8';  // Other relationship
  
  return '18'; // Default to Self if unknown
}

/**
 * Formats gender value to M/F format required by Claim.MD
 * @param gender Gender value
 * @returns Single character gender code
 */
function formatGender(gender: string | null | undefined): string {
  if (!gender) return 'U';
  
  if (gender.toLowerCase().startsWith('f')) return 'F';
  if (gender.toLowerCase().startsWith('m')) return 'M';
  
  return 'U'; // Unknown if not specified
}

/**
 * Formats a diagnosis code by removing decimal points and converting to uppercase
 * @param code ICD-10 diagnosis code
 * @returns Formatted diagnosis code
 */
function formatDiagnosisCode(code: string): string {
  if (!code) return '';
  return code.replace('.', '').toUpperCase();
}

/**
 * Formats tax ID by removing any hyphens
 * @param taxId Tax ID with possible hyphens
 * @returns Clean tax ID without hyphens
 */
function formatTaxId(taxId: string | undefined): string {
  if (!taxId) return '';
  return taxId.replace(/-/g, '');
}

/**
 * Fetches all data required for a claim from the appointment ID
 */
export async function fetchClaimData(appointmentId: string) {
  // Fetch the appointment
  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .single();
  
  if (appointmentError) {
    throw new Error(`Error fetching appointment: ${appointmentError.message}`);
  }
  
  if (!appointment) {
    throw new Error(`Appointment not found with ID: ${appointmentId}`);
  }

  // Fetch the client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', appointment.client_id)
    .single();
  
  if (clientError) {
    throw new Error(`Error fetching client: ${clientError.message}`);
  }
  
  // Fetch the practice info
  const { data: practiceInfo, error: practiceError } = await supabase
    .from('practiceinfo')
    .select('*')
    .single();
  
  if (practiceError) {
    throw new Error(`Error fetching practice info: ${practiceError.message}`);
  }
  
  // Fetch the clinician
  const { data: clinician, error: clinicianError } = await supabase
    .from('clinicians')
    .select('*')
    .eq('id', appointment.clinician_id)
    .single();
  
  if (clinicianError) {
    throw new Error(`Error fetching clinician: ${clinicianError.message}`);
  }
  
  return {
    appointment,
    client,
    practice: practiceInfo,
    clinician
  };
}

/**
 * Formats the appointment data into a JSON claim object for Claim.MD,
 * following the exact structure specified in their documentation
 */
export function formatClaimJSON(data: {
  appointment: Appointment;
  client: Client;
  practice: Practice;
  clinician: Clinician;
}): any {
  const { appointment, client, practice, clinician } = data;
  
  // Parse diagnosis code pointers (e.g., "1,2" to ["1", "2"])
  const diagnosisPointers = appointment.diagnosis_code_pointers 
    ? appointment.diagnosis_code_pointers.split(',').map(p => p.trim())
    : ['1']; // Default to first diagnosis if not specified
  
  // Format date for claim in YYYY-MM-DD format
  const serviceDate = formatClaimMdDate(appointment.start_at);
  
  // Use client's diagnoses or default, ensuring they're properly formatted
  const diagnoses = (client.client_diagnosis || []).map(formatDiagnosisCode);
  
  // Handle modifiers - ensure it's an array, not null
  const modifiers = appointment.modifiers || [];
  
  // Correct typo in the practice city from "Sherdan" to "Sheridan"
  const practiceCity = practice.practice_city === "Sherdan" ? "Sheridan" : practice.practice_city;
  
  // Create a single claim object with the exact structure Claim.MD expects
  const claimObject = {
    claim_id: appointment.id,
    pat_first_name: client.client_first_name,
    pat_last_name: client.client_last_name,
    pat_dob: formatClaimMdDate(client.client_date_of_birth),
    pat_gender: formatGender(client.client_gender),
    
    // Subscriber information
    sub_first_name: client.client_subscriber_name_primary ? 
      client.client_subscriber_name_primary.split(' ')[0] : 
      client.client_first_name,
    sub_last_name: client.client_subscriber_name_primary ? 
      client.client_subscriber_name_primary.split(' ').slice(1).join(' ') : 
      client.client_last_name,
    sub_dob: formatClaimMdDate(client.client_subscriber_dob_primary || client.client_date_of_birth),
    sub_rel: mapRelationshipToCode(client.client_subscriber_relationship_primary),
    sub_id: client.client_policy_number_primary || '',
    sub_group: client.client_group_number_primary || undefined,
    
    // Payer information
    payer_name: client.client_insurance_company_primary || 'Unknown',
    payer_id: client.client_primary_payer_id || undefined,
    
    // Billing provider information (using bill_ prefix)
    bill_taxid: formatTaxId(practice.practice_taxid),
    bill_npi: practice.practice_npi,
    bill_name: practice.practice_name,
    bill_taxonomy: practice.practice_taxonomy,
    bill_address1: practice.practice_address1,
    bill_address2: practice.practice_address2 || undefined,
    bill_city: practiceCity,
    bill_state: practice.practice_state,
    bill_zip: practice.practice_zip,
    
    // Rendering provider information (using prov_ prefix)
    prov_npi: clinician.clinician_npi_number || practice.practice_npi,
    prov_name: `${clinician.clinician_first_name} ${clinician.clinician_last_name}`,
    prov_taxonomy: clinician.clinician_taxonomy_code || practice.practice_taxonomy,
    
    // Diagnosis codes
    ...(diagnoses.length >= 1 && { diag_1: diagnoses[0] }),
    ...(diagnoses.length >= 2 && { diag_2: diagnoses[1] }),
    ...(diagnoses.length >= 3 && { diag_3: diagnoses[2] }),
    ...(diagnoses.length >= 4 && { diag_4: diagnoses[3] }),
    ...(diagnoses.length >= 5 && { diag_5: diagnoses[4] }),
    ...(diagnoses.length >= 6 && { diag_6: diagnoses[5] }),
    ...(diagnoses.length >= 7 && { diag_7: diagnoses[6] }),
    ...(diagnoses.length >= 8 && { diag_8: diagnoses[7] }),
    ...(diagnoses.length >= 9 && { diag_9: diagnoses[8] }),
    ...(diagnoses.length >= 10 && { diag_10: diagnoses[9] }),
    ...(diagnoses.length >= 11 && { diag_11: diagnoses[10] }),
    ...(diagnoses.length >= 12 && { diag_12: diagnoses[11] }),
    
    // Service/charge information
    charge: [
      {
        from_date: serviceDate,
        thru_date: serviceDate, // Same as from_date for single-day services
        cpt: appointment.cpt_code,
        ...(modifiers.length >= 1 && { mod_1: modifiers[0] }),
        ...(modifiers.length >= 2 && { mod_2: modifiers[1] }),
        ...(modifiers.length >= 3 && { mod_3: modifiers[2] }),
        ...(modifiers.length >= 4 && { mod_4: modifiers[3] }),
        pos: appointment.place_of_service_code || '11', // Default to office (11)
        diag_ref: diagnosisPointers.join(','),
        charge: (appointment.billed_amount || 0).toString() // Format as string
      }
    ]
  };
  
  return claimObject;
}

/**
 * Formats multiple claims into a batch JSON for submission
 * with the exact structure Claim.MD expects
 */
export function formatClaimBatchJSON(claims: any[]): ClaimMDPayload {
  // Create a unique file ID based on timestamp
  const fileId = `claims_${new Date().toISOString().replace(/[-:TZ.]/g, '')}`;
  
  return {
    fileid: fileId,
    claim: claims
  };
}

/**
 * Formats the appointment data into a CSV row for Claim.MD
 * Note: This is a simplified CSV format and may need adjustment based on Claim.MD's exact specifications
 */
export function formatClaimCSV(data: {
  appointment: Appointment;
  client: Client;
  practice: Practice;
  clinician: Clinician;
}): string {
  const json = formatClaimJSON(data);
  
  // Format a CSV row based on the JSON data
  // This would need to be expanded based on the exact CSV format required by Claim.MD
  const csvRow = [
    json.claim_id,
    json.pat_first_name,
    json.pat_last_name,
    json.pat_dob,
    json.pat_gender,
    json.sub_id,
    json.sub_group || '',
    json.payer_name,
    json.payer_id || '',
    json.bill_npi,
    json.charge[0].from_date,
    json.charge[0].cpt,
    [json.charge[0].mod_1, json.charge[0].mod_2, json.charge[0].mod_3, json.charge[0].mod_4].filter(Boolean).join('|'),
    json.charge[0].pos,
    json.charge[0].charge,
    [json.diag_1, json.diag_2, json.diag_3, json.diag_4].filter(Boolean).join('|')
  ].join(',');
  
  return csvRow;
}

/**
 * Formats multiple claims into a batch CSV for submission
 */
export function formatClaimBatchCSV(claimDataArray: Array<{
  appointment: Appointment;
  client: Client;
  practice: Practice;
  clinician: Clinician;
}>): string {
  // Define CSV header
  const csvHeader = [
    'claim_id',
    'pat_first_name',
    'pat_last_name',
    'pat_dob',
    'pat_gender',
    'sub_id',
    'sub_group',
    'payer_name',
    'payer_id',
    'provider_npi',
    'service_date',
    'cpt_code',
    'modifiers',
    'place_of_service',
    'charge_amount',
    'diagnoses'
  ].join(',');
  
  // Create CSV rows for each claim
  const csvRows = claimDataArray.map(data => formatClaimCSV(data));
  
  // Combine header and rows
  return [csvHeader, ...csvRows].join('\n');
}
