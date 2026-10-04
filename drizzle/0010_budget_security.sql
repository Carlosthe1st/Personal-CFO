ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.movements FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.movements FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
