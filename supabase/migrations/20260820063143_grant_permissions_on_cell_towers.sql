-- Grant explicit privileges to all Supabase database roles on cell_towers
GRANT ALL ON TABLE public.cell_towers TO postgres, service_role, authenticated, anon;
