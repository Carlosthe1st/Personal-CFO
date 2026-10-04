ALTER TABLE "movements" ADD CONSTRAINT "movement_org_id" UNIQUE("organization_id","id");
--> statement-breakpoint
CREATE TABLE "movement_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"reversal_entry_id" uuid NOT NULL,
	"replacement_organization_id" uuid,
	"replacement_movement_id" uuid,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movement_change_original" UNIQUE("movement_id"),
	CONSTRAINT "movement_change_operation" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "movement_change_pair" CHECK (("movement_changes"."replacement_organization_id" is null) = ("movement_changes"."replacement_movement_id" is null))
);
ALTER TABLE public.movement_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.movement_changes FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.movement_changes FROM %I',role_name);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "movement_changes" ADD CONSTRAINT "movement_changes_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_changes" ADD CONSTRAINT "movement_changes_organization_id_movement_id_movements_organization_id_id_fk" FOREIGN KEY ("organization_id","movement_id") REFERENCES "public"."movements"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_changes" ADD CONSTRAINT "movement_changes_organization_id_reversal_entry_id_journal_entries_organization_id_id_fk" FOREIGN KEY ("organization_id","reversal_entry_id") REFERENCES "public"."journal_entries"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_changes" ADD CONSTRAINT "movement_changes_replacement_organization_id_replacement_movement_id_movements_organization_id_id_fk" FOREIGN KEY ("replacement_organization_id","replacement_movement_id") REFERENCES "public"."movements"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
