
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AdminProfile {
  id: string;
  admin_email: string;
  admin_first_name?: string;
  admin_last_name?: string;
  admin_status?: string;
  admin_phone?: string;
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

  const fetchAdminProfile = async (userEmail: string) => {
    try {
      console.log('🔍 Fetching admin profile for email:', userEmail);
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .eq('admin_email', userEmail)
        .single();

      if (error) {
        console.error('❌ Error fetching admin profile:', error);
        return null;
      }

      console.log('✅ Admin profile found:', data);
      return data;
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
            console.log('✅ Admin profile loaded, authentication complete');
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
