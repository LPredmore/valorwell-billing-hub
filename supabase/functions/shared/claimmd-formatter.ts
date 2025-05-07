
// Utility functions for formatting data according to Claim.MD's API requirements

/**
 * This module provides utilities for formatting data to meet Claim.MD API's 
 * specific format requirements, such as date formatting and code mapping.
 */

// Format dates from YYYY-MM-DD to yyyymmdd (no hyphens)
export function formatClaimMdDate(dateString: string | null): string | null {
  if (!dateString) return null;
  return dateString.replace(/-/g, '');
}

// Map relationship values to Claim.MD codes
export function mapRelationshipToCode(relationship: string | null): string {
  if (!relationship) return "18"; // Default to Self
  
  const rel = relationship.toLowerCase();
  if (rel.includes('self')) return "18";
  if (rel.includes('spouse')) return "01";
  if (rel.includes('child')) return "19";
  return "G8"; // Default to Dependent
}

// Format gender/sex values to Claim.MD codes (M/F)
export function formatGender(gender: string | null): string {
  if (!gender) return "U"; // Default to Unknown
  
  if (gender.toLowerCase().startsWith('f')) return "F";
  if (gender.toLowerCase().startsWith('m')) return "M";
  return "U"; // Unknown
}

/**
 * Formats eligibility request payload for Claim.MD's eligdata/ endpoint
 * 
 * Transforms data to match Claim.MD's API specifications:
 * - Dates in yyyymmdd format (no hyphens)
 * - Proper relationship codes (18=self, 01=spouse, etc.)
 * - Split names into first/last components
 * - Correctly formatted fields for subscriber vs. patient
 */
export function formatEligibilityPayload(
  clientData: any, 
  practiceData: any
): Record<string, string> {
  // Determine if the client is the subscriber (self) or a dependent
  const isSelf = !clientData.client_subscriber_relationship_primary || 
                clientData.client_subscriber_relationship_primary.toLowerCase().includes('self');
  
  // Extract subscriber first and last names if full name is provided
  let subscriberFirstName = clientData.client_first_name;
  let subscriberLastName = clientData.client_last_name;
  
  if (!isSelf && clientData.client_subscriber_name_primary) {
    const nameParts = clientData.client_subscriber_name_primary.split(' ');
    subscriberFirstName = nameParts[0] || '';
    subscriberLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
  }

  // Today's date for service date fields (fdos, tdos)
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // Format the eligibility payload with correct field names and data types
  const payload: Record<string, string> = {
    // Provider information
    prov_npi: practiceData.practice_npi || '',
    prov_taxid: practiceData.practice_taxid || '',
    prov_lname: practiceData.practice_name || '',
    prov_fname: "",
    prov_addr1: practiceData.practice_address1 || '',
    prov_addr2: practiceData.practice_address2 || "",
    prov_city: practiceData.practice_city || '',
    prov_state: practiceData.practice_state || '',
    prov_zip: practiceData.practice_zip || '',
    
    // Subscriber information (always required)
    ins_id: clientData.client_policy_number_primary || '',
    ins_name_l: isSelf ? (clientData.client_last_name || '') : (subscriberLastName || ''),
    ins_name_f: isSelf ? (clientData.client_first_name || '') : (subscriberFirstName || ''),
    ins_dob: formatClaimMdDate(isSelf ? clientData.client_date_of_birth : clientData.client_subscriber_dob_primary) || '',
    ins_sex: formatGender(clientData.client_gender),
    
    // Payer information
    payerid: clientData.client_primary_payer_id || '',
    ins_name: clientData.client_insurance_company_primary || '',
    
    // Service information - properly formatted dates
    service_type: "98", // 98 is for Behavioral Health
    fdos: formatClaimMdDate(today) || '',
    tdos: formatClaimMdDate(today) || '',
    
    // Relationship code - mapped to Claim.MD codes
    pat_rel: mapRelationshipToCode(clientData.client_subscriber_relationship_primary),
    
    // Unique request ID 
    request_id: `${clientData.id.substring(0,8)}-${Date.now()}`
  };
  
  // Add patient information if different from subscriber (dependent case)
  if (!isSelf) {
    payload.pat_name_l = clientData.client_last_name || '';
    payload.pat_name_f = clientData.client_first_name || '';
    payload.pat_dob = formatClaimMdDate(clientData.client_date_of_birth) || '';
    payload.pat_sex = formatGender(clientData.client_gender);
  }
  
  return payload;
}

/**
 * Maps common Claim.MD error codes to user-friendly messages
 */
export function getClaimMdErrorMessage(errorCode: string): string {
  const errorMessages: Record<string, string> = {
    '20': 'API key missing or invalid',
    '67': 'Patient not found in insurance database',
    '50': 'Invalid API endpoint or service',
    '60': 'Missing required parameters',
    '65': 'Invalid insurance information',
    '70': 'Insurance not active',
    '80': 'Network error or timeout',
    '90': 'Authorization error'
  };
  
  return errorMessages[errorCode] || `Unknown error (Code: ${errorCode})`;
}
