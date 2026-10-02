ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE public.users, public.auth_accounts, public.sessions, public.verification_tokens, public.organizations, public.memberships, public.accounts, public.journal_entries, public.journal_lines, public.audit_events FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.protect_journal_entry(), public.protect_journal_line() FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.protect_journal_entry(), public.protect_journal_line() FROM PUBLIC;
