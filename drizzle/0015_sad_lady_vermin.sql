CREATE TABLE "receipt_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detached_at" timestamp with time zone,
	CONSTRAINT "receipt_object_key" UNIQUE("object_key"),
	CONSTRAINT "receipt_size" CHECK ("receipt_files"."size" between 1 and 5000000)
);
--> statement-breakpoint
ALTER TABLE "receipt_files" ADD CONSTRAINT "receipt_files_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_files" ADD CONSTRAINT "receipt_files_organization_id_movement_id_movements_organization_id_id_fk" FOREIGN KEY ("organization_id","movement_id") REFERENCES "public"."movements"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipts_by_movement" ON "receipt_files" USING btree ("organization_id","movement_id");--> statement-breakpoint
ALTER TABLE public.receipt_files ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE public.receipt_files FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.receipt_files FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
