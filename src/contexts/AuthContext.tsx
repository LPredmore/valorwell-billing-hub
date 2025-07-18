
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AdminProfile {
  id: string;
  clinician_email?: string;
  clinician_first_name?: string;
  clinician_last_name?: string;
  clinician_phone?: string;
  is_admin?: boolean;
  profile_type: 'clinician_admin';
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  adminProfile: AdminProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAdminProfile = async (userEmail: string): Promise<AdminProfile | null> => {
    // IMMEDIATE FORCED LOGGING - SHOULD SHOW UP
    console.error("🔥🔥🔥 FETCHADMINPROFILE START - NEW VERSION:", userEmail);
    console.error("🔥🔥🔥 TIMESTAMP:", new Date().toISOString());
    
    const startTime = performance.now();
    const correlationId = `profile-fetch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.error(`🔥 [${correlationId}] Starting admin profile fetch for email:`, userEmail);
    console.error(`🔥 [${correlationId}] Fetch start time:`, new Date().toISOString());
    console.error(`🔥 [${correlationId}] Supabase client status:`, {
      clientReady: !!supabase,
      authReady: !!supabase.auth
    });

    try {
      // Test basic connectivity first
      console.error(`🔥 [${correlationId}] Testing basic Supabase connectivity...`);
      const connectivityStart = performance.now();
      
      try {
        console.error(`🔥 [${correlationId}] About to execute health check query...`);
        const healthCheck = await Promise.race([
          supabase.from('clinicians').select('count', { count: 'exact', head: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connectivity timeout')), 5000))
        ]);
        console.error(`🔥 [${correlationId}] Connectivity test passed (${(performance.now() - connectivityStart).toFixed(2)}ms):`, healthCheck);
      } catch (connectivityError) {
        console.error(`🔥 [${correlationId}] Connectivity test failed:`, connectivityError);
        console.error(`🔥 [${correlationId}] Returning null due to connectivity failure`);
        return null;
      }

      // Check current auth state
      console.error(`🔥 [${correlationId}] Checking current auth state...`);
      const authStateStart = performance.now();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      console.error(`🔥 [${correlationId}] Auth state check (${(performance.now() - authStateStart).toFixed(2)}ms):`, {
        hasSession: !!sessionData.session,
        hasUser: !!sessionData.session?.user,
        userEmail: sessionData.session?.user?.email,
        sessionError,
        accessToken: sessionData.session?.access_token ? 'present' : 'missing',
        tokenType: sessionData.session?.token_type
      });

      if (sessionError) {
        console.error(`🔥 [${correlationId}] Session error:`, sessionError);
      }

      // Test database permissions
      console.log(`🔑 [${correlationId}] Testing database permissions...`);
      const permissionsStart = performance.now();
      
      try {
        const permissionTest = await Promise.race([
          supabase.from('clinicians').select('id', { count: 'exact' }).limit(1),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Permission test timeout')), 5000))
        ]);
        console.log(`✅ [${correlationId}] Permission test passed (${(performance.now() - permissionsStart).toFixed(2)}ms):`, permissionTest);
      } catch (permissionError) {
        console.error(`❌ [${correlationId}] Permission test failed:`, permissionError);
        console.log(`🔍 [${correlationId}] Permission error details:`, {
          name: permissionError.name,
          message: permissionError.message,
          stack: permissionError.stack
        });
      }

      console.error(`🔥 [${correlationId}] Starting clinicians table query...`);
      console.error(`🔥 [${correlationId}] Query details:`, {
        table: 'clinicians',
        select: '*',
        filter1: { column: 'clinician_email', operator: 'eq', value: userEmail },
        filter2: { column: 'is_admin', operator: 'eq', value: true },
        method: 'maybeSingle'
      });

      const queryStart = performance.now();
      
      // Execute the query with timeout
      console.error(`🔥 [${correlationId}] Creating query promise...`);
      const queryPromise = supabase
        .from('clinicians')
        .select('*')
        .eq('clinician_email', userEmail)
        .eq('is_admin', true)
        .maybeSingle();

      console.error(`🔥 [${correlationId}] Query promise created, executing with 3 second timeout...`);

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => {
          console.error(`🔥 [${correlationId}] QUERY TIMEOUT - 3 seconds elapsed`);
          reject(new Error('Query timeout after 3 seconds'));
        }, 3000)
      );

      try {
        console.error(`🔥 [${correlationId}] Executing Promise.race...`);
        const { data: clinicianData, error: clinicianError } = await Promise.race([
          queryPromise,
          timeoutPromise
        ]) as any;

        const queryDuration = performance.now() - queryStart;
        console.error(`🔥 [${correlationId}] Query completed (${queryDuration.toFixed(2)}ms)`);
      
        console.error(`🔥 [${correlationId}] Raw query response:`, {
          data: clinicianData,
          error: clinicianError,
          dataType: typeof clinicianData,
          errorType: typeof clinicianError,
          dataKeys: clinicianData ? Object.keys(clinicianData) : null,
          errorDetails: clinicianError ? {
            message: clinicianError.message,
            details: clinicianError.details,
            hint: clinicianError.hint,
            code: clinicianError.code
          } : null
        });

        if (clinicianError) {
          console.error(`🔥 [${correlationId}] Clinician query error:`, clinicianError);
          console.error(`🔥 [${correlationId}] RETURNING NULL DUE TO QUERY ERROR`);
          return null;
        }

        if (clinicianData) {
          console.error(`🔥 [${correlationId}] Profile found, formatting...`);
          const profile: AdminProfile = {
            id: clinicianData.id,
            clinician_email: clinicianData.clinician_email,
            clinician_first_name: clinicianData.clinician_first_name,
            clinician_last_name: clinicianData.clinician_last_name,
            clinician_phone: clinicianData.clinician_phone,
            is_admin: clinicianData.is_admin,
            profile_type: 'clinician_admin' as const
          };
          
          console.error(`🔥 [${correlationId}] Formatted admin profile:`, profile);
          console.error(`🔥 [${correlationId}] RETURNING PROFILE - SUCCESS`);
          return profile;
        }

        console.error(`🔥 [${correlationId}] NO DATA FOUND - RETURNING NULL`);
        return null;

      } catch (queryError) {
        console.error(`🔥 [${correlationId}] Query execution failed:`, queryError);
        console.error(`🔥 [${correlationId}] RETURNING NULL DUE TO QUERY EXCEPTION`);
        return null;
      }
      
    } catch (error) {
      const totalDuration = performance.now() - startTime;
      console.error(`🔥 [${correlationId}] EXCEPTION in fetchAdminProfile after ${totalDuration.toFixed(2)}ms:`, error);
      console.error(`🔥 [${correlationId}] RETURNING NULL DUE TO EXCEPTION`);
      return null;
    }
  };

  useEffect(() => {
    const effectId = `auth-effect-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    console.log(`🚀 [${effectId}] Setting up auth state listener`);
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const changeId = `auth-change-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        console.log(`🔄 [${changeId}] Auth state changed:`, {
          event,
          userEmail: session?.user?.email,
          hasSession: !!session,
          hasUser: !!session?.user,
          hasAccessToken: !!session?.access_token,
          timestamp: new Date().toISOString()
        });
        
        console.log(`📋 [${changeId}] Full session details:`, {
          user: session?.user ? {
            id: session.user.id,
            email: session.user.email,
            role: session.user.role,
            createdAt: session.user.created_at
          } : null,
          accessToken: session?.access_token ? 'present' : 'missing',
          refreshToken: session?.refresh_token ? 'present' : 'missing',
          expiresAt: session?.expires_at,
          tokenType: session?.token_type
        });
        
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user?.email) {
          console.log(`👤 [${changeId}] User authenticated, fetching admin profile...`);
          try {
            setLoading(true); // Ensure loading state is set
            console.log(`⏳ [${changeId}] Setting loading to true before profile fetch`);
            
            // Fetch admin profile for authenticated user
            const profileFetchStart = performance.now();
            const profile = await fetchAdminProfile(session.user.email);
            const profileFetchDuration = performance.now() - profileFetchStart;
            
            console.log(`📋 [${changeId}] Profile fetch completed in ${profileFetchDuration.toFixed(2)}ms:`, {
              profileFound: !!profile,
              profileType: profile?.profile_type,
              profileEmail: profile?.clinician_email,
              profileId: profile?.id
            });
            
            setAdminProfile(profile);
            
            if (profile) {
              console.log(`✅ [${changeId}] Admin profile loaded successfully:`, profile.profile_type);
            } else {
              console.log(`⚠️ [${changeId}] No admin profile found for this email`);
            }
          } catch (error) {
            console.error(`💥 [${changeId}] Error fetching admin profile:`, error);
            setAdminProfile(null);
          } finally {
            console.log(`⏳ [${changeId}] Setting loading to false after profile fetch`);
            setLoading(false);
          }
        } else {
          console.log(`🚪 [${changeId}] No authenticated user, clearing admin profile`);
          setAdminProfile(null);
          setLoading(false);
        }
      }
    );

    console.log(`📡 [${effectId}] Auth listener subscription created:`, subscription);

    // Check for existing session
    console.log(`🔍 [${effectId}] Checking for existing session...`);
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      const sessionCheckId = `session-check-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      console.log(`🔍 [${sessionCheckId}] Initial session check result:`, {
        hasSession: !!session,
        hasUser: !!session?.user,
        userEmail: session?.user?.email,
        error,
        timestamp: new Date().toISOString()
      });
      
      if (error) {
        console.error(`❌ [${sessionCheckId}] Session check error:`, error);
      }
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user?.email) {
        console.log(`👤 [${sessionCheckId}] Existing session found, fetching profile...`);
        fetchAdminProfile(session.user.email).then(profile => {
          console.log(`📋 [${sessionCheckId}] Initial profile fetch result:`, profile);
          setAdminProfile(profile);
          setLoading(false);
        }).catch(error => {
          console.error(`💥 [${sessionCheckId}] Error in initial profile fetch:`, error);
          setAdminProfile(null);
          setLoading(false);
        });
      } else {
        console.log(`🚪 [${sessionCheckId}] No existing session found`);
        setLoading(false);
      }
    }).catch(error => {
      console.error(`💥 [${effectId}] Error getting initial session:`, error);
      setLoading(false);
    });

    return () => {
      console.log(`🧹 [${effectId}] Cleaning up auth listener subscription`);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const signInId = `signin-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    console.log(`🔑 [${signInId}] Attempting sign in for:`, email);
    console.log(`🔑 [${signInId}] Sign in start time:`, new Date().toISOString());
    
    const signInStart = performance.now();
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    const signInDuration = performance.now() - signInStart;
    
    if (error) {
      console.error(`❌ [${signInId}] Sign in error (${signInDuration.toFixed(2)}ms):`, {
        message: error.message,
        status: error.status,
        details: error
      });
    } else {
      console.log(`✅ [${signInId}] Sign in successful (${signInDuration.toFixed(2)}ms)`);
    }
    
    return { error };
  };

  const signOut = async () => {
    const signOutId = `signout-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    console.log(`🚪 [${signOutId}] Signing out user`);
    await supabase.auth.signOut();
    setAdminProfile(null);
    console.log(`✅ [${signOutId}] Sign out completed`);
  };

  const value = {
    user,
    session,
    adminProfile,
    loading,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
