CREATE TABLE "communication_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_order_items" ALTER COLUMN "quantity" SET DATA TYPE numeric(14, 3);--> statement-breakpoint
ALTER TABLE "purchase_order_items" ALTER COLUMN "received_quantity" SET DATA TYPE numeric(14, 3);--> statement-breakpoint
ALTER TABLE "stock_balances" ALTER COLUMN "physical" SET DATA TYPE numeric(14, 3);--> statement-breakpoint
ALTER TABLE "stock_balances" ALTER COLUMN "reserved" SET DATA TYPE numeric(14, 3);--> statement-breakpoint
ALTER TABLE "stock_balances" ALTER COLUMN "display" SET DATA TYPE numeric(14, 3);--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "quantity" SET DATA TYPE numeric(14, 3);--> statement-breakpoint
ALTER TABLE "stock_reservations" ALTER COLUMN "quantity" SET DATA TYPE numeric(14, 3);--> statement-breakpoint
ALTER TABLE "communication_drafts" ADD CONSTRAINT "communication_drafts_updated_by_staff_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;