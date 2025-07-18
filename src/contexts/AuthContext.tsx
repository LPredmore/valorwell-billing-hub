
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AdminProfile {
  id: string;
  admin_email?: string;
  admin_first_name?: string;
  admin_last_name?: string;
  admin_status?: string;
  admin_phone?: string;
  // Clinician admin fields
  clinician_email?: string;
  clinician_first_name?: string;
  clinician_last_name?: string;
  clinician_phone?: string;
  is_admin?: boolean;
  profile_type: 'admin' | 'clinician_admin';
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
      console.log('🔍 Starting admin profile fetch for email:', userEmail);
      
      // First, try to find in admins table - with new RLS policies, this should work
      console.log('🔍 Checking admins table...');
      const { data: adminData, error: adminError } = await supabase
        .from('admins')
        .select('*')
        .eq('admin_email', userEmail)
        .maybeSingle();

      console.log('📋 Admin table query result:', { adminData, adminError });

      // If we found an admin record and no error, return it
      if (!adminError && adminData) {
        console.log('✅ Admin profile found in admins table:', adminData);
        return {
          ...adminData,
          profile_type: 'admin' as const
        };
      }

      // Log any errors but continue to check clinicians
      if (adminError) {
        console.log('⚠️ Admin table query error (continuing to clinicians):', adminError);
      }

      console.log('🔍 No admin found in admins table, checking clinicians...');
      
      // Check clinicians table for admin clinicians
      const { data: clinicianData, error: clinicianError } = await supabase
        .from('clinicians')
        .select('*')
        .eq('clinician_email', userEmail)
        .eq('is_admin', true)
        .maybeSingle();

      console.log('📋 Clinician table query result:', { clinicianData, clinicianError });

      if (!clinicianError && clinicianData) {
        console.log('✅ Clinician admin profile found:', clinicianData);
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

      // If there was a clinician error, log it
      if (clinicianError) {
        console.log('⚠️ Clinician table query error:', clinicianError);
      }

      console.log('❌ No admin or clinician admin profile found for this email');
      return null;
    } catch (error) {
      console.error('💥 Exception in fetchAdminProfile:', error);
      return null;
    }
  };

  useEffect(() => {
    console.log('🚀 Setting up auth state listener');
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔄 Auth state changed:', event, session?.user?.email);
        
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user?.email) {
          console.log('👤 User authenticated, fetching admin profile...');
          // Fetch admin profile for authenticated user
          const profile = await fetchAdminProfile(session.user.email);
          setAdminProfile(profile);
          
          if (profile) {
            console.log('✅ Admin profile loaded successfully:', profile.profile_type);
          } else {
            console.log('⚠️ No admin profile found for this email');
          }
        } else {
          console.log('🚪 No authenticated user, clearing admin profile');
          setAdminProfile(null);
        }
        
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('🔍 Checking for existing session:', session?.user?.email);
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user?.email) {
        fetchAdminProfile(session.user.email).then(profile => {
          setAdminProfile(profile);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    console.log('🔑 Attempting sign in for:', email);
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      console.error('❌ Sign in error:', error);
    } else {
      console.log('✅ Sign in successful');
    }
    
    return { error };
  };

  const signOut = async () => {
    console.log('🚪 Signing out user');
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
