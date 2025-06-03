
import { useMemo } from 'react';
import { ClaimsFilter, ClaimsSort } from '@/components/claims/enhanced/ClaimsFilterBar';

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

export function useClaimsFiltering(
  claims: EnhancedSubmittedClaim[],
  filters: ClaimsFilter,
  sort: ClaimsSort
) {
  const filteredAndSortedClaims = useMemo(() => {
    if (!claims) return [];

    // Apply filters
    let filtered = claims.filter((claim) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          claim.client.name.toLowerCase().includes(searchLower) ||
          claim.provider.name.toLowerCase().includes(searchLower) ||
          claim.clinical.cpt_code.toLowerCase().includes(searchLower) ||
          claim.claim_claimmd_id.toLowerCase().includes(searchLower) ||
          claim.client.insurance.toLowerCase().includes(searchLower);
        
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filters.status !== 'all') {
        const statusMatch = claim.status.claim_status?.toLowerCase().includes(filters.status.toLowerCase());
        if (!statusMatch) return false;
      }

      // Date range filter
      if (filters.dateRange.from || filters.dateRange.to) {
        const claimDate = new Date(claim.start_at);
        if (filters.dateRange.from && claimDate < filters.dateRange.from) return false;
        if (filters.dateRange.to && claimDate > filters.dateRange.to) return false;
      }

      // Amount range filter
      if (filters.amountRange.min !== null || filters.amountRange.max !== null) {
        const amount = claim.financial.billed_amount;
        if (filters.amountRange.min !== null && amount < filters.amountRange.min) return false;
        if (filters.amountRange.max !== null && amount > filters.amountRange.max) return false;
      }

      // Provider filter
      if (filters.provider) {
        const providerMatch = claim.provider.name.toLowerCase().includes(filters.provider.toLowerCase());
        if (!providerMatch) return false;
      }

      // Insurance filter
      if (filters.insurance) {
        const insuranceMatch = claim.client.insurance.toLowerCase().includes(filters.insurance.toLowerCase());
        if (!insuranceMatch) return false;
      }

      // CPT Code filter
      if (filters.cptCode) {
        const cptMatch = claim.clinical.cpt_code.toLowerCase().includes(filters.cptCode.toLowerCase());
        if (!cptMatch) return false;
      }

      return true;
    });

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sort.field) {
        case 'date':
          comparison = new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
          break;
        case 'patient':
          comparison = a.client.name.localeCompare(b.client.name);
          break;
        case 'provider':
          comparison = a.provider.name.localeCompare(b.provider.name);
          break;
        case 'amount':
          comparison = a.financial.billed_amount - b.financial.billed_amount;
          break;
        case 'status':
          comparison = (a.status.claim_status || '').localeCompare(b.status.claim_status || '');
          break;
        default:
          comparison = 0;
      }

      return sort.direction === 'desc' ? -comparison : comparison;
    });

    return filtered;
  }, [claims, filters, sort]);

  return filteredAndSortedClaims;
}
