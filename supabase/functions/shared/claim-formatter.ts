
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
  // Client address fields used for claim submissions
  client_address1?: string;
  client_address2?: string;
  client_city?: string;
  client_state?: string;
  client_zipcode?: string; // Note: using client_zipcode instead of client_zip
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
    pcn: string; // Patient Account/Control Number - Required
    pat_name_f: string;
    pat_name_l: string;
    pat_dob: string; // YYYY-MM-DD format
    pat_sex: string; // M or F
    pat_addr_1: string;
    pat_city: string;
    pat_state: string;
    pat_zip: string;
    ins_name_f: string;
    ins_name_l: string;
    ins_dob: string; // YYYY-MM-DD format
    pat_rel: string; // Relationship code
    ins_number: string;
    ins_group?: string;
    ins_addr_1: string;
    ins_city: string;
    ins_state: string;
    ins_zip: string;
    payer_id?: string;
    bill_taxid: string;
    bill_taxid_type: string; // Required - E or S
    bill_npi: string;
    bill_name: string;
    bill_taxonomy: string;
    bill_addr_1: string;
    bill_addr_2?: string;
    bill_city: string;
    bill_state: string;
    bill_zip: string;
    prov_npi: string;
    prov_name_f: string; // First name of rendering provider
    prov_name_l: string; // Last name of rendering provider
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
    total_charge: string; // Total charge amount as string
    accept_assign: string; // Y/N
    charge: Array<{
      from_date: string; // YYYY-MM-DD format
      thru_date: string; // YYYY-MM-DD format
      proc_code: string; // Procedure code instead of cpt
      mod_1?: string;
      mod_2?: string;
      mod_3?: string;
      mod_4?: string;
      place_of_service: string; // Full field name instead of pos
      diag_ref: string;
      units: string; // Required - number of units as string
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
 * Converts a full state name to its two-letter postal abbreviation
 * @param stateName Full state name
 * @returns Two-letter state abbreviation
 */
function convertStateToAbbreviation(stateName: string | undefined): string {
  if (!stateName) return '';
  
  const stateMap: {[key: string]: string} = {
    'alabama': 'AL',
    'alaska': 'AK',
    'arizona': 'AZ',
    'arkansas': 'AR',
    'california': 'CA',
    'colorado': 'CO',
    'connecticut': 'CT',
    'delaware': 'DE',
    'florida': 'FL',
    'georgia': 'GA',
    'hawaii': 'HI',
    'idaho': 'ID',
    'illinois': 'IL',
    'indiana': 'IN',
    'iowa': 'IA',
    'kansas': 'KS',
    'kentucky': 'KY',
    'louisiana': 'LA',
    'maine': 'ME',
    'maryland': 'MD',
    'massachusetts': 'MA',
    'michigan': 'MI',
    'minnesota': 'MN',
    'mississippi': 'MS',
    'missouri': 'MO',
    'montana': 'MT',
    'nebraska': 'NE',
    'nevada': 'NV',
    'new hampshire': 'NH',
    'new jersey': 'NJ',
    'new mexico': 'NM',
    'new york': 'NY',
    'north carolina': 'NC',
    'north dakota': 'ND',
    'ohio': 'OH',
    'oklahoma': 'OK',
    'oregon': 'OR',
    'pennsylvania': 'PA',
    'rhode island': 'RI',
    'south carolina': 'SC',
    'south dakota': 'SD',
    'tennessee': 'TN',
    'texas': 'TX',
    'utah': 'UT',
    'vermont': 'VT',
    'virginia': 'VA',
    'washington': 'WA',
    'west virginia': 'WV',
    'wisconsin': 'WI',
    'wyoming': 'WY',
    'district of columbia': 'DC',
    'american samoa': 'AS',
    'guam': 'GU',
    'northern mariana islands': 'MP',
    'puerto rico': 'PR',
    'united states minor outlying islands': 'UM',
    'u.s. virgin islands': 'VI',
  };
  
  // Check if input is already a valid two-letter state code
  if (stateName.length === 2 && /^[A-Z]{2}$/.test(stateName.toUpperCase())) {
    return stateName.toUpperCase();
  }
  
  const normalizedState = stateName.trim().toLowerCase();
  return stateMap[normalizedState] || '';
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
  
  // Make sure practice city is correctly spelled
  const practiceCity = practice.practice_city === "Sherdan" ? "Sheridan" : practice.practice_city;
  
  // Split provider name into first and last name
  const providerNameParts = clinician.clinician_first_name && clinician.clinician_last_name ? 
    [clinician.clinician_first_name, clinician.clinician_last_name] : 
    (clinician.clinician_first_name || '').split(' ');
  
  const providerFirstName = providerNameParts[0] || 'Unknown';
  const providerLastName = providerNameParts.length > 1 ? providerNameParts.slice(1).join(' ') : 'Provider';
  
  // Split subscriber name into first and last name if available
  let subscriberFirstName = client.client_first_name || '';
  let subscriberLastName = client.client_last_name || '';
  
  if (client.client_subscriber_name_primary) {
    const parts = client.client_subscriber_name_primary.split(' ');
    subscriberFirstName = parts[0] || subscriberFirstName;
    subscriberLastName = parts.length > 1 ? parts.slice(1).join(' ') : subscriberLastName;
  }
  
  // Calculate total charge amount from service lines
  const chargeAmount = appointment.billed_amount || 0;
  const totalChargeString = chargeAmount.toFixed(2); // Format as "150.00"
  
  // Use client address fields directly from the client table
  // If missing, fall back to practice address
  const clientAddr1 = client.client_address1 || practice.practice_address1 || "123 Main St";
  const clientCity = client.client_city || practice.practice_city || "Anytown";
  
  // Ensure state is properly formatted as a two-letter code
  const clientState = convertStateToAbbreviation(client.client_state || practice.practice_state || "WY");
  // Use client_zipcode instead of client_zip
  const clientZip = client.client_zipcode || practice.practice_zip || "10001";
  
  // Log the client's primary payer ID from the database
  console.log(`CRITICAL - Client primary payer ID from database: ${client.client_primary_payer_id || 'NOT SET IN DATABASE'}`);
  
  // Create a single claim object with the exact structure Claim.MD expects
  const claimObject = {
    remote_claimid: appointment.id, // Using appointment ID as remote_claimid
    pcn: appointment.id, // Using appointment ID as patient control number
    
    // Patient information
    pat_name_f: client.client_first_name,
    pat_name_l: client.client_last_name,
    pat_dob: formatClaimMdDate(client.client_date_of_birth),
    pat_sex: formatGender(client.client_gender),
    pat_addr_1: clientAddr1,
    pat_city: clientCity, 
    pat_state: clientState,
    pat_zip: clientZip,
    
    // Subscriber/Insured information
    ins_name_f: subscriberFirstName,
    ins_name_l: subscriberLastName,
    ins_dob: formatClaimMdDate(client.client_subscriber_dob_primary || client.client_date_of_birth),
    pat_rel: mapRelationshipToCode(client.client_subscriber_relationship_primary),
    ins_number: client.client_policy_number_primary || 'UNKNOWN',
    ins_group: client.client_group_number_primary || undefined,
    ins_addr_1: clientAddr1,
    ins_city: clientCity,
    ins_state: clientState,
    ins_zip: clientZip,
    
    // Payer information
    // REMOVING payer_name as requested to test if this resolves the issue
    payer_id: client.client_primary_payer_id || '', // Using client's payer ID from the database
    
    // Billing provider information (using bill_ prefix)
    bill_taxid: formatTaxId(practice.practice_taxid),
    bill_taxid_type: "E", // Always use "E" for Employer ID Number
    bill_npi: practice.practice_npi,
    bill_name: practice.practice_name,
    bill_taxonomy: practice.practice_taxonomy,
    bill_addr_1: practice.practice_address1,
    bill_addr_2: practice.practice_address2 || undefined,
    bill_city: practiceCity,
    bill_state: convertStateToAbbreviation(practice.practice_state),
    bill_zip: practice.practice_zip,
    
    // Rendering provider information (using prov_ prefix)
    prov_npi: clinician.clinician_npi_number || practice.practice_npi,
    prov_name_f: providerFirstName,
    prov_name_l: providerLastName,
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
    
    // Accept Assignment - required field
    accept_assign: "Y",
    
    // Total charge amount - required field
    total_charge: totalChargeString,
    
    // Service/charge information
    charge: [
      {
        from_date: serviceDate,
        thru_date: serviceDate, // Same as from_date for single-day services
        proc_code: appointment.cpt_code,
        ...(modifiers.length >= 1 && { mod_1: modifiers[0] }),
        ...(modifiers.length >= 2 && { mod_2: modifiers[1] }),
        ...(modifiers.length >= 3 && { mod_3: modifiers[2] }),
        ...(modifiers.length >= 4 && { mod_4: modifiers[3] }),
        place_of_service: appointment.place_of_service_code || '11', // Default to office (11)
        diag_ref: diagnosisPointers.join(','),
        units: "1", // Default to 1 unit - required field
        charge: chargeAmount.toFixed(2) // Format as string with 2 decimal places
      }
    ]
  };
  
  // Add additional verification logs for address data
  console.log(`CRITICAL - Verifying address data for client ${client.id}:`);
  console.log(`  Client Address1: ${clientAddr1}`);
  console.log(`  Client City: ${clientCity}`);
  console.log(`  Client State: ${clientState}`);
  console.log(`  Client Zip: ${clientZip}`);
  
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
    json.remote_claimid,
    json.pat_name_f,
    json.pat_name_l,
    json.pat_dob,
    json.pat_sex,
    json.ins_number,
    json.ins_group || '',
    // Remove payer_name field here as well for consistency
    json.payer_id || '',
    json.bill_npi,
    json.charge[0].from_date,
    json.charge[0].proc_code,
    [json.charge[0].mod_1, json.charge[0].mod_2, json.charge[0].mod_3, json.charge[0].mod_4].filter(Boolean).join('|'),
    json.charge[0].place_of_service,
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
    'pat_name_f',
    'pat_name_l',
    'pat_dob',
    'pat_sex',
    'ins_number',
    'ins_group',
    // Remove payer_name field here as well for consistency
    'payer_id',
    'provider_npi',
    'service_date',
    'proc_code',
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
 * Converts a full state name to its two-letter postal abbreviation
 * @param stateName Full state name
 * @returns Two-letter state abbreviation
 */
function convertStateToAbbreviation(stateName: string | undefined): string {
  if (!stateName) return '';
  
  const stateMap: {[key: string]: string} = {
    'alabama': 'AL',
    'alaska': 'AK',
    'arizona': 'AZ',
    'arkansas': 'AR',
    'california': 'CA',
    'colorado': 'CO',
    'connecticut': 'CT',
    'delaware': 'DE',
    'florida': 'FL',
    'georgia': 'GA',
    'hawaii': 'HI',
    'idaho': 'ID',
    'illinois': 'IL',
    'indiana': 'IN',
    'iowa': 'IA',
    'kansas': 'KS',
    'kentucky': 'KY',
    'louisiana': 'LA',
    'maine': 'ME',
    'maryland': 'MD',
    'massachusetts': 'MA',
    'michigan': 'MI',
    'minnesota': 'MN',
    'mississippi': 'MS',
    'missouri': 'MO',
    'montana': 'MT',
    'nebraska': 'NE',
    'nevada': 'NV',
    'new hampshire': 'NH',
    'new jersey': 'NJ',
    'new mexico': 'NM',
    'new york': 'NY',
    'north carolina': 'NC',
    'north dakota': 'ND',
    'ohio': 'OH',
    'oklahoma': 'OK',
    'oregon': 'OR',
    'pennsylvania': 'PA',
    'rhode island': 'RI',
    'south carolina': 'SC',
    'south dakota': 'SD',
    'tennessee': 'TN',
    'texas': 'TX',
    'utah': 'UT',
    'vermont': 'VT',
    'virginia': 'VA',
    'washington': 'WA',
    'west virginia': 'WV',
    'wisconsin': 'WI',
    'wyoming': 'WY',
    'district of columbia': 'DC',
    'american samoa': 'AS',
    'guam': 'GU',
    'northern mariana islands': 'MP',
    'puerto rico': 'PR',
    'united states minor outlying islands': 'UM',
    'u.s. virgin islands': 'VI',
  };
  
  // Check if input is already a valid two-letter state code
  if (stateName.length === 2 && /^[A-Z]{2}$/.test(stateName.toUpperCase())) {
    return stateName.toUpperCase();
  }
  
  const normalizedState = stateName.trim().toLowerCase();
  return stateMap[normalizedState] || '';
}
