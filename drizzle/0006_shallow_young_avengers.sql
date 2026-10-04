CREATE TABLE "movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"type" text NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"counter_account_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movement_operation" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "movement_entry" UNIQUE("journal_entry_id"),
	CONSTRAINT "movement_type" CHECK ("movements"."type" in ('income','expense','transfer')),
	CONSTRAINT "movement_cents" CHECK ("movements"."amount_cents" between 1 and 9007199254740991),
	CONSTRAINT "movement_distinct_accounts" CHECK ("movements"."financial_account_id" <> "movements"."counter_account_id")
);
--> statement-breakpoint
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_organization_id_journal_entry_id_journal_entries_organization_id_id_fk" FOREIGN KEY ("organization_id","journal_entry_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_organization_id_financial_account_id_accounts_organization_id_id_fk" FOREIGN KEY ("organization_id","financial_account_id") REFERENCES "public"."accounts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_organization_id_counter_account_id_accounts_organization_id_id_fk" FOREIGN KEY ("organization_id","counter_account_id") REFERENCES "public"."accounts"("organization_id","id") ON DELETE no action ON UPDATE no action;
