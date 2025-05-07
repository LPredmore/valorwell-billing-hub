
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

interface ClaimJSON {
  claim_id: string;
  patient: {
    first_name: string;
    last_name: string;
    date_of_birth: string;
    gender: string;
    address_line_1?: string;
    city?: string;
    state?: string;
    zip_code?: string;
  };
  subscriber: {
    first_name: string;
    last_name: string;
    date_of_birth: string;
    relationship_to_patient: string;
    member_id: string;
    group_number?: string;
  };
  payer: {
    name: string;
    id: string;
  };
  provider: {
    name: string;
    npi: string;
    tax_id: string;
    taxonomy_code: string;
    address_line_1: string;
    address_line_2?: string;
    city: string;
    state: string;
    zip_code: string;
  };
  rendering_provider?: {
    name: string;
    npi: string;
    taxonomy_code?: string;
  };
  services: Array<{
    date_of_service: string;
    cpt_code: string;
    modifiers?: string[];
    diagnosis_pointers: string[];
    place_of_service: string;
    charge_amount: number;
  }>;
  diagnoses: string[];
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
 * Formats the appointment data into a JSON claim object for Claim.MD
 */
export function formatClaimJSON(data: {
  appointment: Appointment;
  client: Client;
  practice: Practice;
  clinician: Clinician;
}): ClaimJSON {
  const { appointment, client, practice, clinician } = data;
  
  // Parse diagnosis code pointers (e.g., "1,2" to ["1", "2"])
  const diagnosisPointers = appointment.diagnosis_code_pointers 
    ? appointment.diagnosis_code_pointers.split(',').map(p => p.trim())
    : ['1']; // Default to first diagnosis if not specified
  
  // Format date for claim
  const serviceDate = formatDate(new Date(appointment.start_at), "yyyy-MM-dd");
  
  // Use client's diagnoses or default
  const diagnoses = client.client_diagnosis || [];
  
  return {
    claim_id: appointment.id,
    patient: {
      first_name: client.client_first_name,
      last_name: client.client_last_name,
      date_of_birth: client.client_date_of_birth,
      gender: client.client_gender || 'U' // Default to Unknown if not specified
    },
    subscriber: {
      // If client is the subscriber, use client info, otherwise use subscriber info
      first_name: client.client_subscriber_name_primary ? 
        client.client_subscriber_name_primary.split(' ')[0] : 
        client.client_first_name,
      last_name: client.client_subscriber_name_primary ? 
        client.client_subscriber_name_primary.split(' ').slice(1).join(' ') : 
        client.client_last_name,
      date_of_birth: client.client_subscriber_dob_primary || client.client_date_of_birth,
      relationship_to_patient: client.client_subscriber_relationship_primary || 'SELF',
      member_id: client.client_policy_number_primary || '',
      group_number: client.client_group_number_primary
    },
    payer: {
      name: client.client_insurance_company_primary || 'Unknown',
      id: client.client_primary_payer_id || ''
    },
    provider: {
      name: practice.practice_name,
      npi: practice.practice_npi,
      tax_id: practice.practice_taxid,
      taxonomy_code: practice.practice_taxonomy,
      address_line_1: practice.practice_address1,
      address_line_2: practice.practice_address2,
      city: practice.practice_city,
      state: practice.practice_state,
      zip_code: practice.practice_zip
    },
    rendering_provider: {
      name: `${clinician.clinician_first_name} ${clinician.clinician_last_name}`,
      npi: clinician.clinician_npi_number || practice.practice_npi,
      taxonomy_code: clinician.clinician_taxonomy_code || practice.practice_taxonomy
    },
    services: [
      {
        date_of_service: serviceDate,
        cpt_code: appointment.cpt_code,
        modifiers: appointment.modifiers,
        diagnosis_pointers: diagnosisPointers,
        place_of_service: appointment.place_of_service_code || '11', // Default to office (11)
        charge_amount: appointment.billed_amount || 0
      }
    ],
    diagnoses: diagnoses
  };
}

/**
 * Formats multiple claims into a batch JSON for submission
 */
export function formatClaimBatchJSON(claims: ClaimJSON[]): { claims: ClaimJSON[] } {
  return { claims };
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
    json.patient.first_name,
    json.patient.last_name,
    json.patient.date_of_birth,
    json.patient.gender,
    json.subscriber.member_id,
    json.subscriber.group_number || '',
    json.payer.name,
    json.payer.id || '',
    json.provider.npi,
    json.services[0].date_of_service,
    json.services[0].cpt_code,
    json.services[0].modifiers ? json.services[0].modifiers.join('|') : '',
    json.services[0].place_of_service,
    json.services[0].charge_amount.toString(),
    json.diagnoses.join('|')
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
    'patient_first_name',
    'patient_last_name',
    'patient_dob',
    'patient_gender',
    'subscriber_id',
    'group_number',
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
