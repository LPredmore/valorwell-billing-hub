
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { user, adminProfile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('🛡️ AuthGuard check:', {
      loading,
      hasUser: !!user,
      userEmail: user?.email,
      hasAdminProfile: !!adminProfile,
      profileType: adminProfile?.profile_type,
      adminEmail: adminProfile?.admin_email || adminProfile?.clinician_email
    });

    if (!loading) {
      if (!user) {
        console.log('❌ No user found, redirecting to auth');
        navigate('/auth');
      } else if (!adminProfile) {
        console.log('⚠️ User found but no admin profile, waiting a bit more...');
        // Give it a moment for the admin profile to load with new RLS policies
        const timeout = setTimeout(() => {
          if (!adminProfile) {
            console.log('❌ Still no admin profile after timeout, redirecting to auth');
            navigate('/auth');
          }
        }, 2000); // Reduced timeout since new policies should be faster

        return () => clearTimeout(timeout);
      } else {
        console.log('✅ User and admin profile both present, access granted');
        console.log('📋 Admin profile details:', {
          type: adminProfile.profile_type,
          email: adminProfile.admin_email || adminProfile.clinician_email,
          firstName: adminProfile.admin_first_name || adminProfile.clinician_first_name,
          lastName: adminProfile.admin_last_name || adminProfile.clinician_last_name
        });
      }
    }
  }, [user, adminProfile, loading, navigate]);

  if (loading) {
    console.log('⏳ AuthGuard showing loading state');
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
          <div className="text-sm text-muted-foreground mt-2">
            Loading your profile...
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    console.log('🚫 No user, showing nothing (redirect in progress)');
    return null;
  }

  if (!adminProfile) {
    console.log('⏳ User found but waiting for admin profile');
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
          <div className="text-sm text-muted-foreground mt-2">
            Verifying admin access for {user.email}...
          </div>
          <div className="text-xs text-muted-foreground">
            Checking admin credentials with updated policies...
          </div>
        </div>
      </div>
    );
  }

  console.log('✅ AuthGuard allowing access');
  return <>{children}</>;
}
