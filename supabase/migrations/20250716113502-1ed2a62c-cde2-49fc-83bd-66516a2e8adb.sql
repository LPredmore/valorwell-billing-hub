-- Add missing fields to CMS1500_claims table for enhanced batch tracking
ALTER TABLE CMS1500_claims 
ADD COLUMN IF NOT EXISTS submission_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_batch_error TEXT;

-- Create claim_status_audit_trail table for comprehensive tracking
CREATE TABLE IF NOT EXISTS claim_status_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES CMS1500_claims(id) ON DELETE CASCADE,
  status_from TEXT,
  status_to TEXT NOT NULL,
  batch_id TEXT,
  error_message TEXT,
  changed_by UUID,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on the audit trail table
ALTER TABLE claim_status_audit_trail ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for audit trail
CREATE POLICY "Admins can manage audit trail"
ON claim_status_audit_trail
FOR ALL
USING (user_has_admin_role(auth.uid()));

-- Create batch_performance_metrics table for analytics
CREATE TABLE IF NOT EXISTS batch_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_date DATE NOT NULL,
  total_claims INTEGER DEFAULT 0,
  successful_claims INTEGER DEFAULT 0,
  failed_claims INTEGER DEFAULT 0,
  processing_time_minutes INTEGER DEFAULT 0,
  average_response_time_ms INTEGER DEFAULT 0,
  error_rate_percent NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on performance metrics
ALTER TABLE batch_performance_metrics ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for performance metrics
CREATE POLICY "Admins can view performance metrics"
ON batch_performance_metrics
FOR SELECT
USING (user_has_admin_role(auth.uid()));

CREATE POLICY "Service can manage performance metrics"
ON batch_performance_metrics
FOR ALL
USING (true);

-- Create automated_batch_schedules table for cron job management
CREATE TABLE IF NOT EXISTS automated_batch_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_name TEXT NOT NULL UNIQUE,
  cron_expression TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  run_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on schedules
ALTER TABLE automated_batch_schedules ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for schedules
CREATE POLICY "Admins can manage schedules"
ON automated_batch_schedules
FOR ALL
USING (user_has_admin_role(auth.uid()));

-- Create trigger for claim status audit trail
CREATE OR REPLACE FUNCTION log_claim_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO claim_status_audit_trail (
      claim_id,
      status_from,
      status_to,
      batch_id,
      error_message,
      changed_by,
      metadata
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      NEW.claim_md_batch_id,
      NEW.last_batch_error,
      auth.uid(),
      jsonb_build_object(
        'submission_attempts', NEW.submission_attempts,
        'last_submission', NEW.last_submission
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on CMS1500_claims for audit trail
DROP TRIGGER IF EXISTS cms1500_claims_status_audit ON CMS1500_claims;
CREATE TRIGGER cms1500_claims_status_audit
  AFTER UPDATE ON CMS1500_claims
  FOR EACH ROW
  EXECUTE FUNCTION log_claim_status_change();

-- Function to update batch performance metrics
CREATE OR REPLACE FUNCTION update_batch_performance_metrics(
  p_batch_date DATE,
  p_total_claims INTEGER,
  p_successful_claims INTEGER,
  p_failed_claims INTEGER,
  p_processing_time_minutes INTEGER,
  p_average_response_time_ms INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  error_rate NUMERIC(5,2);
BEGIN
  -- Calculate error rate
  error_rate := CASE 
    WHEN p_total_claims > 0 THEN (p_failed_claims::NUMERIC / p_total_claims::NUMERIC) * 100
    ELSE 0
  END;
  
  -- Insert or update metrics
  INSERT INTO batch_performance_metrics (
    batch_date,
    total_claims,
    successful_claims,
    failed_claims,
    processing_time_minutes,
    average_response_time_ms,
    error_rate_percent
  ) VALUES (
    p_batch_date,
    p_total_claims,
    p_successful_claims,
    p_failed_claims,
    p_processing_time_minutes,
    p_average_response_time_ms,
    error_rate
  )
  ON CONFLICT (batch_date) DO UPDATE SET
    total_claims = EXCLUDED.total_claims,
    successful_claims = EXCLUDED.successful_claims,
    failed_claims = EXCLUDED.failed_claims,
    processing_time_minutes = EXCLUDED.processing_time_minutes,
    average_response_time_ms = EXCLUDED.average_response_time_ms,
    error_rate_percent = EXCLUDED.error_rate_percent,
    updated_at = now();
END;
$$;

-- Insert default batch schedules
INSERT INTO automated_batch_schedules (schedule_name, cron_expression, is_active) VALUES 
('daily_batch_submission', '0 2 * * *', true),    -- Daily at 2 AM
('hourly_status_poll', '0 * * * *', true),        -- Every hour
('weekly_cleanup', '0 3 * * 0', true)             -- Weekly cleanup on Sunday at 3 AM
ON CONFLICT (schedule_name) DO NOTHING;