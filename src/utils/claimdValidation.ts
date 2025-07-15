import { z } from 'zod';
import {
  eligibilityRequestSchema,
  providerDataSchema,
  clientDataSchema,
  type EligibilityRequest,
  type ProviderData,
  type ClientData,
  type ValidationResult,
  type ClaimMdEligibilityResponse,
  type EligibilityStatus,
  CLAIMMD_ERROR_CODES
} from '@/types/claimmd';

/**
 * Validates eligibility request data against the ClaimMD API requirements
 */
export function validateEligibilityRequest(data: any): ValidationResult<EligibilityRequest> {
  try {
    const validatedData = eligibilityRequestSchema.parse(data);
    
    // Log successful validation
    console.log('✅ Eligibility request validation passed', {
      requestId: validatedData.request_id,
      fields: Object.keys(validatedData).length
    });
    
    return {
      success: true,
      data: validatedData
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors: Record<string, string[]> = {};
      
      error.issues.forEach((err) => {
        const field = err.path.join('.');
        if (!formattedErrors[field]) {
          formattedErrors[field] = [];
        }
        formattedErrors[field].push(err.message);
      });

      console.error('❌ Eligibility request validation failed:', formattedErrors);
      
      return {
        success: false,
        errors: error,
        formattedErrors
      };
    }
    
    console.error('❌ Unexpected validation error:', error);
    return {
      success: false,
      errors: error as z.ZodError
    };
  }
}

/**
 * Validates provider data for completeness and format
 */
export function validateProviderData(data: any): ValidationResult<ProviderData> {
  try {
    const validatedData = providerDataSchema.parse(data);
    
    // Additional business logic validation
    const additionalErrors: string[] = [];
    
    // Validate NPI format (10 digits)
    if (!/^\d{10}$/.test(validatedData.practice_npi)) {
      additionalErrors.push('Practice NPI must be exactly 10 digits');
    }
    
    // Validate Tax ID format (EIN: XX-XXXXXXX or 9 digits)
    const taxId = validatedData.practice_taxid.replace(/[^0-9]/g, '');
    if (taxId.length !== 9) {
      additionalErrors.push('Practice Tax ID must be 9 digits');
    }
    
    // Validate ZIP code format
    if (!/^\d{5}(-\d{4})?$/.test(validatedData.practice_zip)) {
      additionalErrors.push('Practice ZIP must be 5 digits or 5+4 format');
    }
    
    if (additionalErrors.length > 0) {
      console.error('❌ Provider data validation failed:', additionalErrors);
      return {
        success: false,
        formattedErrors: {
          general: additionalErrors
        }
      };
    }
    
    console.log('✅ Provider data validation passed', {
      npi: validatedData.practice_npi,
      name: validatedData.practice_name
    });
    
    return {
      success: true,
      data: validatedData
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors: Record<string, string[]> = {};
      
      error.issues.forEach((err) => {
        const field = err.path.join('.');
        if (!formattedErrors[field]) {
          formattedErrors[field] = [];
        }
        formattedErrors[field].push(err.message);
      });

      console.error('❌ Provider data validation failed:', formattedErrors);
      
      return {
        success: false,
        errors: error,
        formattedErrors
      };
    }
    
    return {
      success: false,
      errors: error as z.ZodError
    };
  }
}

/**
 * Validates client data for eligibility checking
 */
export function validateClientData(data: any): ValidationResult<ClientData> {
  try {
    const validatedData = clientDataSchema.parse(data);
    
    // Additional business logic validation
    const additionalErrors: string[] = [];
    
    // Validate date of birth is not in the future
    const dob = new Date(validatedData.client_date_of_birth);
    if (dob > new Date()) {
      additionalErrors.push('Client date of birth cannot be in the future');
    }
    
    // Validate age is reasonable (not over 150 years old)
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (age > 150) {
      additionalErrors.push('Client age seems unrealistic (over 150 years)');
    }
    
    // Validate subscriber relationship consistency
    if (validatedData.client_subscriber_relationship_primary) {
      const relationship = validatedData.client_subscriber_relationship_primary.toLowerCase();
      const isSelf = relationship.includes('self');
      
      if (!isSelf) {
        // If not self, subscriber name and DOB should be provided
        if (!validatedData.client_subscriber_name_primary) {
          additionalErrors.push('Subscriber name is required when relationship is not self');
        }
        if (!validatedData.client_subscriber_dob_primary) {
          additionalErrors.push('Subscriber date of birth is required when relationship is not self');
        }
      }
    }
    
    if (additionalErrors.length > 0) {
      console.error('❌ Client data validation failed:', additionalErrors);
      return {
        success: false,
        formattedErrors: {
          general: additionalErrors
        }
      };
    }
    
    console.log('✅ Client data validation passed', {
      clientId: validatedData.id,
      name: `${validatedData.client_first_name} ${validatedData.client_last_name}`,
      hasSecondary: !!validatedData.client_policy_number_secondary,
      hasTertiary: !!validatedData.client_policy_number_tertiary
    });
    
    return {
      success: true,
      data: validatedData
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors: Record<string, string[]> = {};
      
      error.issues.forEach((err) => {
        const field = err.path.join('.');
        if (!formattedErrors[field]) {
          formattedErrors[field] = [];
        }
        formattedErrors[field].push(err.message);
      });

      console.error('❌ Client data validation failed:', formattedErrors);
      
      return {
        success: false,
        errors: error,
        formattedErrors
      };
    }
    
    return {
      success: false,
      errors: error as z.ZodError
    };
  }
}

/**
 * Converts date from YYYY-MM-DD format to YYYYMMDD format for ClaimMD API
 */
export function convertDateFormat(dateString: string | null): string | null {
  if (!dateString) return null;
  
  // Validate input format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    console.warn(`Invalid date format: ${dateString}. Expected YYYY-MM-DD format.`);
    return null;
  }
  
  const converted = dateString.replace(/-/g, '');
  console.log(`📅 Date conversion: ${dateString} → ${converted}`);
  return converted;
}

/**
 * Parses ClaimMD API response and extracts eligibility details
 */
export function parseClaimMDResponse(response: ClaimMdEligibilityResponse): EligibilityStatus {
  console.log('🔍 Parsing ClaimMD response:', JSON.stringify(response, null, 2));
  
  // Check for errors first
  const errorCode = getErrorCode(response);
  if (errorCode) {
    const errorMessage = CLAIMMD_ERROR_CODES[errorCode] || `Unknown error (Code: ${errorCode})`;
    console.error(`❌ ClaimMD API error: ${errorMessage}`);
    
    // Map specific error codes to status
    if (errorCode === '75') return { status: 'Not Found', copay: null, deductible: null, coinsurancePercent: null };
    if (errorCode === '70') return { status: 'Inactive', copay: null, deductible: null, coinsurancePercent: null };
    if (errorCode === '60' || errorCode === '65') return { status: 'Info Needed', copay: null, deductible: null, coinsurancePercent: null };
    
    return { status: 'Error', copay: null, deductible: null, coinsurancePercent: null };
  }
  
  // Extract eligibility details
  const eligibilityDetails = extractEligibilityDetails(response);
  
  console.log('✅ Parsed eligibility status:', eligibilityDetails);
  return eligibilityDetails;
}

/**
 * Extracts copay, deductible, and coinsurance from ClaimMD benefit data
 */
export function extractEligibilityDetails(response: ClaimMdEligibilityResponse): EligibilityStatus {
  let status: EligibilityStatus['status'] = 'Unknown';
  let copay: number | null = null;
  let deductible: number | null = null;
  let coinsurancePercent: number | null = null;
  
  const benefits = response.elig?.benefit || [];
  
  if (benefits.length > 0) {
    // Check for active coverage
    const hasActiveCoverage = benefits.some(benefit => {
      const coverageDesc = (benefit.benefit_coverage_description || '').toLowerCase();
      const coverageCode = benefit.benefit_coverage_code;
      
      return (
        coverageDesc.includes('active coverage') || 
        coverageCode === '1'
      );
    });
    
    if (hasActiveCoverage) {
      status = 'Active';
      
      // Extract copay (code B for copayment, service code 98 for professional visit)
      const copayBenefit = benefits.find(benefit => 
        (benefit.benefit_coverage_code === 'B' || 
         (benefit.benefit_coverage_description || '').toLowerCase().includes('co-payment')) &&
        benefit.benefit_code === '98'
      );
      
      if (copayBenefit?.benefit_amount) {
        copay = parseFloat(copayBenefit.benefit_amount) || null;
        console.log(`💰 Found copay: $${copay}`);
      }
      
      // Extract deductible (code C for deductible, individual level)
      const deductibleBenefit = benefits.find(benefit => 
        (benefit.benefit_coverage_code === 'C' || 
         (benefit.benefit_coverage_description || '').toLowerCase().includes('deductible')) &&
        benefit.benefit_level_code === 'IND' &&
        benefit.benefit_code === '98'
      );
      
      if (deductibleBenefit?.benefit_amount) {
        deductible = parseFloat(deductibleBenefit.benefit_amount) || null;
        console.log(`💰 Found deductible: $${deductible}`);
      }
      
      // Extract coinsurance (code A for coinsurance)
      const coinsuranceBenefit = benefits.find(benefit => 
        (benefit.benefit_coverage_code === 'A' || 
         (benefit.benefit_coverage_description || '').toLowerCase().includes('co-insurance')) &&
        benefit.benefit_code === '98'
      );
      
      if (coinsuranceBenefit?.benefit_percent) {
        coinsurancePercent = parseFloat(coinsuranceBenefit.benefit_percent) || null;
        console.log(`💰 Found coinsurance: ${coinsurancePercent}%`);
      }
    } else {
      status = 'Inactive';
      console.log('⚠️ No active coverage found in benefits');
    }
  } else if (response.elig) {
    status = 'Inactive';
    console.log('⚠️ Eligibility response received but no benefits found');
  }
  
  return {
    status,
    copay,
    deductible,
    coinsurancePercent,
    lastChecked: new Date().toISOString(),
    claimMdId: response.id || response.elig?.eligid || null
  };
}

/**
 * Safely extracts error code from ClaimMD response
 */
function getErrorCode(responseData: any): string | null {
  if (!responseData || typeof responseData !== 'object') return null;
  
  // Check for error array in elig property
  if (responseData.elig?.error && Array.isArray(responseData.elig.error) && responseData.elig.error.length > 0) {
    return responseData.elig.error[0]?.error_code || null;
  }
  
  // Check for direct error object
  if (responseData.error) {
    if (typeof responseData.error === 'object') {
      return responseData.error?.error_code || null;
    }
    // Check originalErrorData for string errors
    if (responseData.originalErrorData) {
      return responseData.originalErrorData?.error_code || null;
    }
  }
  
  return null;
}

/**
 * Logs data transformation steps for debugging
 */
export function logDataTransformation(step: string, input: any, output: any): void {
  console.log(`🔄 Data transformation [${step}]:`, {
    input: typeof input === 'object' ? JSON.stringify(input, null, 2) : input,
    output: typeof output === 'object' ? JSON.stringify(output, null, 2) : output,
    timestamp: new Date().toISOString()
  });
}