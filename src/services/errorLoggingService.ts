import { supabase } from '@/integrations/supabase/client';

export type ErrorCategory = 
  | 'api_authentication'
  | 'network_error'
  | 'data_validation'
  | 'rate_limiting'
  | 'provider_enrollment'
  | 'payer_specific'
  | 'system_error';

export type ErrorSeverity = 
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'informational';

export type ResolutionStatus = 
  | 'new'
  | 'in_progress'
  | 'resolved'
  | 'escalated'
  | 'closed';

export interface ErrorLogEntry {
  endpoint: string;
  status: string;
  error_message?: string;
  error_category?: ErrorCategory;
  error_severity?: ErrorSeverity;
  resolution_status?: ResolutionStatus;
  correlation_id?: string;
  retry_count?: number;
  user_context?: Record<string, any>;
  client_context?: Record<string, any>;
  request_payload?: Record<string, any>;
  response_data?: Record<string, any>;
  response_time_ms?: number;
  client_id?: string;
}

export interface UserContext {
  user_id?: string;
  user_type?: 'admin' | 'clinician' | 'client' | 'system';
  session_id?: string;
  ip_address?: string;
  user_agent?: string;
}

export interface ClientContext {
  client_id?: string;
  age_range?: string;
  state?: string;
  insurance_type?: string;
  payer_id?: string;
  verification_history_count?: number;
}

/**
 * Structured error logging service for insurance verification system
 */
export class ErrorLoggingService {
  private static correlationId: string | null = null;

  /**
   * Generate a new correlation ID for tracking related requests
   */
  static generateCorrelationId(): string {
    this.correlationId = crypto.randomUUID();
    return this.correlationId;
  }

  /**
   * Get current correlation ID
   */
  static getCorrelationId(): string | null {
    return this.correlationId;
  }

  /**
   * Log an error with structured data
   */
  static async logError(
    endpoint: string,
    error: Error | string,
    context: {
      userContext?: UserContext;
      clientContext?: ClientContext;
      requestPayload?: Record<string, any>;
      responseData?: Record<string, any>;
      responseTime?: number;
      retryCount?: number;
      clientId?: string;
    } = {}
  ): Promise<void> {
    try {
      const errorMessage = error instanceof Error ? error.message : error;
      
      // Sanitize client context to remove any PHI
      const sanitizedClientContext = this.sanitizeClientContext(context.clientContext);
      
      const logEntry: ErrorLogEntry = {
        endpoint,
        status: 'error',
        error_message: errorMessage,
        correlation_id: this.correlationId || crypto.randomUUID(),
        retry_count: context.retryCount || 0,
        user_context: context.userContext,
        client_context: sanitizedClientContext,
        request_payload: context.requestPayload,
        response_data: context.responseData,
        response_time_ms: context.responseTime,
        client_id: context.clientId,
      };

      const { error: logError } = await supabase
        .from('api_logs')
        .insert(logEntry);

      if (logError) {
        console.error('Failed to log error:', logError);
      }

      // Record system health metrics
      await this.recordHealthMetric('error_rate', 1, 'count');
      
      if (context.responseTime) {
        await this.recordHealthMetric('response_time', context.responseTime, 'milliseconds');
      }

    } catch (loggingError) {
      console.error('Error logging service failed:', loggingError);
    }
  }

  /**
   * Log a successful operation
   */
  static async logSuccess(
    endpoint: string,
    context: {
      userContext?: UserContext;
      clientContext?: ClientContext;
      requestPayload?: Record<string, any>;
      responseData?: Record<string, any>;
      responseTime?: number;
      clientId?: string;
    } = {}
  ): Promise<void> {
    try {
      const sanitizedClientContext = this.sanitizeClientContext(context.clientContext);
      
      const logEntry: ErrorLogEntry = {
        endpoint,
        status: 'success',
        correlation_id: this.correlationId || crypto.randomUUID(),
        user_context: context.userContext,
        client_context: sanitizedClientContext,
        request_payload: context.requestPayload,
        response_data: context.responseData,
        response_time_ms: context.responseTime,
        client_id: context.clientId,
      };

      const { error: logError } = await supabase
        .from('api_logs')
        .insert(logEntry);

      if (logError) {
        console.error('Failed to log success:', logError);
      }

      // Record system health metrics
      await this.recordHealthMetric('success_rate', 1, 'count');
      
      if (context.responseTime) {
        await this.recordHealthMetric('response_time', context.responseTime, 'milliseconds');
      }

    } catch (loggingError) {
      console.error('Error logging service failed:', loggingError);
    }
  }

  /**
   * Record system health metrics
   */
  private static async recordHealthMetric(
    metricName: string,
    value: number,
    type: string,
    context?: Record<string, any>
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('system_health_metrics')
        .insert({
          metric_name: metricName,
          metric_value: value,
          metric_type: type,
          context: context || {}
        });

      if (error) {
        console.error('Failed to record health metric:', error);
      }
    } catch (error) {
      console.error('Health metric recording failed:', error);
    }
  }

  /**
   * Sanitize client context to remove PHI
   */
  private static sanitizeClientContext(context?: ClientContext): ClientContext | undefined {
    if (!context) return undefined;

    // Remove any potential PHI - only keep anonymized demographic info
    return {
      age_range: context.age_range,
      state: context.state,
      insurance_type: context.insurance_type,
      payer_id: context.payer_id,
      verification_history_count: context.verification_history_count,
    };
  }

  /**
   * Get error statistics for monitoring
   */
  static async getErrorStatistics(timeWindow: number = 24): Promise<{
    totalErrors: number;
    errorsByCategory: Record<string, number>;
    errorsBySeverity: Record<string, number>;
    averageResponseTime: number;
    errorRate: number;
  }> {
    try {
      const timeThreshold = new Date(Date.now() - timeWindow * 60 * 60 * 1000).toISOString();
      
      const { data: errorStats, error } = await supabase
        .from('api_logs')
        .select('error_category, error_severity, status, response_time_ms')
        .gte('created_at', timeThreshold);

      if (error) {
        console.error('Failed to fetch error statistics:', error);
        return {
          totalErrors: 0,
          errorsByCategory: {},
          errorsBySeverity: {},
          averageResponseTime: 0,
          errorRate: 0
        };
      }

      const totalRequests = errorStats.length;
      const errors = errorStats.filter(log => log.status === 'error');
      const totalErrors = errors.length;

      const errorsByCategory = errors.reduce((acc, log) => {
        if (log.error_category) {
          acc[log.error_category] = (acc[log.error_category] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);

      const errorsBySeverity = errors.reduce((acc, log) => {
        if (log.error_severity) {
          acc[log.error_severity] = (acc[log.error_severity] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);

      const responseTimes = errorStats
        .filter(log => log.response_time_ms)
        .map(log => log.response_time_ms);
      
      const averageResponseTime = responseTimes.length > 0 
        ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
        : 0;

      const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

      return {
        totalErrors,
        errorsByCategory,
        errorsBySeverity,
        averageResponseTime,
        errorRate
      };

    } catch (error) {
      console.error('Error fetching statistics:', error);
      return {
        totalErrors: 0,
        errorsByCategory: {},
        errorsBySeverity: {},
        averageResponseTime: 0,
        errorRate: 0
      };
    }
  }

  /**
   * Check if error thresholds are exceeded
   */
  static async checkErrorThresholds(): Promise<void> {
    try {
      const { error } = await supabase.rpc('check_error_thresholds');
      
      if (error) {
        console.error('Failed to check error thresholds:', error);
      }
    } catch (error) {
      console.error('Error threshold check failed:', error);
    }
  }

  /**
   * Create user-friendly error messages
   */
  static getUserFriendlyMessage(
    errorCategory: ErrorCategory,
    errorMessage: string,
    claimMdErrorCode?: string
  ): {
    title: string;
    message: string;
    actions: string[];
  } {
    // Handle ClaimMD specific error codes first
    if (claimMdErrorCode) {
      switch (claimMdErrorCode) {
        case '75':
          return {
            title: 'Member Not Found',
            message: 'The insurance member could not be found in the payer database. Please verify the member ID and try again.',
            actions: [
              'Verify the policy number is correct',
              'Check if the member name matches the policy',
              'Confirm the insurance company is correct',
              'Contact the insurance provider if information is verified'
            ]
          };
        case '72':
          return {
            title: 'Invalid Member ID',
            message: 'The member ID format is invalid or missing required information.',
            actions: [
              'Check the policy number format',
              'Ensure all required fields are completed',
              'Verify the member ID structure with the payer'
            ]
          };
        case '20':
          return {
            title: 'Authentication Error',
            message: 'API authentication failed. This is a system configuration issue.',
            actions: [
              'Contact system administrator',
              'Check API key configuration',
              'Verify provider credentials are up to date'
            ]
          };
      }
    }

    // Handle by error category
    switch (errorCategory) {
      case 'api_authentication':
        return {
          title: 'Authentication Problem',
          message: 'There was an issue with API authentication. Please contact support.',
          actions: [
            'Contact system administrator',
            'Check if system maintenance is scheduled',
            'Try again in a few minutes'
          ]
        };
      
      case 'network_error':
        return {
          title: 'Connection Issue',
          message: 'Unable to connect to the insurance verification service. Please try again.',
          actions: [
            'Check your internet connection',
            'Try again in a few minutes',
            'Contact support if the problem persists'
          ]
        };
      
      case 'data_validation':
        return {
          title: 'Information Required',
          message: 'Some required information is missing or invalid. Please review and complete all fields.',
          actions: [
            'Check all required fields are completed',
            'Verify insurance information is accurate',
            'Ensure dates are in correct format'
          ]
        };
      
      case 'rate_limiting':
        return {
          title: 'Too Many Requests',
          message: 'The verification service is temporarily unavailable due to high volume. Please wait and try again.',
          actions: [
            'Wait a few minutes before trying again',
            'Avoid rapid multiple requests',
            'Contact support if urgent'
          ]
        };
      
      case 'provider_enrollment':
        return {
          title: 'Provider Enrollment Issue',
          message: 'There may be an issue with provider enrollment status with this payer.',
          actions: [
            'Verify provider is enrolled with this payer',
            'Check provider NPI number',
            'Contact payer credentialing department'
          ]
        };
      
      case 'payer_specific':
        return {
          title: 'Payer Service Issue',
          message: 'The insurance payer service is currently unavailable or experiencing issues.',
          actions: [
            'Try again later',
            'Check if payer is experiencing service issues',
            'Contact payer directly if needed'
          ]
        };
      
      default:
        return {
          title: 'Verification Error',
          message: 'An unexpected error occurred during verification. Please try again or contact support.',
          actions: [
            'Try the verification again',
            'Check all information is correct',
            'Contact support with error details'
          ]
        };
    }
  }
}
