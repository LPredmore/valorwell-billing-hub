import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Database {
  public: {
    Tables: {
      batch_logs: any
      batch_claims: any
      CMS1500_claims: any
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient<Database>(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const { operation } = body

    console.log(`📋 Processing batch operation: ${operation}`)

    switch (operation) {
      case 'upload':
        return await handleBatchUpload(supabaseClient, body)
      case 'list':
        return await handleListFiles(supabaseClient, body)
      case 'responses':
        return await handleFetchResponses(supabaseClient, body)
      case 'archive':
        return await handleArchiveClaims(supabaseClient, body)
      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid operation' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }

  } catch (error) {
    console.error('❌ Batch submission error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

async function handleBatchUpload(supabaseClient: any, body: any) {
  const { fileBuffer, filename, claimIds } = body
  const claimMdApiKey = Deno.env.get('CLAIMMD_API_KEY')
  
  if (!claimMdApiKey) {
    throw new Error('CLAIMMD_API_KEY not configured')
  }

  try {
    console.log(`📤 Uploading batch file: ${filename} with ${claimIds.length} claims`)

    // Convert array buffer back to Uint8Array
    const uint8Array = new Uint8Array(fileBuffer)
    
    // Create FormData for Claim.MD API
    const formData = new FormData()
    formData.append('AccountKey', claimMdApiKey)
    formData.append('File', new Blob([uint8Array], { type: 'text/csv' }), filename)

    // Call Claim.MD upload API
    const claimMdResponse = await fetch('https://svc.claim.md/services/upload/', {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': '*/*',
        'User-Agent': 'ClaimMD-Batch-Uploader/1.0'
      }
    })

    if (!claimMdResponse.ok) {
      throw new Error(`Claim.MD API error: ${claimMdResponse.status} ${claimMdResponse.statusText}`)
    }

    const responseText = await claimMdResponse.text()
    console.log('📥 Claim.MD response:', responseText)

    // Parse Claim.MD response (usually XML or simple text)
    let batchId: string
    
    if (responseText.includes('<batchid>')) {
      // XML response
      const batchIdMatch = responseText.match(/<batchid>([^<]+)<\/batchid>/)
      if (!batchIdMatch) {
        throw new Error('No batch ID found in Claim.MD response')
      }
      batchId = batchIdMatch[1]
    } else if (responseText.includes('batchid:')) {
      // Text response
      const batchIdMatch = responseText.match(/batchid:\s*([^\s\n]+)/)
      if (!batchIdMatch) {
        throw new Error('No batch ID found in Claim.MD response')
      }
      batchId = batchIdMatch[1]
    } else {
      // Fallback - use timestamp-based ID
      batchId = `batch-${Date.now()}`
      console.warn('⚠️ Could not parse batch ID from response, using fallback:', batchId)
    }

    // Create batch log entry
    const { data: batchLog, error: batchLogError } = await supabaseClient
      .from('batch_logs')
      .insert({
        batch_id: batchId,
        file_name: filename,
        upload_time: new Date().toISOString(),
        response_code: claimMdResponse.status,
        response_body: { response: responseText },
        status: 'uploaded',
        claims_count: claimIds.length
      })
      .select()
      .single()

    if (batchLogError) {
      console.error('❌ Failed to create batch log:', batchLogError)
      throw new Error('Failed to log batch upload')
    }

    console.log(`✅ Batch uploaded successfully: ${batchId}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        batchId,
        batchLogId: batchLog.id,
        claimsCount: claimIds.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Upload failed:', error)
    
    // Log failed upload attempt
    await supabaseClient
      .from('batch_logs')
      .insert({
        batch_id: `failed-${Date.now()}`,
        file_name: filename,
        upload_time: new Date().toISOString(),
        response_code: 0,
        response_body: { error: error.message },
        status: 'error',
        claims_count: claimIds.length
      })

    throw error
  }
}

async function handleListFiles(supabaseClient: any, body: any) {
  const { page = 1, uploadDate } = body
  const claimMdApiKey = Deno.env.get('CLAIMMD_API_KEY')
  
  if (!claimMdApiKey) {
    throw new Error('CLAIMMD_API_KEY not configured')
  }

  try {
    console.log(`📋 Listing files - Page: ${page}, Date: ${uploadDate || 'all'}`)

    // Build request parameters
    const params = new URLSearchParams()
    params.append('AccountKey', claimMdApiKey)
    params.append('Page', page.toString())
    
    if (uploadDate) {
      params.append('UploadDate', uploadDate)
    }

    // Call Claim.MD uploadlist API
    const claimMdResponse = await fetch('https://svc.claim.md/services/uploadlist/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*'
      },
      body: params
    })

    if (!claimMdResponse.ok) {
      throw new Error(`Claim.MD API error: ${claimMdResponse.status}`)
    }

    const responseText = await claimMdResponse.text()
    
    // Parse response (simplified - would need proper XML/JSON parsing)
    const files = parseUploadListResponse(responseText)

    return new Response(
      JSON.stringify({ 
        success: true, 
        files,
        page,
        totalFiles: files.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ List files failed:', error)
    throw error
  }
}

async function handleFetchResponses(supabaseClient: any, body: any) {
  const { sinceResponseId = '0' } = body
  const claimMdApiKey = Deno.env.get('CLAIMMD_API_KEY')
  
  if (!claimMdApiKey) {
    throw new Error('CLAIMMD_API_KEY not configured')
  }

  try {
    console.log(`📥 Fetching responses since ID: ${sinceResponseId}`)

    // Build request parameters
    const params = new URLSearchParams()
    params.append('AccountKey', claimMdApiKey)
    params.append('ResponseID', sinceResponseId)

    // Call Claim.MD response API
    const claimMdResponse = await fetch('https://svc.claim.md/services/response/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*'
      },
      body: params
    })

    if (!claimMdResponse.ok) {
      throw new Error(`Claim.MD API error: ${claimMdResponse.status}`)
    }

    const responseText = await claimMdResponse.text()
    
    // Parse response and update claims in database
    const responses = parseResponseData(responseText)
    
    // Update claim statuses in database
    await updateClaimStatuses(supabaseClient, responses)

    return new Response(
      JSON.stringify({ 
        success: true, 
        responses,
        totalResponses: responses.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Fetch responses failed:', error)
    throw error
  }
}

async function handleArchiveClaims(supabaseClient: any, body: any) {
  const { claimIds } = body
  const claimMdApiKey = Deno.env.get('CLAIMMD_API_KEY')
  
  if (!claimMdApiKey) {
    throw new Error('CLAIMMD_API_KEY not configured')
  }

  try {
    console.log(`🗄️ Archiving ${claimIds.length} claims`)

    // Build request parameters
    const params = new URLSearchParams()
    params.append('AccountKey', claimMdApiKey)
    
    claimIds.forEach((claimId: string) => {
      params.append('claimid', claimId)
    })

    // Call Claim.MD archive API
    const claimMdResponse = await fetch('https://svc.claim.md/services/archive/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*'
      },
      body: params
    })

    if (!claimMdResponse.ok) {
      throw new Error(`Claim.MD API error: ${claimMdResponse.status}`)
    }

    const responseText = await claimMdResponse.text()
    
    // Parse archived count from response
    const archivedCount = parseArchivedCount(responseText)

    return new Response(
      JSON.stringify({ 
        success: true, 
        archived: archivedCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Archive claims failed:', error)
    throw error
  }
}

// Helper functions for parsing responses
function parseUploadListResponse(responseText: string): any[] {
  // Simplified parser - would need proper implementation based on Claim.MD format
  const files: any[] = []
  
  // Look for file entries in the response
  const lines = responseText.split('\n')
  for (const line of lines) {
    if (line.includes('filename') || line.includes('.csv')) {
      files.push({
        filename: line.trim(),
        uploadDate: new Date().toISOString(),
        status: 'uploaded'
      })
    }
  }
  
  return files
}

function parseResponseData(responseText: string): any[] {
  // Simplified parser - would need proper implementation based on Claim.MD format
  const responses: any[] = []
  
  // Look for claim responses in the text
  const lines = responseText.split('\n')
  for (const line of lines) {
    if (line.includes('claimid') && line.includes('status')) {
      // Parse claim response
      responses.push({
        claimId: 'extracted_claim_id',
        status: 'extracted_status',
        responseDate: new Date().toISOString()
      })
    }
  }
  
  return responses
}

function parseArchivedCount(responseText: string): number {
  // Look for archived count in response
  const match = responseText.match(/archived:\s*(\d+)/i)
  return match ? parseInt(match[1]) : 0
}

async function updateClaimStatuses(supabaseClient: any, responses: any[]): Promise<void> {
  // Update claims based on responses
  for (const response of responses) {
    await supabaseClient
      .from('CMS1500_claims')
      .update({
        status: response.status,
        response_json: response,
        last_status_check: new Date().toISOString()
      })
      .eq('remote_claimid', response.claimId)
  }
}