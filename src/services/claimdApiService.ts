import { supabase } from '@/integrations/supabase/client';
import {
  validateEligibilityRequest,
  validateClientData,
  validateProviderData,
  parseClaimMDResponse,
  convertDateFormat,
  logDataTransformation
} from '@/utils/claimdValidation';
import {
  type EligibilityRequest,
  type ClientData,
  type ProviderData,
  type EligibilityStatus,
  InsuranceLevel
} from '@/types/claimmd';

/**
 * Comprehensive ClaimMD API service for insurance verification
 */
export class ClaimMdApiService {
  private static readonly BASE_URL = 'https://svc.claim.md/services';
  private static readonly RATE_LIMIT = 100; // requests per minute
  private static readonly RETRY_ATTEMPTS = 3;
  private static readonly TIMEOUT = 30000; // 30 seconds

  /**
   * Checks insurance eligibility for a client
   */
  static async checkEligibility(
    clientId: string, 
    insuranceLevel: InsuranceLevel = InsuranceLevel.PRIMARY
  ): Promise<{ success: boolean; data?: EligibilityStatus; error?: string }> {
    try {
      console.log(`🔍 Starting eligibility check for client ${clientId} (${insuranceLevel} insurance)`);
      
      // Validate rate limiting
      const rateLimitCheck = await this.checkRateLimit();
      if (!rateLimitCheck.allowed) {
        return {
          success: false,
          error: `Rate limit exceeded. Try again in ${rateLimitCheck.retryAfter} seconds.`
        };
      }

      // Get client data
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();

      if (clientError || !clientData) {
        console.error('❌ Failed to fetch client data:', clientError);
        return {
          success: false,
          error: 'Client not found'
        };
      }

      // Get practice data
      const { data: practiceData, error: practiceError } = await supabase
        .from('practiceinfo')
        .select('*')
        .single();

      if (practiceError || !practiceData) {
        console.error('❌ Failed to fetch practice data:', practiceError);
        return {
          success: false,
          error: 'Practice information not found'
        };
      }

      // Validate input data
      const clientValidation = validateClientData(clientData);
      if (!clientValidation.success) {
        console.error('❌ Client data validation failed:', clientValidation.formattedErrors);
        return {
          success: false,
          error: 'Invalid client data: ' + Object.values(clientValidation.formattedErrors || {}).flat().join(', ')
        };
      }

      const providerValidation = validateProviderData(practiceData);
      if (!providerValidation.success) {
        console.error('❌ Provider data validation failed:', providerValidation.formattedErrors);
        return {
          success: false,
          error: 'Invalid provider data: ' + Object.values(providerValidation.formattedErrors || {}).flat().join(', ')
        };
      }

      // Map data to ClaimMD format
      const eligibilityRequest = this.mapClientDataToClaimMD(
        clientValidation.data!,
        providerValidation.data!,
        insuranceLevel
      );

      logDataTransformation('Client to ClaimMD mapping', { clientData, practiceData }, eligibilityRequest);

      // Validate the mapped request
      const requestValidation = validateEligibilityRequest(eligibilityRequest);
      if (!requestValidation.success) {
        console.error('❌ Eligibility request validation failed:', requestValidation.formattedErrors);
        return {
          success: false,
          error: 'Invalid eligibility request: ' + Object.values(requestValidation.formattedErrors || {}).flat().join(', ')
        };
      }

      // Call ClaimMD API via edge function
      const { data, error } = await supabase.functions.invoke('insurance-eligibility', {
        body: { clientId }
      });

      if (error) {
        console.error('❌ Edge function error:', error);
        return {
          success: false,
          error: error.message || 'Failed to check eligibility'
        };
      }

      if (!data.success) {
        console.error('❌ API call failed:', data.error);
        return {
          success: false,
          error: data.error || 'Eligibility check failed'
        };
      }

      // Parse and return the response
      const eligibilityStatus = parseClaimMDResponse(data.eligibility);
      
      console.log('✅ Eligibility check completed successfully:', eligibilityStatus);
      return {
        success: true,
        data: eligibilityStatus
      };

    } catch (error) {
      console.error('❌ Unexpected error in eligibility check:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Maps client and provider data to ClaimMD API format
   */
  static mapClientDataToClaimMD(
    clientData: ClientData,
    practiceData: ProviderData,
    insuranceLevel: InsuranceLevel
  ): EligibilityRequest {
    // Get insurance fields based on level
    const insuranceFields = this.getInsuranceFields(clientData, insuranceLevel);
    
    // Determine if client is the subscriber
    const isSelf = !insuranceFields.relationship || 
                   insuranceFields.relationship.toLowerCase().includes('self');
    
    // Parse subscriber name if provided
    let subscriberFirstName = clientData.client_first_name;
    let subscriberLastName = clientData.client_last_name;
    
    if (!isSelf && insuranceFields.subscriberName) {
      const nameParts = insuranceFields.subscriberName.split(' ');
      subscriberFirstName = nameParts[0] || '';
      subscriberLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    }

    // Today's date for service dates
    const today = new Date().toISOString().split('T')[0];
    
    const request: EligibilityRequest = {
      // Provider information
      prov_npi: practiceData.practice_npi,
      prov_taxid: practiceData.practice_taxid,
      prov_lname: practiceData.practice_name,
      prov_fname: '',
      prov_addr_1: practiceData.practice_address1,
      prov_addr_2: practiceData.practice_address2 || '',
      prov_city: practiceData.practice_city,
      prov_state: practiceData.practice_state,
      prov_zip: practiceData.practice_zip,
      
      // Insurance information
      ins_number: insuranceFields.policyNumber,
      ins_name_l: isSelf ? clientData.client_last_name : subscriberLastName,
      ins_name_f: isSelf ? clientData.client_first_name : subscriberFirstName,
      ins_dob: convertDateFormat(isSelf ? clientData.client_date_of_birth : insuranceFields.subscriberDob) || '',
      ins_sex: this.formatGender(clientData.client_gender),
      
      // Payer information
      payerid: insuranceFields.payerId,
      ins_name: insuranceFields.companyName,
      
      // Service information
      service_type: '98', // Behavioral Health
      fdos: convertDateFormat(today) || '',
      tdos: convertDateFormat(today) || '',
      
      // Relationship
      pat_rel: this.mapRelationshipToCode(insuranceFields.relationship),
      
      // Request tracking
      request_id: `${clientData.id.substring(0, 8)}-${Date.now()}`
    };
    
    // Add patient information if different from subscriber
    if (!isSelf) {
      request.pat_name_l = clientData.client_last_name;
      request.pat_name_f = clientData.client_first_name;
      request.pat_dob = convertDateFormat(clientData.client_date_of_birth) || '';
      request.pat_sex = this.formatGender(clientData.client_gender);
    }
    
    return request;
  }

  /**
   * Gets insurance fields based on insurance level
   */
  private static getInsuranceFields(clientData: ClientData, level: InsuranceLevel) {
    switch (level) {
      case InsuranceLevel.SECONDARY:
        return {
          policyNumber: clientData.client_policy_number_secondary || '',
          companyName: clientData.client_insurance_company_secondary || '',
          payerId: clientData.client_secondary_payer_id || '',
          relationship: clientData.client_subscriber_relationship_secondary,
          subscriberName: clientData.client_subscriber_name_secondary,
          subscriberDob: clientData.client_subscriber_dob_secondary
        };
      case InsuranceLevel.TERTIARY:
        return {
          policyNumber: clientData.client_policy_number_tertiary || '',
          companyName: clientData.client_insurance_company_tertiary || '',
          payerId: clientData.client_tertiary_payer_id || '',
          relationship: clientData.client_subscriber_relationship_tertiary,
          subscriberName: clientData.client_subscriber_name_tertiary,
          subscriberDob: clientData.client_subscriber_dob_tertiary
        };
      default: // PRIMARY
        return {
          policyNumber: clientData.client_policy_number_primary || '',
          companyName: clientData.client_insurance_company_primary || '',
          payerId: clientData.client_primary_payer_id || '',
          relationship: clientData.client_subscriber_relationship_primary,
          subscriberName: clientData.client_subscriber_name_primary,
          subscriberDob: clientData.client_subscriber_dob_primary
        };
    }
  }

  /**
   * Formats gender for ClaimMD API
   */
  private static formatGender(gender: string): 'M' | 'F' | 'U' {
    if (!gender) return 'U';
    const g = gender.toLowerCase();
    if (g.startsWith('f')) return 'F';
    if (g.startsWith('m')) return 'M';
    return 'U';
  }

  /**
   * Maps relationship text to ClaimMD relationship codes
   */
  private static mapRelationshipToCode(relationship?: string): string {
    if (!relationship) return '18'; // Self
    
    const rel = relationship.toLowerCase();
    if (rel.includes('self')) return '18';
    if (rel.includes('spouse')) return '01';
    if (rel.includes('child')) return '19';
    if (rel.includes('parent')) return '04';
    return 'G8'; // Other dependent
  }

  /**
   * Checks rate limiting (simplified version - could be enhanced with Redis)
   */
  private static async checkRateLimit(): Promise<{ allowed: boolean; retryAfter?: number }> {
    try {
      // Simple rate limiting using database
      const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
      
      const { count } = await supabase
        .from('api_logs')
        .select('id', { count: 'exact' })
        .eq('endpoint', 'eligdata/')
        .gte('created_at', oneMinuteAgo);
      
      if ((count || 0) >= this.RATE_LIMIT) {
        return { allowed: false, retryAfter: 60 };
      }
      
      return { allowed: true };
    } catch (error) {
      console.warn('Rate limit check failed, allowing request:', error);
      return { allowed: true };
    }
  }
}