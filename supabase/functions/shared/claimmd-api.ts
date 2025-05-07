
// Shared utility for interacting with the Claim.MD API

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const CLAIMMD_BASE_URL = 'https://apiv2.claim.md/api/Workspace';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

// Create a Supabase client with the service role key for server-side operations
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper function to get API key from environment
function getApiKey(): string {
  // Changed from CLAIM.MD_API_KEY (with period) to CLAIMMD_API_KEY (without period)
  const apiKey = Deno.env.get('CLAIMMD_API_KEY');
  if (!apiKey) {
    throw new Error('Missing CLAIMMD_API_KEY environment variable');
  }
  return apiKey;
}

// Log API interactions to the api_logs table
async function logApiInteraction(endpoint: string, request: any, response: any, status: string, error: string | null, clientId: string | null, processingTime: number): Promise<void> {
  try {
    await supabase
      .from('api_logs')
      .insert({
        endpoint,
        request_payload: request,
        response_data: response,
        status,
        error_message: error,
        client_id: clientId,
        processing_time_ms: processingTime
      });
  } catch (err) {
    // Just log to console if we can't log to the database
    console.error('Failed to log API interaction:', err);
  }
}

// The main function to call Claim.MD API endpoints
export async function callClaimMdApi(
  endpoint: string,
  body: any,
  clientId: string | null = null
): Promise<{ success: boolean; data?: any; error?: string }> {
  const apiKey = getApiKey();
  const startTime = performance.now();
  
  try {
    console.log(`Calling Claim.MD API: ${endpoint}`);
    
    const response = await fetch(`${CLAIMMD_BASE_URL}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    
    const processingTime = Math.round(performance.now() - startTime);
    const responseData = await response.json();
    
    // Log the API interaction
    if (response.ok) {
      await logApiInteraction(
        endpoint,
        body,
        responseData,
        'success',
        null,
        clientId,
        processingTime
      );
      return { success: true, data: responseData };
    } else {
      const errorMessage = responseData.message || response.statusText;
      await logApiInteraction(
        endpoint,
        body,
        responseData,
        'error',
        errorMessage,
        clientId,
        processingTime
      );
      return { success: false, error: errorMessage };
    }
  } catch (error) {
    const processingTime = Math.round(performance.now() - startTime);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    await logApiInteraction(
      endpoint,
      body,
      null,
      'exception',
      errorMessage,
      clientId,
      processingTime
    );
    
    return { success: false, error: errorMessage };
  }
}
