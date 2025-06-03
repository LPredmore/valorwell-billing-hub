
interface ExportOptions {
  format: 'csv' | 'pdf' | 'excel';
  fields: string[];
  includeFiltered: boolean;
  includeDetails: boolean;
}

interface EnhancedSubmittedClaim {
  id: string;
  start_at: string;
  claim_claimmd_id: string;
  client: {
    id: string;
    name: string;
    insurance: string;
  };
  provider: {
    id: string;
    name: string;
  };
  clinical: {
    cpt_code: string;
    modifiers: string[];
    diagnosis_code_pointers: string;
    place_of_service_code: string;
  };
  financial: {
    billed_amount: number;
    insurance_paid_amount: number | null;
    patient_responsibility_amount: number | null;
    insurance_adjustment_amount: number | null;
    insurance_adjustment_details: any;
  };
  status: {
    claim_status: string;
    last_submission_date: string | null;
    last_status_check: string | null;
    response_details: any;
    denial_details: any;
  };
  payment: {
    era_payment_date: string | null;
    era_check_eft_number: string | null;
    era_claimmd_id: string | null;
  };
  notes: {
    billing_notes: string | null;
  };
}

export function exportClaimsToCSV(claims: EnhancedSubmittedClaim[], options: ExportOptions) {
  const headers = getExportHeaders(options.fields, options.includeDetails);
  const rows = claims.map(claim => getExportRow(claim, options.fields, options.includeDetails));
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  downloadFile(csvContent, 'claims-export.csv', 'text/csv');
}

export function exportClaimsToPDF(claims: EnhancedSubmittedClaim[], options: ExportOptions) {
  // This would typically use a PDF library like jsPDF
  // For now, we'll create a simple text-based PDF content
  const headers = getExportHeaders(options.fields, options.includeDetails);
  const rows = claims.map(claim => getExportRow(claim, options.fields, options.includeDetails));
  
  let pdfContent = `Claims Export Report\n`;
  pdfContent += `Generated: ${new Date().toLocaleString()}\n`;
  pdfContent += `Total Claims: ${claims.length}\n\n`;
  
  pdfContent += headers.join('\t') + '\n';
  pdfContent += '-'.repeat(80) + '\n';
  
  rows.forEach(row => {
    pdfContent += row.join('\t') + '\n';
  });

  downloadFile(pdfContent, 'claims-export.txt', 'text/plain');
  console.log('PDF export would require a PDF library like jsPDF for proper formatting');
}

export function exportClaimsToExcel(claims: EnhancedSubmittedClaim[], options: ExportOptions) {
  // This would typically use a library like SheetJS
  // For now, we'll export as CSV with .xlsx extension
  exportClaimsToCSV(claims, options);
  console.log('Excel export would require a library like SheetJS for proper formatting');
}

function getExportHeaders(fields: string[], includeDetails: boolean): string[] {
  const fieldMap: Record<string, string> = {
    patient_name: 'Patient Name',
    claim_id: 'Claim ID',
    service_date: 'Service Date',
    provider_name: 'Provider Name',
    cpt_code: 'CPT Code',
    billed_amount: 'Billed Amount',
    paid_amount: 'Paid Amount',
    patient_responsibility: 'Patient Responsibility',
    claim_status: 'Claim Status',
    submission_date: 'Submission Date',
    insurance_company: 'Insurance Company',
    diagnosis_codes: 'Diagnosis Codes',
    denial_reason: 'Denial Reason',
    adjustment_details: 'Adjustment Details'
  };

  const headers = fields.map(field => fieldMap[field] || field);
  
  if (includeDetails) {
    headers.push('Response Details', 'Adjustment JSON', 'Notes');
  }

  return headers;
}

function getExportRow(claim: EnhancedSubmittedClaim, fields: string[], includeDetails: boolean): string[] {
  const fieldMap: Record<string, string> = {
    patient_name: claim.client.name,
    claim_id: claim.claim_claimmd_id,
    service_date: new Date(claim.start_at).toLocaleDateString(),
    provider_name: claim.provider.name,
    cpt_code: claim.clinical.cpt_code,
    billed_amount: claim.financial.billed_amount.toString(),
    paid_amount: claim.financial.insurance_paid_amount?.toString() || '',
    patient_responsibility: claim.financial.patient_responsibility_amount?.toString() || '',
    claim_status: claim.status.claim_status,
    submission_date: claim.status.last_submission_date ? new Date(claim.status.last_submission_date).toLocaleDateString() : '',
    insurance_company: claim.client.insurance,
    diagnosis_codes: claim.clinical.diagnosis_code_pointers,
    denial_reason: getDenialReason(claim),
    adjustment_details: getAdjustmentSummary(claim)
  };

  const row = fields.map(field => fieldMap[field] || '');
  
  if (includeDetails) {
    row.push(
      JSON.stringify(claim.status.response_details) || '',
      JSON.stringify(claim.financial.insurance_adjustment_details) || '',
      claim.notes.billing_notes || ''
    );
  }

  return row;
}

function getDenialReason(claim: EnhancedSubmittedClaim): string {
  if (claim.status.denial_details) {
    if (typeof claim.status.denial_details === 'string') {
      return claim.status.denial_details;
    }
    if (claim.status.denial_details.reason) {
      return claim.status.denial_details.reason;
    }
  }
  return '';
}

function getAdjustmentSummary(claim: EnhancedSubmittedClaim): string {
  if (claim.financial.insurance_adjustment_details) {
    if (typeof claim.financial.insurance_adjustment_details === 'string') {
      return claim.financial.insurance_adjustment_details;
    }
    if (claim.financial.insurance_adjustment_details.summary) {
      return claim.financial.insurance_adjustment_details.summary;
    }
  }
  return claim.financial.insurance_adjustment_amount?.toString() || '';
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}
