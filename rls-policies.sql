-- rls-policies.sql
-- This script enables Row Level Security (RLS) for the application tables
-- and defines policies based on user roles.

-- Step 1: Create helper functions to get user status and role.
-- These functions make policies easier to write and manage.
-- SECURITY DEFINER allows these functions to query tables (like public.staffs)
-- that the calling user might not have direct access to.

-- Function to check if the currently logged-in user exists in the staffs table.
CREATE OR REPLACE FUNCTION public.is_app_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.staffs
    WHERE email = auth.email()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get the role of the currently logged-in user.
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM public.staffs
  WHERE email = auth.email();
  RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Step 2: Enable RLS and apply policies for general tables.
-- These tables allow full access (SELECT, INSERT, UPDATE, DELETE)
-- to any user who is registered in the `staffs` table.

DO $$
DECLARE
  t_name TEXT;
BEGIN
  -- List of tables to apply the general policy
  FOREACH t_name IN ARRAY ARRAY['clients', 'monthly_tasks', 'editing_sessions', 'default_tasks', 'settings']
  LOOP
    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t_name);

    -- Drop existing policy if it exists, to allow re-running the script
    EXECUTE format('DROP POLICY IF EXISTS "Allow full access for app users" ON public.%I;', t_name);

    -- Create the policy
    EXECUTE format('
      CREATE POLICY "Allow full access for app users"
      ON public.%I
      FOR ALL
      USING (public.is_app_user())
      WITH CHECK (public.is_app_user());
    ', t_name);
  END LOOP;
END;
$$;


-- Step 3: Enable RLS and apply specific policies for the `staffs` table.
-- This table has special rules:
-- - Any registered user can VIEW the list of staff.
-- - Only users with the 'admin' role can INSERT, UPDATE, or DELETE staff records.

-- Enable RLS on the staffs table
ALTER TABLE public.staffs ENABLE ROW LEVEL SECURITY;

-- Policy for SELECT: Allow any registered user to see the staff list.
DROP POLICY IF EXISTS "Allow select for app users" ON public.staffs;
CREATE POLICY "Allow select for app users"
ON public.staffs
FOR SELECT
USING (public.is_app_user());

-- Policy for INSERT: Allow only admins to add new staff.
DROP POLICY IF EXISTS "Allow insert for admins" ON public.staffs;
CREATE POLICY "Allow insert for admins"
ON public.staffs
FOR INSERT
WITH CHECK (public.get_user_role() = 'admin');

-- Policy for UPDATE: Allow only admins to update staff records.
DROP POLICY IF EXISTS "Allow update for admins" ON public.staffs;
CREATE POLICY "Allow update for admins"
ON public.staffs
FOR UPDATE
USING (public.get_user_role() = 'admin');

-- Policy for DELETE: Allow only admins to delete staff records.
DROP POLICY IF EXISTS "Allow delete for admins" ON public.staffs;
CREATE POLICY "Allow delete for admins"
ON public.staffs
FOR DELETE
USING (public.get_user_role() = 'admin');

-- --- END OF SCRIPT ---
