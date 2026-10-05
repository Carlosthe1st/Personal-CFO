CREATE TABLE "fund_allocation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"operation_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"mode" text NOT NULL,
	"reason" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fund_allocation_operation" UNIQUE("organization_id","operation_id"),
	CONSTRAINT "fund_allocation_event_mode" CHECK ("fund_allocation_events"."mode" in ('revise','transfer')),
	CONSTRAINT "fund_allocation_event_year" CHECK ("fund_allocation_events"."year" between 1900 and 9998)
);
--> statement-breakpoint
CREATE TABLE "fund_allocations" (
	"organization_id" uuid NOT NULL,
	"fund_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"planned_cents" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "fund_allocations_organization_id_fund_id_year_month_pk" PRIMARY KEY("organization_id","fund_id","year","month"),
	CONSTRAINT "fund_allocation_year" CHECK ("fund_allocations"."year" between 1900 and 9998),
	CONSTRAINT "fund_allocation_month" CHECK ("fund_allocations"."month" between 1 and 12),
	CONSTRAINT "fund_allocation_cents" CHECK ("fund_allocations"."planned_cents" between 0 and 9007199254740991)
);
--> statement-breakpoint
ALTER TABLE "fund_allocation_events" ADD CONSTRAINT "fund_allocation_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_allocation_events" ADD CONSTRAINT "fund_allocation_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_allocations" ADD CONSTRAINT "fund_allocations_organization_id_fund_id_funds_organization_id_id_fk" FOREIGN KEY ("organization_id","fund_id") REFERENCES "public"."funds"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE public.fund_allocations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.fund_allocation_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE public.fund_allocations, public.fund_allocation_events FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.fund_allocations, public.fund_allocation_events FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
