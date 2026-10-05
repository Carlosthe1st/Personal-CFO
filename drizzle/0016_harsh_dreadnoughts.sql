CREATE TABLE "funds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "fund_org_id" UNIQUE("organization_id","id"),
	CONSTRAINT "fund_name" CHECK (length(trim("funds"."name")) between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "movements" ADD COLUMN "fund_id" uuid;--> statement-breakpoint
ALTER TABLE "funds" ADD CONSTRAINT "funds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fund_org_name" ON "funds" USING btree ("organization_id",lower(trim("name")));--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_organization_id_fund_id_funds_organization_id_id_fk" FOREIGN KEY ("organization_id","fund_id") REFERENCES "public"."funds"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE public.funds ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE public.funds FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.funds FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
