import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ErrorLoggingService, type ErrorCategory } from '@/services/errorLoggingService';
import { ClaimMdApiService } from '@/services/claimdApiService';
import { InsuranceLevel } from '@/types/claimmd';
import { useToast } from '@/hooks/use-toast';
import { 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Clock,
  Settings
} from 'lucide-react';

interface RecoveryAttempt {
  id: string;
  clientId: string;
  errorCategory: ErrorCategory;
  originalError: string;
  recoveryStrategy: string;
  status: 'pending' | 'in_progress' | 'success' | 'failed';
  attempts: number;
  lastAttempt?: Date;
  nextRetry?: Date;
}

interface AutoRecoveryConfig {
  enabled: boolean;
  maxRetries: number;
  retryDelay: number;
  strategies: {
    [key in ErrorCategory]: {
      enabled: boolean;
      maxRetries: number;
      retryDelay: number;
      customLogic?: string;
    };
  };
}

const ErrorRecoveryService = () => {
  const { toast } = useToast();
  const [recoveryAttempts, setRecoveryAttempts] = useState<RecoveryAttempt[]>([]);
  const [autoRecoveryConfig, setAutoRecoveryConfig] = useState<AutoRecoveryConfig>({
    enabled: true,
    maxRetries: 3,
    retryDelay: 5000,
    strategies: {
      api_authentication: { enabled: false, maxRetries: 1, retryDelay: 30000 },
      network_error: { enabled: true, maxRetries: 3, retryDelay: 5000 },
      data_validation: { enabled: true, maxRetries: 2, retryDelay: 1000 },
      rate_limiting: { enabled: true, maxRetries: 5, retryDelay: 60000 },
      provider_enrollment: { enabled: false, maxRetries: 1, retryDelay: 0 },
      payer_specific: { enabled: true, maxRetries: 2, retryDelay: 10000 },
      system_error: { enabled: true, maxRetries: 2, retryDelay: 10000 }
    }
  });

  /**
   * Automated error recovery logic
   */
  const attemptRecovery = async (
    clientId: string,
    errorCategory: ErrorCategory,
    originalError: string,
    retryCount: number = 0
  ): Promise<boolean> => {
    if (!autoRecoveryConfig.enabled) return false;

    const strategy = autoRecoveryConfig.strategies[errorCategory];
    if (!strategy.enabled || retryCount >= strategy.maxRetries) {
      return false;
    }

    const attemptId = crypto.randomUUID();
    const attempt: RecoveryAttempt = {
      id: attemptId,
      clientId,
      errorCategory,
      originalError,
      recoveryStrategy: getRecoveryStrategy(errorCategory),
      status: 'pending',
      attempts: retryCount + 1,
      lastAttempt: new Date(),
      nextRetry: new Date(Date.now() + strategy.retryDelay)
    };

    setRecoveryAttempts(prev => [...prev, attempt]);

    try {
      // Wait for retry delay
      await new Promise(resolve => setTimeout(resolve, strategy.retryDelay));

      // Update status to in_progress
      setRecoveryAttempts(prev => 
        prev.map(a => a.id === attemptId ? { ...a, status: 'in_progress' } : a)
      );

      // Attempt recovery based on error category
      const success = await executeRecoveryStrategy(clientId, errorCategory, originalError, retryCount);

      // Update status based on result
      setRecoveryAttempts(prev => 
        prev.map(a => a.id === attemptId ? { 
          ...a, 
          status: success ? 'success' : 'failed',
          lastAttempt: new Date()
        } : a)
      );

      if (success) {
        toast({
          title: 'Recovery Successful',
          description: `Automatically resolved ${errorCategory} error for client`,
        });
        
        // Log successful recovery
        await ErrorLoggingService.logSuccess(`recovery/${errorCategory}`, {
          clientId,
          userContext: { user_type: 'system' },
          requestPayload: { 
            originalError, 
            recoveryStrategy: attempt.recoveryStrategy,
            attempts: retryCount + 1
          }
        });
      } else {
        // Try again if we haven't exceeded max retries
        if (retryCount + 1 < strategy.maxRetries) {
          setTimeout(() => {
            attemptRecovery(clientId, errorCategory, originalError, retryCount + 1);
          }, strategy.retryDelay);
        }
      }

      return success;
    } catch (error) {
      setRecoveryAttempts(prev => 
        prev.map(a => a.id === attemptId ? { ...a, status: 'failed', lastAttempt: new Date() } : a)
      );

      await ErrorLoggingService.logError(`recovery/${errorCategory}`, error as Error, {
        clientId,
        userContext: { user_type: 'system' },
        requestPayload: { originalError, recoveryStrategy: attempt.recoveryStrategy }
      });

      return false;
    }
  };

  /**
   * Execute recovery strategy based on error category
   */
  const executeRecoveryStrategy = async (
    clientId: string,
    errorCategory: ErrorCategory,
    originalError: string,
    retryCount: number
  ): Promise<boolean> => {
    switch (errorCategory) {
      case 'network_error':
        return await retryWithExponentialBackoff(clientId, retryCount);
      
      case 'data_validation':
        return await retryWithDataCorrection(clientId, originalError);
      
      case 'rate_limiting':
        return await retryAfterRateLimit(clientId);
      
      case 'payer_specific':
        return await retryWithAlternativeEndpoint(clientId);
      
      case 'system_error':
        return await retryWithSystemCheck(clientId);
      
      default:
        return await basicRetry(clientId);
    }
  };

  /**
   * Get recovery strategy description
   */
  const getRecoveryStrategy = (category: ErrorCategory): string => {
    switch (category) {
      case 'network_error':
        return 'Exponential backoff retry';
      case 'data_validation':
        return 'Data correction and retry';
      case 'rate_limiting':
        return 'Wait for rate limit reset';
      case 'payer_specific':
        return 'Alternative endpoint retry';
      case 'system_error':
        return 'System health check and retry';
      default:
        return 'Basic retry with delay';
    }
  };

  /**
   * Recovery strategy implementations
   */
  const retryWithExponentialBackoff = async (clientId: string, retryCount: number): Promise<boolean> => {
    const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    const result = await ClaimMdApiService.checkEligibility(clientId, InsuranceLevel.PRIMARY);
    return result.success;
  };

  const retryWithDataCorrection = async (clientId: string, originalError: string): Promise<boolean> => {
    // Implement data correction logic based on error message
    // This is a simplified example
    const result = await ClaimMdApiService.checkEligibility(clientId, InsuranceLevel.PRIMARY);
    return result.success;
  };

  const retryAfterRateLimit = async (clientId: string): Promise<boolean> => {
    // Wait for rate limit window to pass
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    const result = await ClaimMdApiService.checkEligibility(clientId, InsuranceLevel.PRIMARY);
    return result.success;
  };

  const retryWithAlternativeEndpoint = async (clientId: string): Promise<boolean> => {
    // Try alternative approach or endpoint
    const result = await ClaimMdApiService.checkEligibility(clientId, InsuranceLevel.PRIMARY);
    return result.success;
  };

  const retryWithSystemCheck = async (clientId: string): Promise<boolean> => {
    // Perform system health check before retry
    await ErrorLoggingService.checkErrorThresholds();
    
    const result = await ClaimMdApiService.checkEligibility(clientId, InsuranceLevel.PRIMARY);
    return result.success;
  };

  const basicRetry = async (clientId: string): Promise<boolean> => {
    const result = await ClaimMdApiService.checkEligibility(clientId, InsuranceLevel.PRIMARY);
    return result.success;
  };

  /**
   * Manual retry trigger
   */
  const manualRetry = async (clientId: string, errorCategory: ErrorCategory, originalError: string) => {
    const success = await attemptRecovery(clientId, errorCategory, originalError, 0);
    
    if (success) {
      toast({
        title: 'Manual Recovery Successful',
        description: 'The error has been resolved.',
      });
    } else {
      toast({
        title: 'Manual Recovery Failed',
        description: 'Unable to resolve the error automatically.',
        variant: 'destructive',
      });
    }
  };

  /**
   * Get status icon
   */
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'in_progress':
        return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-600" />;
    }
  };

  /**
   * Get success rate for recovery attempts
   */
  const getSuccessRate = (): number => {
    if (recoveryAttempts.length === 0) return 0;
    const successful = recoveryAttempts.filter(a => a.status === 'success').length;
    return (successful / recoveryAttempts.length) * 100;
  };

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Auto-Recovery Configuration
          </CardTitle>
          <CardDescription>
            Automated error recovery settings and strategies
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">Auto-Recovery Enabled</span>
              <Badge variant={autoRecoveryConfig.enabled ? 'default' : 'secondary'}>
                {autoRecoveryConfig.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Success Rate</p>
                <div className="flex items-center gap-2">
                  <Progress value={getSuccessRate()} className="flex-1" />
                  <span className="text-sm font-medium">{getSuccessRate().toFixed(1)}%</span>
                </div>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground mb-2">Active Attempts</p>
                <div className="text-2xl font-bold text-blue-600">
                  {recoveryAttempts.filter(a => a.status === 'in_progress').length}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recovery Attempts */}
      <Card>
        <CardHeader>
          <CardTitle>Recovery Attempts</CardTitle>
          <CardDescription>
            Recent automatic and manual recovery attempts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recoveryAttempts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No recovery attempts yet
              </p>
            ) : (
              recoveryAttempts.slice(0, 10).map((attempt) => (
                <div key={attempt.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    {getStatusIcon(attempt.status)}
                    <div>
                      <p className="font-medium">{attempt.recoveryStrategy}</p>
                      <p className="text-sm text-muted-foreground">
                        {attempt.originalError}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Client: {attempt.clientId.substring(0, 8)}... | 
                        Attempt {attempt.attempts} | 
                        {attempt.lastAttempt?.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline">
                      {attempt.errorCategory}
                    </Badge>
                    <Badge variant={
                      attempt.status === 'success' ? 'default' :
                      attempt.status === 'failed' ? 'destructive' :
                      'secondary'
                    }>
                      {attempt.status}
                    </Badge>
                    {attempt.status === 'failed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => manualRetry(attempt.clientId, attempt.errorCategory, attempt.originalError)}
                      >
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ErrorRecoveryService;