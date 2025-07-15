-- Phase 1: Enhanced Error Categorization and Structured Logging

-- Create enum for error categories
CREATE TYPE error_category AS ENUM (
  'api_authentication',
  'network_error', 
  'data_validation',
  'rate_limiting',
  'provider_enrollment',
  'payer_specific',
  'system_error'
);

-- Create enum for error severity levels
CREATE TYPE error_severity AS ENUM (
  'critical',
  'high',
  'medium', 
  'low',
  'informational'
);

-- Create enum for resolution status
CREATE TYPE resolution_status AS ENUM (
  'new',
  'in_progress',
  'resolved',
  'escalated',
  'closed'
);

-- Enhance the existing api_logs table with new error handling columns
ALTER TABLE api_logs 
ADD COLUMN error_category error_category,
ADD COLUMN error_severity error_severity,
ADD COLUMN resolution_status resolution_status DEFAULT 'new',
ADD COLUMN correlation_id UUID DEFAULT gen_random_uuid(),
ADD COLUMN retry_count INTEGER DEFAULT 0,
ADD COLUMN user_context JSONB,
ADD COLUMN client_context JSONB,
ADD COLUMN resolution_notes TEXT,
ADD COLUMN resolved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN resolved_by UUID,
ADD COLUMN response_time_ms INTEGER;

-- Create index for faster error analysis queries
CREATE INDEX idx_api_logs_error_category ON api_logs(error_category);
CREATE INDEX idx_api_logs_error_severity ON api_logs(error_severity);
CREATE INDEX idx_api_logs_resolution_status ON api_logs(resolution_status);
CREATE INDEX idx_api_logs_correlation_id ON api_logs(correlation_id);
CREATE INDEX idx_api_logs_created_at_desc ON api_logs(created_at DESC);

-- Create error monitoring table for real-time alerts
CREATE TABLE error_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_pattern TEXT NOT NULL,
  threshold_count INTEGER NOT NULL DEFAULT 5,
  time_window_minutes INTEGER NOT NULL DEFAULT 15,
  alert_enabled BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create system health metrics table
CREATE TABLE system_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  metric_type TEXT NOT NULL, -- 'response_time', 'error_rate', 'success_rate', etc
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  context JSONB
);

-- Create index for metrics queries
CREATE INDEX idx_system_health_metrics_name_time ON system_health_metrics(metric_name, recorded_at DESC);

-- Create error resolution workflow table
CREATE TABLE error_resolution_workflow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_log_id UUID NOT NULL REFERENCES api_logs(id),
  assigned_to UUID,
  priority INTEGER NOT NULL DEFAULT 3, -- 1=high, 2=medium, 3=low
  workflow_stage TEXT NOT NULL DEFAULT 'triage', -- 'triage', 'investigation', 'resolution', 'testing', 'closed'
  stage_notes TEXT,
  estimated_resolution_time INTERVAL,
  actual_resolution_time INTERVAL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Function to automatically categorize errors based on patterns
CREATE OR REPLACE FUNCTION categorize_error(error_message TEXT, endpoint TEXT, status TEXT)
RETURNS error_category AS $$
BEGIN
  -- API Authentication errors
  IF error_message ILIKE '%api key%' OR error_message ILIKE '%authentication%' OR error_message ILIKE '%unauthorized%' THEN
    RETURN 'api_authentication';
  END IF;
  
  -- Network errors
  IF error_message ILIKE '%timeout%' OR error_message ILIKE '%connection%' OR error_message ILIKE '%network%' THEN
    RETURN 'network_error';
  END IF;
  
  -- Data validation errors
  IF error_message ILIKE '%validation%' OR error_message ILIKE '%invalid%' OR error_message ILIKE '%missing%' THEN
    RETURN 'data_validation';
  END IF;
  
  -- Rate limiting
  IF error_message ILIKE '%rate limit%' OR error_message ILIKE '%too many requests%' THEN
    RETURN 'rate_limiting';
  END IF;
  
  -- Provider enrollment errors
  IF error_message ILIKE '%not enrolled%' OR error_message ILIKE '%provider%' THEN
    RETURN 'provider_enrollment';
  END IF;
  
  -- Payer specific errors
  IF error_message ILIKE '%payer%' OR error_message ILIKE '%unavailable%' OR error_message ILIKE '%service disrupted%' THEN
    RETURN 'payer_specific';
  END IF;
  
  -- Default to system error
  RETURN 'system_error';
END;
$$ LANGUAGE plpgsql;

-- Function to determine error severity
CREATE OR REPLACE FUNCTION determine_error_severity(error_category error_category, retry_count INTEGER)
RETURNS error_severity AS $$
BEGIN
  CASE error_category
    WHEN 'api_authentication' THEN
      RETURN 'critical';
    WHEN 'system_error' THEN
      IF retry_count > 3 THEN
        RETURN 'critical';
      ELSE
        RETURN 'high';
      END IF;
    WHEN 'network_error' THEN
      IF retry_count > 5 THEN
        RETURN 'high';
      ELSE
        RETURN 'medium';
      END IF;
    WHEN 'rate_limiting' THEN
      RETURN 'medium';
    WHEN 'data_validation' THEN
      RETURN 'low';
    WHEN 'provider_enrollment' THEN
      RETURN 'medium';
    WHEN 'payer_specific' THEN
      RETURN 'medium';
    ELSE
      RETURN 'medium';
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically categorize and set severity for new api_logs entries
CREATE OR REPLACE FUNCTION auto_categorize_api_log()
RETURNS TRIGGER AS $$
BEGIN
  -- Set error category if not already set
  IF NEW.error_category IS NULL AND NEW.error_message IS NOT NULL THEN
    NEW.error_category := categorize_error(NEW.error_message, NEW.endpoint, NEW.status);
  END IF;
  
  -- Set error severity if not already set
  IF NEW.error_severity IS NULL AND NEW.error_category IS NOT NULL THEN
    NEW.error_severity := determine_error_severity(NEW.error_category, COALESCE(NEW.retry_count, 0));
  END IF;
  
  -- Set response time from processing_time_ms if available
  IF NEW.response_time_ms IS NULL AND NEW.processing_time_ms IS NOT NULL THEN
    NEW.response_time_ms := NEW.processing_time_ms;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_categorize_api_log
  BEFORE INSERT OR UPDATE ON api_logs
  FOR EACH ROW
  EXECUTE FUNCTION auto_categorize_api_log();

-- Function to check error thresholds and create alerts
CREATE OR REPLACE FUNCTION check_error_thresholds()
RETURNS VOID AS $$
DECLARE
  monitor_record RECORD;
  error_count INTEGER;
  time_threshold TIMESTAMP WITH TIME ZONE;
BEGIN
  FOR monitor_record IN SELECT * FROM error_monitoring WHERE alert_enabled = true
  LOOP
    time_threshold := now() - (monitor_record.time_window_minutes || ' minutes')::INTERVAL;
    
    SELECT COUNT(*) INTO error_count
    FROM api_logs
    WHERE created_at >= time_threshold
      AND status = 'error'
      AND (error_message ILIKE '%' || monitor_record.error_pattern || '%'
           OR endpoint ILIKE '%' || monitor_record.error_pattern || '%');
    
    IF error_count >= monitor_record.threshold_count THEN
      -- Log critical alert (could be extended to send notifications)
      INSERT INTO api_logs (
        endpoint,
        status,
        error_message,
        error_category,
        error_severity,
        request_payload
      ) VALUES (
        'system/alert',
        'alert',
        'Error threshold exceeded for pattern: ' || monitor_record.error_pattern,
        'system_error',
        'critical',
        jsonb_build_object(
          'pattern', monitor_record.error_pattern,
          'count', error_count,
          'threshold', monitor_record.threshold_count,
          'time_window', monitor_record.time_window_minutes
        )
      );
      
      -- Update last triggered timestamp
      UPDATE error_monitoring 
      SET last_triggered_at = now()
      WHERE id = monitor_record.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Insert default error monitoring patterns
INSERT INTO error_monitoring (error_pattern, threshold_count, time_window_minutes) VALUES
('api key', 3, 5),
('timeout', 10, 15),
('not found', 20, 30),
('rate limit', 5, 10),
('system error', 5, 15);

-- Create updated_at trigger for tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_error_monitoring_updated_at
  BEFORE UPDATE ON error_monitoring
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_error_resolution_workflow_updated_at
  BEFORE UPDATE ON error_resolution_workflow
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();