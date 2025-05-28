
// Shared utility for interacting with the Claim.MD API

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// Updated API base URL to use svc.claim.md as per documentation v1.17
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

// Log API interactions to the api_logs table with enhanced detail capture
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

// Function to capture and log the complete HTTP request with all headers and body
async function logCompleteHttpRequest(method: string, url: string, headers: Record<string, string>, body: string | FormData | URLSearchParams): Promise<string> {
  try {
    // Format headers for display
    const headersStr = Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    
    // Format body based on type
    let bodyStr = '';
    if (body instanceof URLSearchParams) {
      bodyStr = body.toString();
    } else if (body instanceof FormData) {
      bodyStr = '[FormData object - contents cannot be fully serialized]';
    } else {
      bodyStr = body;
    }
    
    // Create complete request log with HTTP/1.1 format
    const requestLog = `
========== COMPLETE RAW HTTP REQUEST ==========
${method} ${new URL(url).pathname} HTTP/1.1
Host: ${new URL(url).host}
${headersStr}

${bodyStr}
==============================================
`;
    
    console.log(requestLog);
    
    // Save to api_logs for later inspection with a special marker
    const { data, error } = await supabase
      .from('api_logs')
      .insert({
        endpoint: 'raw_request_capture',
        request_payload: {
          method,
          url,
          headers: headers,
          body: bodyStr,
          timestamp: new Date().toISOString(),
          formatted_request: requestLog
        },
        response_data: null,
        status: 'debug',
        error_message: null,
        client_id: null,
        processing_time_ms: 0
      })
      .select('id');
      
    const logId = data?.[0]?.id || 'unknown';
    console.log(`Raw request logged with ID: ${logId}`);
    return logId;
      
  } catch (err) {
    console.error('Failed to log complete HTTP request:', err);
    return 'error_logging';
  }
}

// Function to capture and log the complete HTTP response
async function logCompleteHttpResponse(logId: string, response: Response, responseBody: string): Promise<void> {
  try {
    // Format response headers
    const headersStr = Array.from(response.headers.entries())
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    
    // Create complete response log with HTTP/1.1 format
    const responseLog = `
========== COMPLETE RAW HTTP RESPONSE ==========
HTTP/1.1 ${response.status} ${response.statusText}
${headersStr}

${responseBody}
===============================================
`;
    
    console.log(responseLog);
    
    // Update the existing log entry with response data
    await supabase
      .from('api_logs')
      .update({
        response_data: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseBody,
          timestamp: new Date().toISOString(),
          formatted_response: responseLog
        }
      })
      .eq('id', logId);
      
  } catch (err) {
    console.error('Failed to log complete HTTP response:', err);
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

// Map endpoint aliases to their full API paths - updated to use correct endpoint names
const endpointMap: Record<string, string> = {
  'eralist': 'eralist/',
  'era/list': 'eralist/',
  'eradata': 'eradata/',
  'era/data': 'eradata/',
  'era835': 'era835/',
  'era/835': 'era835/',
  'response': 'response/',
  // Add other endpoints as needed
};

// Resolve the endpoint to the correct full path
function resolveEndpoint(endpoint: string): string {
  // Check if we have a mapping for this endpoint
  if (endpointMap[endpoint.toLowerCase()]) {
    return endpointMap[endpoint.toLowerCase()];
  }
  
  // If no mapping exists, return the original endpoint
  // but ensure it ends with a trailing slash as required by the API
  return endpoint.endsWith('/') ? endpoint : `${endpoint}/`;
}

// Determine if an endpoint should use URL-encoded form data - FIXED to include response endpoint
function requiresUrlEncodedData(endpointPath: string): boolean {
  const lowerPath = endpointPath.toLowerCase();
  return lowerPath.includes('elig') || 
         lowerPath.includes('eligibility') || 
         lowerPath === 'eralist' || 
         lowerPath === 'era/list' ||
         lowerPath === 'eralist/' || 
         lowerPath === 'eradata' || 
         lowerPath === 'era/data' ||
         lowerPath === 'eradata/' || 
         lowerPath === 'era835' ||
         lowerPath === 'era/835' ||
         lowerPath === 'era835/' ||
         lowerPath === 'response' ||
         lowerPath === 'response/';
}

// Determine if an endpoint should use multipart form data
function requiresMultipartFormData(endpointPath: string): boolean {
  const lowerPath = endpointPath.toLowerCase();
  return lowerPath === 'upload/' || lowerPath === 'upload';
}

// The main function to call Claim.MD API endpoints with enhanced logging
export async function callClaimMdApi(
  endpoint: string,
  body: any,
  clientId: string | null = null,
  timeout: number = 30000 // 30 second default timeout
): Promise<{ success: boolean; data?: any; error?: string }> {
  const apiKey = getApiKey();
  const startTime = performance.now();
  
  try {
    // Resolve the correct endpoint path based on the API documentation
    const resolvedEndpoint = resolveEndpoint(endpoint);
    
    // Enhanced logging to see exactly which endpoint is being called
    const fullUrl = `${CLAIMMD_BASE_URL}/${resolvedEndpoint}`;
    console.log(`Calling Claim.MD API: ${endpoint} (resolved to: ${resolvedEndpoint})`);
    console.log(`Full API URL: ${fullUrl}`);
    
    // Determine request format based on endpoint
    const endpointPath = endpoint.toLowerCase();
    const isUrlEncodedData = requiresUrlEncodedData(endpointPath);
    const isMultipartFormData = requiresMultipartFormData(endpointPath);
    
    // Log the request format determination
    console.log(`Request format: ${isMultipartFormData ? 'multipart/form-data' : (isUrlEncodedData ? 'application/x-www-form-urlencoded' : 'application/json')}`);
    
    // IMPORTANT: Claim.MD requires the AccountKey parameter with correct casing
    // Create a new object with AccountKey first, then add all other properties
    const requestWithApiKey = {
      AccountKey: apiKey,
      ...body // Add all other parameters after AccountKey
    };
    
    console.log(`Request body before serialization:`, JSON.stringify(requestWithApiKey));
    
    // Variables for request configuration
    let requestContentType: string;
    let serializedBody: string | FormData | URLSearchParams;
    
    if (isUrlEncodedData) {
      // For eligibility, ERA, and response endpoints, use application/x-www-form-urlencoded
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
    } else if (isMultipartFormData) {
      // For upload endpoint, use multipart/form-data
      // Do NOT manually set Content-Type - it will be automatically set with boundary
      requestContentType = 'multipart/form-data';
      
      // Create FormData object
      const formData = new FormData();
      
      // Add AccountKey as the first parameter
      formData.append('AccountKey', apiKey);
      
      // For upload endpoint, the claim data needs to be added as a File/Blob
      if (typeof body.claims === 'object') {
        // Convert claims to JSON string
        const claimsJson = JSON.stringify(body.claims);
        const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '');
        const filename = `claims_batch_${timestamp}.json`;
        
        // Create a Blob with the JSON data
        const claimsBlob = new Blob([claimsJson], { type: 'application/json' });
        
        // Append as File parameter per API docs
        formData.append('File', claimsBlob, filename);
        
        console.log(`Appending claims data as File with filename: ${filename}, size: ${claimsJson.length} bytes`);
      } else {
        console.warn('WARNING: Claims data not found or not in expected format');
        // Fallback to sending as stringified JSON directly
        formData.append('File', JSON.stringify(body), 'claims.json');
      }
      
      serializedBody = formData;
      
      // Log multipart form data parts (we can't log the full serialized body)
      console.log(`CRITICAL - MULTIPART FORM DATA PARTS:`);
      console.log(`Part 1: AccountKey=${apiKey}`);
      console.log(`Part 2: File (claims data as JSON file)`);
    } else {
      // For other endpoints, default to JSON
      requestContentType = 'application/json';
      serializedBody = JSON.stringify(requestWithApiKey);
    }
    
    const makeRequest = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        // Prepare headers based on request type
        const headers: Record<string, string> = {
          'Accept': 'application/json' // Prefer JSON responses if available
        };
        
        // Only set Content-Type for JSON and URL-encoded requests
        // For multipart/form-data, let the browser/runtime set it automatically with boundary
        if (!isMultipartFormData) {
          headers['Content-Type'] = requestContentType;
        }
        
        // Log the complete HTTP request with full details before sending
        const requestLogId = await logCompleteHttpRequest('POST', fullUrl, headers, serializedBody);
        
        // Make the request
        console.log(`Making API request to ${fullUrl}`);
        const response = await fetch(fullUrl, {
          method: 'POST',
          headers,
          body: serializedBody,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        // Get processing time
        const processingTime = Math.round(performance.now() - startTime);
        console.log(`API response received in ${processingTime}ms with status: ${response.status} ${response.statusText}`);
        console.log(`Response headers:`, JSON.stringify(Object.fromEntries([...response.headers.entries()])));
        
        // Clone the response to avoid "Body already consumed" errors
        const responseClone = response.clone();
        
        // Always get the raw text for logging
        let responseText = await response.text();
        console.log(`Raw API response (first 500 chars): ${responseText.substring(0, 500)}`);
        
        // Log the complete HTTP response with full details
        await logCompleteHttpResponse(requestLogId, responseClone, responseText);
        
        // Determine response type from headers  
        const responseType = getResponseType(responseClone);
        console.log(`Response content type determined to be: ${responseType}`);
        
        // Handle the response based on content type
        let responseData;
        let errorMessage = null;
        
        try {
          // Process response based on content type (we already have the text)
          if (responseType === 'json') {
            try {
              responseData = JSON.parse(responseText);
              console.log(`Parsed JSON response successfully`);
              
              // Check for Claim.MD specific error structures
              if (responseData && responseData.error) {
                const errorCode = responseData.error.error_code || 'unknown';
                const errorMsg = responseData.error.error_mesg || 'Unknown API error';
                errorMessage = `Claim.MD API Error: ${errorMsg} (Code: ${errorCode})`;
                console.error(errorMessage);
              }
              
              // Handle nested error structures
              if (responseData && responseData.elig && responseData.elig.error) {
                const errorCode = responseData.elig.error[0]?.error_code || 'unknown';
                const errorMsg = responseData.elig.error[0]?.error_mesg || 'Unknown API error';
                errorMessage = `Claim.MD API Error: ${errorMsg} (Code: ${errorCode})`;
                console.error(errorMessage);
                
                responseData.error = {
                  error_code: errorCode,
                  error_mesg: errorMsg
                };
              }
            } catch (jsonErr) {
              console.error('Failed to parse as JSON despite content type:', jsonErr);
              responseData = { 
                raw: responseText, 
                contentType: responseType,
                parseError: jsonErr instanceof Error ? jsonErr.message : String(jsonErr)
              };
              errorMessage = `Failed to parse JSON response: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`;
            }
          } else if (responseType === 'xml') {
            // For XML, store as text
            console.log(`Received XML response, storing as text`);
            responseData = { 
              raw: responseText,
              contentType: responseType,
              format: 'xml'
            };
          } else {
            // Default to text for unknown types
            console.log(`Received plain text response`);
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
        
        // Determine success based on HTTP status and API error data
        const success = response.ok && !errorMessage;
        if (!success && !errorMessage) {
          errorMessage = `API returned status ${response.status} ${response.statusText}`;
        }
        
        // Log the API interaction to the database
        await logApiInteraction(
          endpoint,
          isMultipartFormData ? 
            { type: 'multipart/form-data', parts: ['AccountKey', 'File'] } : 
            (isUrlEncodedData ? 
              (typeof serializedBody === 'string' ? serializedBody : serializedBody.toString()) : 
              requestWithApiKey),
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
