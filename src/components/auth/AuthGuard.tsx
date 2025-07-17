
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
      hasAdminProfile: !!adminProfile,
      profileType: adminProfile?.profile_type,
      userEmail: user?.email
    });

    if (!loading) {
      if (!user) {
        console.log('❌ No user found, redirecting to auth');
        navigate('/auth');
      } else if (!adminProfile) {
        console.log('⚠️ User found but no admin profile');
        // Give it a moment for the admin profile to load
        const timeout = setTimeout(() => {
          if (!adminProfile) {
            console.log('❌ Still no admin profile after timeout, redirecting to auth');
            navigate('/auth');
          }
        }, 2000); // Wait 2 seconds for admin profile to load

        return () => clearTimeout(timeout);
      } else {
        console.log('✅ User and admin profile both present, access granted');
        console.log('📋 Admin profile type:', adminProfile.profile_type);
      }
    }
  }, [user, adminProfile, loading, navigate]);

  if (loading) {
    console.log('⏳ AuthGuard showing loading state');
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
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
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
          <div className="text-sm text-muted-foreground mt-2">
            Loading admin profile for {user.email}...
          </div>
        </div>
      </div>
    );
  }

  console.log('✅ AuthGuard allowing access');
  return <>{children}</>;
}
