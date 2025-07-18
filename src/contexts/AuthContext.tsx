
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
    try {
      const { data: clinicianData, error: clinicianError } = await supabase
        .from('clinicians')
        .select('*')
        .eq('clinician_email', userEmail)
        .eq('is_admin', true)
        .maybeSingle();

      if (clinicianError) {
        console.error('Error fetching admin profile:', clinicianError);
        return null;
      }

      if (clinicianData) {
        return {
          id: clinicianData.id,
          clinician_email: clinicianData.clinician_email,
          clinician_first_name: clinicianData.clinician_first_name,
          clinician_last_name: clinicianData.clinician_last_name,
          clinician_phone: clinicianData.clinician_phone,
          is_admin: clinicianData.is_admin,
          profile_type: 'clinician_admin' as const
        };
      }

      return null;
    } catch (error) {
      console.error('Exception in fetchAdminProfile:', error);
      return null;
    }
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user?.email) {
          try {
            setLoading(true);
            const profile = await fetchAdminProfile(session.user.email);
            setAdminProfile(profile);
          } catch (error) {
            console.error('Error fetching admin profile:', error);
            setAdminProfile(null);
          } finally {
            setLoading(false);
          }
        } else {
          setAdminProfile(null);
          setLoading(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Session check error:', error);
      }
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user?.email) {
        fetchAdminProfile(session.user.email).then(profile => {
          setAdminProfile(profile);
          setLoading(false);
        }).catch(error => {
          console.error('Error in initial profile fetch:', error);
          setAdminProfile(null);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }).catch(error => {
      console.error('Error getting initial session:', error);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      console.error('Sign in error:', error.message);
    }
    
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setAdminProfile(null);
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
