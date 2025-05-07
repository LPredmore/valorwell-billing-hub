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
  // We need to get the key from the CLAIMMD_API_KEY environment variable
  // as specified in the instructions
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

// Determine the response type based on content-type header
function getResponseType(response: Response): 'json' | 'xml' | 'text' {
  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    return 'json';
  } else if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
    return 'xml';
  } else {
    return 'text';
  }
}

// Helper function to flatten complex objects for URLSearchParams
function flattenObject(obj: any, prefix = ''): Record<string, string> {
  return Object.keys(obj).reduce((acc: Record<string, string>, k) => {
    const pre = prefix.length ? prefix + '.' : '';
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      Object.assign(acc, flattenObject(obj[k], pre + k));
    } else if (Array.isArray(obj[k])) {
      // Handle arrays properly - Claim.MD may expect specific formatting for arrays
      obj[k].forEach((item: any, i: number) => {
        if (typeof item === 'object' && item !== null) {
          Object.assign(acc, flattenObject(item, `${pre}${k}[${i}]`));
        } else {
          acc[`${pre}${k}[${i}]`] = String(item);
        }
      });
    } else {
      // Ensure values are strings
      acc[pre + k] = obj[k] === null || obj[k] === undefined ? '' : String(obj[k]);
    }
    return acc;
  }, {});
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
    
    // IMPORTANT: Claim.MD requires the AccountKey parameter in the request body with correct casing
    // Create a new object with AccountKey first, then add all other properties
    const requestWithApiKey = {
      AccountKey: apiKey,
      ...body // Add all other parameters after AccountKey
    };
    
    console.log(`Request body before serialization:`, JSON.stringify(requestWithApiKey));
    
    // Use different request handling based on the endpoint needs
    const isEligibilityEndpoint = endpoint.toLowerCase().includes('eligibility') || endpoint.toLowerCase().includes('elig');
    let requestContentType: string;
    let serializedBody: string | FormData | URLSearchParams;
    
    if (isEligibilityEndpoint) {
      // For eligibility endpoints, use application/x-www-form-urlencoded
      requestContentType = 'application/x-www-form-urlencoded';
      
      // IMPORTANT: Create URLSearchParams with AccountKey as the first parameter
      const formData = new URLSearchParams();
      
      // Explicitly add AccountKey first to ensure it's the first parameter in the serialized string
      formData.append('AccountKey', apiKey);
      
      // Then add all other parameters
      Object.entries(body).forEach(([key, value]) => {
        if (key !== 'AccountKey') {  // Skip AccountKey as we've already added it
          formData.append(key, value as string);
        }
      });
      
      serializedBody = formData;
      
      // DEBUG: Log the exact URL-encoded string that will be sent
      const rawRequestBody = formData.toString();
      console.log(`CRITICAL - RAW REQUEST BODY (URL-encoded string):`);
      console.log(`${rawRequestBody}`);
      
      // DEBUG: Verify AccountKey is the first parameter
      if (!rawRequestBody.startsWith('AccountKey=')) {
        console.warn('WARNING: AccountKey is NOT the first parameter in the request body!');
      }
    } else {
      // For other endpoints, default to JSON
      requestContentType = 'application/json';
      serializedBody = JSON.stringify(requestWithApiKey);
    }
    
    const makeRequest = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        // DEBUG: Log request details immediately before fetch
        console.log('=== FULL REQUEST DETAILS ===');
        console.log(`Method: POST`);
        console.log(`URL: ${CLAIMMD_BASE_URL}/${endpoint}`);
        console.log(`Headers: Content-Type: ${requestContentType}, Accept: application/json`);
        console.log(`Body: ${typeof serializedBody === 'string' ? serializedBody : serializedBody.toString()}`);
        console.log('=== END REQUEST DETAILS ===');
        
        const response = await fetch(`${CLAIMMD_BASE_URL}/${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': requestContentType,
            'Accept': 'application/json' // Prefer JSON responses if available
          },
          body: serializedBody,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        // Get processing time
        const processingTime = Math.round(performance.now() - startTime);
        console.log(`API response received in ${processingTime}ms with status: ${response.status} ${response.statusText}`);
        console.log(`Response headers:`, JSON.stringify(Object.fromEntries([...response.headers.entries()])));
        
        // Determine content type from response headers
        const responseType = getResponseType(response);
        console.log(`Response content type determined to be: ${responseType}`);
        
        // Always get the raw text for logging
        let responseText = await response.text();
        console.log(`Raw API response (first 500 chars): ${responseText.substring(0, 500)}`);
        
        // Handle the response based on content type
        let responseData;
        let errorMessage = null;
        
        try {
          // Process response based on content type
          if (responseType === 'json') {
            try {
              // Parse the response text that we already retrieved
              responseData = JSON.parse(responseText);
              console.log(`Parsed JSON response successfully`);
              
              // IMPORTANT: Check for Claim.MD specific error structures in the response
              // This is critical for detecting API errors even with HTTP 200 status
              if (responseData && responseData.error) {
                const errorCode = responseData.error.error_code || 'unknown';
                const errorMsg = responseData.error.error_mesg || 'Unknown API error';
                errorMessage = `Claim.MD API Error: ${errorMsg} (Code: ${errorCode})`;
                console.error(errorMessage);
              } 
              
              // Special handling for eligibility response which may have errors in a nested structure
              if (responseData && responseData.elig && responseData.elig.error) {
                const errorCode = responseData.elig.error[0]?.error_code || 'unknown';
                const errorMsg = responseData.elig.error[0]?.error_mesg || 'Unknown API error';
                errorMessage = `Claim.MD API Error: ${errorMsg} (Code: ${errorCode})`;
                console.error(errorMessage);
                
                // Keep the data structure but mark it as an error for consistent handling
                responseData.error = {
                  error_code: errorCode,
                  error_mesg: errorMsg
                };
              }
            } catch (jsonErr) {
              console.error('Failed to parse as JSON despite content type:', jsonErr);
              responseData = { raw: responseText, contentType: responseType };
              errorMessage = `Failed to parse JSON response: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`;
            }
          } else if (responseType === 'xml') {
            // For XML, just store as text for now
            console.log(`Received XML response, storing as text (first 500 chars): ${responseText.substring(0, 500)}`);
            responseData = { 
              raw: responseText,
              contentType: responseType,
              format: 'xml'
            };
          } else {
            // Default to text for unknown types
            console.log(`Received plain text response (first 500 chars): ${responseText.substring(0, 500)}`);
            responseData = { 
              raw: responseText,
              contentType: responseType,
              format: 'text'
            };
          }
        } catch (parseErr) {
          // Handle parsing errors
          console.error('Failed to parse response body:', parseErr);
          responseData = { 
            status: response.status, 
            statusText: response.statusText,
            raw: responseText,
            error: 'Failed to parse response body',
            errorDetails: parseErr instanceof Error ? parseErr.message : String(parseErr)
          };
          errorMessage = `Failed to parse response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`;
        }
        
        // Determine success based on HTTP status and Claim.MD error data
        // IMPORTANT: Even with HTTP 200, consider it a failure if there's a Claim.MD error
        const success = response.ok && !errorMessage;
        if (!success && !errorMessage) {
          errorMessage = `API returned status ${response.status} ${response.statusText}`;
        }
        
        // Log the API interaction
        await logApiInteraction(
          endpoint,
          isEligibilityEndpoint ? typeof serializedBody === 'string' ? serializedBody : serializedBody.toString() : requestWithApiKey,
          responseData,
          success ? 'success' : 'error',
          errorMessage,
          clientId,
          processingTime
        );
        
        return { 
          success, 
          data: responseData,
          ...(errorMessage && { error: errorMessage })
        };
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
