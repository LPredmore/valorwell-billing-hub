
-- Fix RLS policies for admins table to prevent circular dependency
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Admins can view admin records" ON public.admins;
DROP POLICY IF EXISTS "Admins can update their own record" ON public.admins;
DROP POLICY IF EXISTS "Admins can insert admin records" ON public.admins;
DROP POLICY IF EXISTS "Admins can update admin records" ON public.admins;
DROP POLICY IF EXISTS "Admins can delete admin records" ON public.admins;

-- Create new policies that don't create circular dependencies
-- Allow users to check if their own email exists in admins table
CREATE POLICY "Users can check their own admin status" 
  ON public.admins 
  FOR SELECT 
  USING (admin_email = auth.email());

-- Allow admins (determined by function) to manage admin records
CREATE POLICY "Admin users can manage admin records" 
  ON public.admins 
  FOR ALL 
  USING (user_has_admin_privileges(auth.uid()));

-- Allow users to update their own admin profile
CREATE POLICY "Users can update their own admin profile" 
  ON public.admins 
  FOR UPDATE 
  USING (admin_email = auth.email());
