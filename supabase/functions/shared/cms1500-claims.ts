import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export interface CMS1500ClaimRow {
  appointment_id: string | null;
  claim_md_batch_id?: string | null;
  claim_md_id?: string | null;
  status?: string | null;
  last_submission?: string | null;
  last_status_check?: string | null;
  response_json?: any;
  remote_claimid: string;
  pcn: string;
  pat_name_f: string;
  pat_name_l: string;
  pat_dob: string;
  pat_sex: string;
  pat_addr_1: string;
  pat_city: string;
  pat_state: string;
  pat_zip: string;
  ins_name_f: string;
  ins_name_l: string;
  ins_dob: string;
  pat_rel: string;
  ins_number: string;
  ins_group?: string | null;
  ins_addr_1: string;
  ins_city: string;
  ins_state: string;
  ins_zip: string;
  payerid?: string | null;
  bill_taxid: string;
  bill_taxid_type: string;
  bill_npi: string;
  bill_name: string;
  bill_taxonomy: string;
  bill_addr_1: string;
  bill_addr_2?: string | null;
  bill_city: string;
  bill_state: string;
  bill_zip: string;
  prov_npi: string;
  prov_name_f: string;
  prov_name_l: string;
  prov_taxonomy?: string | null;
  diag_1?: string | null;
  diag_2?: string | null;
  diag_3?: string | null;
  diag_4?: string | null;
  diag_5?: string | null;
  diag_6?: string | null;
  diag_7?: string | null;
  diag_8?: string | null;
  diag_9?: string | null;
  diag_10?: string | null;
  diag_11?: string | null;
  diag_12?: string | null;
  total_charge: string;
  accept_assign: string;
  from_date: string;
  thru_date: string;
  proc_code: string;
  mod_1?: string | null;
  mod_2?: string | null;
  mod_3?: string | null;
  mod_4?: string | null;
  place_of_service: string;
  diag_ref: string;
  units: number;
  charge: number;
}

export async function insertCMS1500Claim(row: CMS1500ClaimRow) {
  const { error } = await supabase.from('CMS1500_claims').insert(row);
  if (error) {
    console.error('Error inserting CMS1500 claim:', error);
  }
}
