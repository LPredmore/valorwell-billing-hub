
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
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .eq('admin_email', userEmail)
        .single();

      if (error) {
        console.error('Error fetching admin profile:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in fetchAdminProfile:', error);
      return null;
    }
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session);
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user?.email) {
          // Defer admin profile fetch to avoid potential callback issues
          setTimeout(async () => {
            const profile = await fetchAdminProfile(session.user.email);
            setAdminProfile(profile);
            setLoading(false);
          }, 0);
        } else {
          setAdminProfile(null);
          setLoading(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
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
