
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<{type: 'error' | 'success', text: string} | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await signIn(email, password);
      
      if (error) {
        setError(error.message);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setResetMessage(null);
    setDebugInfo("");

    try {
      // Log detailed information about the reset attempt
      const redirectUrl = `${window.location.origin}/`;
      console.log('🔍 Password Reset Debug Info:');
      console.log('- Email:', resetEmail);
      console.log('- Redirect URL:', redirectUrl);
      console.log('- Current origin:', window.location.origin);
      console.log('- Current href:', window.location.href);
      console.log('- Timestamp:', new Date().toISOString());

      // Check if the email is valid format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(resetEmail)) {
        console.log('❌ Invalid email format');
        setResetMessage({ type: 'error', text: 'Please enter a valid email address' });
        setResetLoading(false);
        return;
      }

      console.log('📧 Attempting to send password reset email...');
      
      // Make the actual reset request with detailed logging
      const resetResponse = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: redirectUrl,
      });

      console.log('📋 Full Supabase Response:', resetResponse);
      console.log('- Data:', resetResponse.data);
      console.log('- Error:', resetResponse.error);
      
      // Create debug info for display
      const debugDetails = [
        `Email: ${resetEmail}`,
        `Redirect URL: ${redirectUrl}`,
        `Response data: ${JSON.stringify(resetResponse.data)}`,
        `Response error: ${resetResponse.error ? JSON.stringify(resetResponse.error) : 'null'}`,
        `Timestamp: ${new Date().toISOString()}`
      ].join('\n');
      
      setDebugInfo(debugDetails);

      if (resetResponse.error) {
        console.log('❌ Supabase returned an error:', resetResponse.error);
        setResetMessage({ 
          type: 'error', 
          text: `Error: ${resetResponse.error.message}` 
        });
      } else {
        console.log('✅ Reset request completed successfully');
        console.log('- Note: Success does not guarantee email was sent, just that request was processed');
        
        setResetMessage({ 
          type: 'success', 
          text: 'If an account exists for this email, a password reset link has been sent.' 
        });
        
        toast({
          title: 'Password Reset',
          description: 'If an account exists for this email, a password reset link has been sent to your inbox.',
        });
      }

    } catch (err: any) {
      console.log('💥 Caught exception during password reset:', err);
      console.log('- Error message:', err.message);
      console.log('- Error stack:', err.stack);
      
      setDebugInfo(`Exception caught: ${err.message}\nStack: ${err.stack}`);
      setResetMessage({ 
        type: 'error', 
        text: `Unexpected error: ${err.message}` 
      });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-valorwell-purple to-valorwell-purple-dark">
            ValorWell Admin
          </CardTitle>
          <CardDescription>
            Sign in to access the billing hub
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Dialog open={isResetDialogOpen} onOpenChange={(open) => {
                  setIsResetDialogOpen(open);
                  if (!open) {
                    setResetMessage(null);
                    setResetEmail('');
                    setDebugInfo("");
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button variant="link" type="button" className="p-0 h-auto text-sm font-normal">
                      Forgot password?
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                      <DialogTitle>Reset Password</DialogTitle>
                      <DialogDescription>
                        Enter your email address and we'll send you a link to reset your password.
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handlePasswordReset} className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="reset-email">Email</Label>
                            <Input
                                id="reset-email"
                                type="email"
                                value={resetEmail}
                                onChange={(e) => setResetEmail(e.target.value)}
                                placeholder="Enter your email"
                                required
                                disabled={resetLoading}
                            />
                        </div>
                        {resetMessage && (
                            <Alert variant={resetMessage.type === 'error' ? 'destructive' : 'default'} className={resetMessage.type === 'success' ? 'border-green-500 text-green-700 dark:border-green-500 dark:text-green-400' : ''}>
                                <AlertDescription>{resetMessage.text}</AlertDescription>
                            </Alert>
                        )}
                        {debugInfo && (
                            <Alert>
                                <AlertDescription>
                                    <strong>Debug Info:</strong>
                                    <pre className="text-xs mt-2 whitespace-pre-wrap overflow-auto max-h-32">
                                        {debugInfo}
                                    </pre>
                                </AlertDescription>
                            </Alert>
                        )}
                        <DialogFooter>
                            <Button type="submit" disabled={resetLoading} className="w-full">
                                {resetLoading ? 'Sending...' : 'Send Reset Link'}
                            </Button>
                        </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
