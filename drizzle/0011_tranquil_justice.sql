ALTER TABLE "accounts" DROP CONSTRAINT "account_kind";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "account_kind" CHECK ("accounts"."kind" in ('cash','bank','asset','liability','equity','income','expense','other'));
--> statement-breakpoint
UPDATE accounts SET kind='equity' WHERE code='ABERTURA' AND name='Contrapartida de abertura' AND kind='other';
