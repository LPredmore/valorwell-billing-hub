// Utility functions for formatting data according to Claim.MD's API requirements

/**
 * This module provides utilities for formatting data to meet Claim.MD API's 
 * specific format requirements, such as date formatting and code mapping.
 * 
 * Note: This is the edge function version. For client-side validation,
 * use the enhanced validation functions in src/utils/claimdValidation.ts
 */

// Define interfaces for type safety - simplified for edge function use
interface ClaimMdResponse {
  elig?: {
    error?: Array<{error_code?: string; error_mesg?: string}>;
    benefit?: Array<any>;
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
  error?: string | {error_code?: string; error_mesg?: string; [key: string]: any};
  originalErrorData?: {error_code?: string; error_mesg?: string; [key: string]: any};
  [key: string]: any;
}

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
 * This is the edge function version with basic validation.
 * For comprehensive validation, use the client-side validation functions.
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
  // Basic validation logging for edge function
  console.log('🔄 [Edge Function] Formatting eligibility payload', {
    clientHasPolicy: !!clientData.client_policy_number_primary,
    clientHasInsurance: !!clientData.client_insurance_company_primary,
    practiceHasNPI: !!practiceData.practice_npi,
    timestamp: new Date().toISOString()
  });
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
    prov_addr_1: practiceData.practice_address1 || '',
    prov_addr_2: practiceData.practice_address2 || "",
    prov_city: practiceData.practice_city || '',
    prov_state: practiceData.practice_state || '',
    prov_zip: practiceData.practice_zip || '',
    
    // Subscriber information (always required)
    ins_number: clientData.client_policy_number_primary || '',
    ins_name_l: isSelf ? (clientData.client_last_name || '') : (subscriberLastName || ''),
    ins_name_f: isSelf ? (clientData.client_first_name || '') : (subscriberFirstName || ''),
    ins_dob: formatClaimMdDate(isSelf ? clientData.client_date_of_birth : clientData.client_subscriber_dob_primary) || '',
    ins_sex: formatGender(clientData.client_gender),
    
    // Payer information - Using payerid instead of payer_id for consistency with claims
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
 * Extract error code from various response structures
 * 
 * Helper function to safely navigate through different error formats
 * returned by the Claim.MD API
 */
export function getErrorCode(responseData: any): string | null {
  if (!responseData) return null;
  
  if (typeof responseData !== 'object') return null;
  
  // Helper function to safely check properties
  const hasProperty = (obj: any, prop: string) => 
    obj && typeof obj === 'object' && !Array.isArray(obj) && prop in obj;
  
  // Check if error is an array of error objects in elig property
  if (hasProperty(responseData, 'elig') && 
      hasProperty(responseData.elig, 'error') && 
      Array.isArray(responseData.elig.error) && 
      responseData.elig.error.length > 0) {
    const firstError = responseData.elig.error[0];
    return firstError?.error_code || null;
  }
  
  // Check if error is a direct object with error_code
  if (hasProperty(responseData, 'error')) {
    // Handle both string and object error formats
    if (typeof responseData.error === 'object') {
      return responseData.error?.error_code || null;
    }
    // If error is a string, check originalErrorData for the code
    else if (hasProperty(responseData, 'originalErrorData')) {
      return responseData.originalErrorData?.error_code || null;
    }
  }
  
  // Check if originalErrorData contains the error code
  if (hasProperty(responseData, 'originalErrorData')) {
    return responseData.originalErrorData?.error_code || null;
  }
  
  return null;
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
    '75': 'Subscriber/Insured not found. Verify policy number, name, and date of birth',
    '80': 'Network error or timeout',
    '90': 'Authorization error'
  };
  
  return errorMessages[errorCode] || `Unknown error (Code: ${errorCode})`;
}

/**
 * Determines eligibility status from Claim.MD benefit information
 * 
 * Parses through the benefit array returned by Claim.MD to determine
 * if the patient has active coverage based on benefit_coverage_description
 * or similar fields.
 */
export function determineEligibilityStatus(responseData: any): {
  status: string;
  copay: number | null;
  deductible: number | null;
  coinsurancePercent: number | null;
} {
  // Default values
  let status = 'Unknown';
  let copay = null;
  let deductible = null;
  let coinsurancePercent = null;
  
  // Check for errors first, using our helper function
  const errorCode = getErrorCode(responseData);
  
  if (errorCode) {
    // For specific error codes, return more descriptive statuses
    if (errorCode === '75') return { status: 'Not Found', copay, deductible, coinsurancePercent };
    if (errorCode === '70') return { status: 'Inactive', copay, deductible, coinsurancePercent };
    if (errorCode === '60' || errorCode === '65') return { status: 'Info Needed', copay, deductible, coinsurancePercent };
    
    return { status: 'Error', copay, deductible, coinsurancePercent };
  }
  
  // Helper function to safely check properties
  const hasProperty = (obj: any, prop: string) => 
    obj && typeof obj === 'object' && !Array.isArray(obj) && prop in obj;
  
  // Extract benefit information from the response
  const benefits = hasProperty(responseData, 'elig') && Array.isArray(responseData.elig.benefit) ? 
    responseData.elig.benefit : [];
  
  if (benefits.length > 0) {
    // Check for active coverage indicators in the benefits array
    const hasActiveCoverage = benefits.some(benefit => {
      const coverageDesc = (benefit.benefit_coverage_description || '').toLowerCase();
      const coverageCode = benefit.benefit_coverage_code;
      
      // Look for active coverage indicators
      return (
        coverageDesc.includes('active coverage') || 
        coverageCode === '1' // Common code for active coverage
      );
    });
    
    // If active coverage is found, set status to Active
    if (hasActiveCoverage) {
      status = 'Active';
      
      // Extract benefit details - look for copay information
      const copayBenefit = benefits.find(benefit => 
        (benefit.benefit_coverage_code === 'B' || 
         (benefit.benefit_coverage_description || '').toLowerCase().includes('co-payment')) &&
        benefit.benefit_code === '98' // For Professional/Physician Visit
      );
      
      if (copayBenefit && copayBenefit.benefit_amount) {
        copay = Number(copayBenefit.benefit_amount) || null;
      }
      
      // Look for deductible information - typically individual deductible
      const deductibleBenefit = benefits.find(benefit => 
        (benefit.benefit_coverage_code === 'C' || 
         (benefit.benefit_coverage_description || '').toLowerCase().includes('deductible')) &&
        benefit.benefit_level_code === 'IND' && // Individual level
        benefit.benefit_code === '98' // For Professional/Physician Visit
      );
      
      if (deductibleBenefit && deductibleBenefit.benefit_amount) {
        deductible = Number(deductibleBenefit.benefit_amount) || null;
      }
      
      // Look for coinsurance percentage
      const coinsuranceBenefit = benefits.find(benefit => 
        (benefit.benefit_coverage_code === 'A' || 
         (benefit.benefit_coverage_description || '').toLowerCase().includes('co-insurance')) &&
        benefit.benefit_code === '98' // For Professional/Physician Visit
      );
      
      if (coinsuranceBenefit && coinsuranceBenefit.benefit_percent) {
        coinsurancePercent = Number(coinsuranceBenefit.benefit_percent) || null;
      }
    } else {
      // If benefits exist but no active coverage, it's likely inactive
      status = 'Inactive';
    }
  } else if (hasProperty(responseData, 'elig')) {
    // If elig exists but no benefits, likely inactive or status unknown
    status = 'Inactive';
  }
  
  return { status, copay, deductible, coinsurancePercent };
}
