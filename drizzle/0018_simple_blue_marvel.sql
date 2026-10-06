CREATE TABLE "recurrence_occurrences" (
	"organization_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"status" text NOT NULL,
	"postponed_until" date,
	"movement_id" uuid,
	"actor_id" uuid NOT NULL,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurrence_occurrences_rule_id_due_date_pk" PRIMARY KEY("rule_id","due_date"),
	CONSTRAINT "recurrence_status" CHECK ("recurrence_occurrences"."status" in ('confirmed','skipped','postponed')),
	CONSTRAINT "recurrence_resolution" CHECK (("recurrence_occurrences"."status" = 'confirmed') = ("recurrence_occurrences"."movement_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "recurrence_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"type" text NOT NULL,
	"frequency" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"anchor_day" integer NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"counter_account_id" uuid NOT NULL,
	"fund_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "recurrence_rule_org_id" UNIQUE("organization_id","id"),
	CONSTRAINT "recurrence_type" CHECK ("recurrence_rules"."type" in ('income','expense')),
	CONSTRAINT "recurrence_frequency" CHECK ("recurrence_rules"."frequency" in ('weekly','monthly')),
	CONSTRAINT "recurrence_anchor" CHECK ("recurrence_rules"."anchor_day" between 1 and 31),
	CONSTRAINT "recurrence_amount" CHECK ("recurrence_rules"."amount_cents" between 1 and 9007199254740991)
);
--> statement-breakpoint
ALTER TABLE "recurrence_occurrences" ADD CONSTRAINT "recurrence_occurrences_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_occurrences" ADD CONSTRAINT "recurrence_occurrences_organization_id_rule_id_recurrence_rules_organization_id_id_fk" FOREIGN KEY ("organization_id","rule_id") REFERENCES "public"."recurrence_rules"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_occurrences" ADD CONSTRAINT "recurrence_occurrences_organization_id_movement_id_movements_organization_id_id_fk" FOREIGN KEY ("organization_id","movement_id") REFERENCES "public"."movements"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_organization_id_financial_account_id_accounts_organization_id_id_fk" FOREIGN KEY ("organization_id","financial_account_id") REFERENCES "public"."accounts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_organization_id_counter_account_id_accounts_organization_id_id_fk" FOREIGN KEY ("organization_id","counter_account_id") REFERENCES "public"."accounts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_organization_id_fund_id_funds_organization_id_id_fk" FOREIGN KEY ("organization_id","fund_id") REFERENCES "public"."funds"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE public.recurrence_rules ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.recurrence_occurrences ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE public.recurrence_rules, public.recurrence_occurrences FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.recurrence_rules, public.recurrence_occurrences FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
