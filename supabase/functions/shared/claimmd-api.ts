
// Shared utility for interacting with the Claim.MD API

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// Updated API base URL per documentation v1.17
const CLAIMMD_BASE_URL = 'https://svc.claim.md/services';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

// Create a Supabase client with the service role key for server-side operations
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper function to get API key from environment
function getApiKey(): string {
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

// Retry function with exponential backoff for transient errors
async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let retries = 0;
  
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (retries >= maxRetries) throw err;
      
      // Only retry on network errors, timeouts, or 5xx server errors
      const errorMsg = err instanceof Error ? err.message : String(err);
      const shouldRetry = 
        errorMsg.includes('network') || 
        errorMsg.includes('timeout') || 
        errorMsg.includes('abort') || 
        (err as any)?.status >= 500;
      
      if (!shouldRetry) throw err;
      
      const delay = Math.pow(2, retries) * 1000 + Math.random() * 1000;
      console.log(`Retrying API call after ${delay}ms (attempt ${retries + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, delay));
      retries++;
    }
  }
}

// The main function to call Claim.MD API endpoints
export async function callClaimMdApi(
  endpoint: string,
  body: any,
  clientId: string | null = null,
  timeout: number = 30000 // 30 second default timeout
): Promise<{ success: boolean; data?: any; error?: string }> {
  const apiKey = getApiKey();
  const startTime = performance.now();
  
  try {
    console.log(`Calling Claim.MD API: ${endpoint}`);
    console.log(`API URL: ${CLAIMMD_BASE_URL}/${endpoint}`);
    console.log(`Request body:`, JSON.stringify(body));
    
    const makeRequest = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const response = await fetch(`${CLAIMMD_BASE_URL}/${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        // Get processing time
        const processingTime = Math.round(performance.now() - startTime);
        console.log(`API response received in ${processingTime}ms with status: ${response.status} ${response.statusText}`);
        
        // Handle the response based on status code
        let responseData;
        let errorMessage = null;
        
        if (response.ok) {
          // Success response (200-299)
          try {
            responseData = await response.json();
            console.log(`API response:`, JSON.stringify(responseData).substring(0, 500) + '...');
            
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
          } catch (err) {
            console.error('Failed to parse successful response as JSON:', err);
            
            // Try to get as text if JSON parsing fails
            try {
              const text = await response.text();
              responseData = { raw: text };
              console.log(`Non-JSON response:`, text.substring(0, 500) + '...');
              
              await logApiInteraction(
                endpoint,
                body,
                responseData,
                'success',
                'Response was not valid JSON',
                clientId,
                processingTime
              );
              
              return { success: true, data: responseData };
            } catch (textErr) {
              console.error('Failed to read response as text:', textErr);
              responseData = { status: response.status, statusText: response.statusText };
              errorMessage = `Failed to read response body: ${textErr instanceof Error ? textErr.message : String(textErr)}`;
            }
          }
        } else {
          // Error response (non 200-299)
          errorMessage = `API returned status ${response.status} ${response.statusText}`;
          console.error(`API error for ${endpoint}: ${errorMessage}`);
          
          // Try to parse error details
          try {
            responseData = await response.json();
            console.log(`Error response details:`, JSON.stringify(responseData).substring(0, 500) + '...');
          } catch (jsonErr) {
            // If JSON parsing fails, try to get as text
            try {
              const text = await response.text();
              responseData = { raw: text || response.statusText };
              console.log(`Error response (text):`, text.substring(0, 500) + '...');
            } catch (textErr) {
              // If both fail, use status information
              console.error('Failed to read error response body:', textErr);
              responseData = { status: response.status, statusText: response.statusText };
            }
          }
        }
        
        // Log the error interaction
        await logApiInteraction(
          endpoint,
          body,
          responseData,
          'error',
          errorMessage,
          clientId,
          processingTime
        );
        
        return { success: false, error: errorMessage, data: responseData };
      } finally {
        clearTimeout(timeoutId);
      }
    };
    
    // Use retry mechanism for the API call
    return await retryWithBackoff(makeRequest);
    
  } catch (error) {
    const processingTime = Math.round(performance.now() - startTime);
    const errorMessage = error instanceof Error ? 
      `${error.name}: ${error.message}${error.stack ? '\nStack: ' + error.stack : ''}` : 
      String(error);
    
    console.error(`API error for ${endpoint}:`, errorMessage);
    
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
