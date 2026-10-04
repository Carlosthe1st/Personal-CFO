CREATE TABLE "budget_cells" (
	"organization_id" uuid NOT NULL,
	"budget_id" uuid NOT NULL,
	"month" integer NOT NULL,
	"account_id" uuid NOT NULL,
	"planned_cents" bigint NOT NULL,
	CONSTRAINT "budget_cells_budget_id_month_account_id_pk" PRIMARY KEY("budget_id","month","account_id"),
	CONSTRAINT "budget_month" CHECK ("budget_cells"."month" between 1 and 12),
	CONSTRAINT "budget_cell_cents" CHECK ("budget_cells"."planned_cents" between 0 and 9007199254740991)
);
ALTER TABLE public.budget_cells ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.budget_cells FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.budget_cells FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TABLE "budget_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"budget_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"reason" text,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_event_operation" UNIQUE("budget_id","idempotency_key"),
	CONSTRAINT "budget_event_version" UNIQUE("budget_id","version"),
	CONSTRAINT "budget_event_action" CHECK ("budget_events"."action" in ('revise','transfer'))
);
ALTER TABLE public.budget_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.budget_events FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.budget_events FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"annual_cents" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "budget_org_year" UNIQUE("organization_id","year"),
	CONSTRAINT "budget_org_id" UNIQUE("organization_id","id"),
	CONSTRAINT "budget_year" CHECK ("budgets"."year" between 1900 and 9998),
	CONSTRAINT "budget_annual_cents" CHECK ("budgets"."annual_cents" between 0 and 9007199254740991),
	CONSTRAINT "budget_version" CHECK ("budgets"."version" >= 0)
);
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.budgets FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.budgets FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "budget_cells" ADD CONSTRAINT "budget_cells_organization_id_budget_id_budgets_organization_id_id_fk" FOREIGN KEY ("organization_id","budget_id") REFERENCES "public"."budgets"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_cells" ADD CONSTRAINT "budget_cells_organization_id_account_id_accounts_organization_id_id_fk" FOREIGN KEY ("organization_id","account_id") REFERENCES "public"."accounts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_events" ADD CONSTRAINT "budget_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_events" ADD CONSTRAINT "budget_events_organization_id_budget_id_budgets_organization_id_id_fk" FOREIGN KEY ("organization_id","budget_id") REFERENCES "public"."budgets"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
