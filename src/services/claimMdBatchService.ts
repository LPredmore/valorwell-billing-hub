import { supabase } from '@/integrations/supabase/client';
import { ErrorLoggingService } from './errorLoggingService';

/**
 * Comprehensive Claim.MD Batch Submission Service
 * Handles file upload, status polling, and response processing
 */
export class ClaimMdBatchService {
  private static readonly BASE_URL = 'https://svc.claim.md/services';
  private static readonly RETRY_ATTEMPTS = 3;
  private static readonly TIMEOUT = 60000; // 60 seconds for batch operations

  /**
   * Upload a batch file to Claim.MD
   */
  static async uploadBatch(
    fileBuffer: ArrayBuffer, 
    filename: string,
    claimIds: string[]
  ): Promise<{ success: boolean; batchId?: string; error?: string }> {
    const correlationId = `batch-upload-${Date.now()}`;
    const startTime = Date.now();
    
    try {
      console.log(`🚀 Starting batch upload: ${filename} with ${claimIds.length} claims`);
      
      // Log the upload attempt
      console.log(`📤 Uploading batch: ${filename} (${fileBuffer.byteLength} bytes)`);
      ErrorLoggingService.generateCorrelationId();

      // Call the edge function for batch upload
      const { data, error } = await supabase.functions.invoke('claim-batch-submission', {
        body: {
          operation: 'upload',
          fileBuffer: Array.from(new Uint8Array(fileBuffer)),
          filename,
          claimIds
        }
      });

      const processingTime = Date.now() - startTime;

      if (error) {
        await ErrorLoggingService.logError('batch/upload', error.message, {
          responseTime: processingTime
        });
        
        return { success: false, error: error.message };
      }

      if (!data.success) {
        await ErrorLoggingService.logError('batch/upload', data.error, {
          responseTime: processingTime
        });
        
        return { success: false, error: data.error };
      }

      // Success - log and return batch ID
      await ErrorLoggingService.logSuccess('batch/upload', {
        responseTime: processingTime,
        responseData: { batch_id: data.batchId }
      });

      console.log(`✅ Batch uploaded successfully: ${data.batchId}`);
      return { success: true, batchId: data.batchId };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await ErrorLoggingService.logError('batch/upload', errorMessage, {
        responseTime: processingTime
      });

      console.error('❌ Batch upload failed:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * List uploaded files from Claim.MD
   */
  static async listUploadedFiles(
    page: number = 1, 
    uploadDate?: string
  ): Promise<{ success: boolean; files?: any[]; error?: string }> {
    const correlationId = `batch-list-${Date.now()}`;
    const startTime = Date.now();
    
    try {
      console.log(`📋 Listing uploaded files - Page: ${page}, Date: ${uploadDate || 'all'}`);
      
      const { data, error } = await supabase.functions.invoke('claim-batch-submission', {
        body: {
          operation: 'list',
          page,
          uploadDate
        }
      });

      const processingTime = Date.now() - startTime;

      if (error) {
        console.error('❌ Batch list error:', error.message);
        return { success: false, error: error.message };
      }

      console.log(`✅ Listed ${data.files?.length || 0} files successfully`);

      return { success: true, files: data.files || [] };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Batch list failed:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Fetch claim responses from Claim.MD
   */
  static async fetchResponses(
    sinceResponseId: string = '0'
  ): Promise<{ success: boolean; responses?: any[]; error?: string }> {
    const correlationId = `batch-responses-${Date.now()}`;
    const startTime = Date.now();
    
    try {
      console.log(`📥 Fetching claim responses since ID: ${sinceResponseId}`);
      
      const { data, error } = await supabase.functions.invoke('claim-batch-submission', {
        body: {
          operation: 'responses',
          sinceResponseId
        }
      });

      const processingTime = Date.now() - startTime;

      if (error) {
        console.error('❌ Batch responses error:', error.message);
        return { success: false, error: error.message };
      }

      console.log(`✅ Fetched ${data.responses?.length || 0} responses successfully`);

      return { success: true, responses: data.responses || [] };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Batch responses failed:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Archive claims in Claim.MD
   */
  static async archiveClaims(
    claimIds: string[]
  ): Promise<{ success: boolean; archived?: number; error?: string }> {
    const correlationId = `batch-archive-${Date.now()}`;
    const startTime = Date.now();
    
    try {
      console.log(`🗄️ Archiving ${claimIds.length} claims`);
      
      const { data, error } = await supabase.functions.invoke('claim-batch-submission', {
        body: {
          operation: 'archive',
          claimIds
        }
      });

      const processingTime = Date.now() - startTime;

      if (error) {
        console.error('❌ Batch archive error:', error.message);
        return { success: false, error: error.message };
      }

      console.log(`✅ Archived ${data.archived || 0} claims successfully`);

      return { success: true, archived: data.archived || 0 };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Batch archive failed:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Generate CSV content from claims data
   */
  static generateClaimsCsv(claims: any[]): string {
    const headers = [
      'ClaimID',
      'PatientLastName',
      'PatientFirstName',
      'PatientDOB',
      'PatientSex',
      'SubscriberLastName',
      'SubscriberFirstName',
      'SubscriberDOB',
      'MemberID',
      'PayerID',
      'ServiceDate',
      'ProcedureCode',
      'ChargeAmount',
      'ProviderNPI',
      'DiagnosisCode',
      'PlaceOfService'
    ];

    const csvLines = [headers.join(',')];
    
    claims.forEach(claim => {
      const row = [
        claim.remote_claimid || '',
        claim.pat_name_l || '',
        claim.pat_name_f || '',
        claim.pat_dob || '',
        claim.pat_sex || '',
        claim.ins_name_l || '',
        claim.ins_name_f || '',
        claim.ins_dob || '',
        claim.ins_number || '',
        claim.payerid || '',
        claim.from_date || '',
        claim.proc_code || '',
        claim.charge || '0',
        claim.prov_npi || '',
        claim.diag_1 || '',
        claim.place_of_service || ''
      ];
      
      // Escape commas and quotes in CSV data
      const escapedRow = row.map(field => {
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      
      csvLines.push(escapedRow.join(','));
    });

    return csvLines.join('\n');
  }

  /**
   * Get pending claims ready for batch submission
   */
  static async getPendingClaims(): Promise<{ success: boolean; claims?: any[]; error?: string }> {
    try {
      const { data: claims, error } = await supabase
        .from('CMS1500_claims')
        .select(`
          *,
          appointments!inner(
            id,
            client_id,
            clinician_id,
            clients(client_first_name, client_last_name, client_date_of_birth),
            clinicians(clinician_first_name, clinician_last_name)
          )
        `)
        .eq('batch_status', 'pending')
        .not('remote_claimid', 'is', null)
        .is('claim_md_batch_id', null)
        .order('created_at', { ascending: true })
        .limit(100); // Batch size limit

      if (error) {
        console.error('❌ Failed to fetch pending claims:', error);
        return { success: false, error: error.message };
      }

      console.log(`📋 Found ${claims?.length || 0} pending claims ready for batch submission`);
      return { success: true, claims: claims || [] };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error fetching pending claims:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Update claims with batch information
   */
  static async updateClaimsWithBatchId(
    claimIds: string[], 
    batchId: string,
    batchLogId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Update CMS1500_claims table
      const { error: claimsError } = await supabase
        .from('CMS1500_claims')
        .update({
          claim_md_batch_id: batchId,
          batch_status: 'submitted',
          last_submission: new Date().toISOString(),
          submission_history: JSON.stringify([
            {
              batch_id: batchId,
              submitted_at: new Date().toISOString(),
              status: 'submitted'
            }
          ])
        })
        .in('id', claimIds);

      if (claimsError) {
        console.error('❌ Failed to update claims with batch ID:', claimsError);
        return { success: false, error: claimsError.message };
      }

      // Create batch_claims relationships
      const batchClaimsData = claimIds.map((claimId, index) => ({
        batch_log_id: batchLogId,
        claim_id: claimId,
        submission_order: index + 1,
        status: 'submitted'
      }));

      const { error: batchClaimsError } = await supabase
        .from('batch_claims')
        .insert(batchClaimsData);

      if (batchClaimsError) {
        console.error('❌ Failed to create batch claims relationships:', batchClaimsError);
        return { success: false, error: batchClaimsError.message };
      }

      console.log(`✅ Updated ${claimIds.length} claims with batch ID: ${batchId}`);
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error updating claims with batch ID:', error);
      return { success: false, error: errorMessage };
    }
  }
}