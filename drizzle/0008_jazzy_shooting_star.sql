CREATE TABLE "ecommerce_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"shop" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'Needs review' NOT NULL,
	"payload" jsonb NOT NULL,
	"order_id" text,
	"error" text,
	"external_updated_at" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_cost_sheets" (
	"order_id" text PRIMARY KEY NOT NULL,
	"costs" jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"reviewed" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ecommerce_imports" ADD CONSTRAINT "ecommerce_imports_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cost_sheets" ADD CONSTRAINT "order_cost_sheets_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cost_sheets" ADD CONSTRAINT "order_cost_sheets_updated_by_staff_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ecommerce_shop_order_unique" ON "ecommerce_imports" USING btree ("shop","external_id");