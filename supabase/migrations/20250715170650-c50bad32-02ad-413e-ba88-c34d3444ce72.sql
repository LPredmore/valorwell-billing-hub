-- Phase 1: Database Enhancements for Batch Claims Submission

-- 1.1 Add batch tracking fields to CMS1500_claims if missing
ALTER TABLE public.CMS1500_claims 
ADD COLUMN IF NOT EXISTS submission_history JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS batch_status TEXT DEFAULT 'pending' CHECK (batch_status IN ('pending', 'submitted', 'processing', 'completed', 'error', 'archived'));

-- 1.2 Create batch processing tables
CREATE TABLE IF NOT EXISTS public.batch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL,
  file_name TEXT,
  upload_time TIMESTAMP WITH TIME ZONE DEFAULT now(),
  response_code INTEGER,
  response_body JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'processing', 'completed', 'error')),
  claims_count INTEGER DEFAULT 0,
  successful_claims INTEGER DEFAULT 0,
  failed_claims INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create batch claims relationship table for tracking which claims are in which batch
CREATE TABLE IF NOT EXISTS public.batch_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_log_id UUID REFERENCES public.batch_logs(id) ON DELETE CASCADE,
  claim_id UUID REFERENCES public.CMS1500_claims(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'accepted', 'rejected', 'error')),
  submission_order INTEGER,
  error_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(batch_log_id, claim_id)
);

-- 1.3 Performance indexes
CREATE INDEX IF NOT EXISTS idx_cms1500_batch_id ON public.CMS1500_claims(claim_md_batch_id);
CREATE INDEX IF NOT EXISTS idx_cms1500_last_submission ON public.CMS1500_claims(last_submission);
CREATE INDEX IF NOT EXISTS idx_cms1500_batch_status ON public.CMS1500_claims(batch_status);
CREATE INDEX IF NOT EXISTS idx_batch_logs_batch_id ON public.batch_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_logs_status ON public.batch_logs(status);
CREATE INDEX IF NOT EXISTS idx_batch_claims_batch_log_id ON public.batch_claims(batch_log_id);
CREATE INDEX IF NOT EXISTS idx_batch_claims_claim_id ON public.batch_claims(claim_id);

-- 1.4 Enhanced system health metrics for batch processing
INSERT INTO public.system_health_metrics (metric_name, metric_value, metric_category, created_at)
VALUES 
  ('batch_submission_rate', 0, 'performance', now()),
  ('avg_batch_processing_time', 0, 'performance', now()),
  ('batch_success_rate', 0, 'quality', now()),
  ('pending_batches_count', 0, 'operational', now())
ON CONFLICT (metric_name) DO NOTHING;

-- 1.5 Create trigger for updating batch_logs updated_at
CREATE OR REPLACE FUNCTION update_batch_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_batch_logs_updated_at
  BEFORE UPDATE ON public.batch_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_batch_logs_updated_at();

-- 1.6 Create trigger for updating batch_claims updated_at
CREATE TRIGGER trigger_update_batch_claims_updated_at
  BEFORE UPDATE ON public.batch_claims
  FOR EACH ROW
  EXECUTE FUNCTION update_batch_logs_updated_at();

-- 1.7 RLS policies for batch tables
ALTER TABLE public.batch_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_claims ENABLE ROW LEVEL SECURITY;

-- Allow admins to manage all batch data
CREATE POLICY "Admins can manage all batch logs" ON public.batch_logs
  FOR ALL USING (user_has_admin_role(auth.uid()));

CREATE POLICY "Admins can manage all batch claims" ON public.batch_claims
  FOR ALL USING (user_has_admin_role(auth.uid()));

-- Allow service role to manage batch data (for edge functions)
CREATE POLICY "Service role can manage batch logs" ON public.batch_logs
  FOR ALL USING (true);

CREATE POLICY "Service role can manage batch claims" ON public.batch_claims
  FOR ALL USING (true);