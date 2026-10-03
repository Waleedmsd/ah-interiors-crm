CREATE TABLE "flooring_fulfilments" (
	"lead_id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'Awaiting Materials' NOT NULL,
	"fitter_id" text,
	"scheduled_date" text DEFAULT '' NOT NULL,
	"time_slot" text DEFAULT '' NOT NULL,
	"customer_confirmed" boolean DEFAULT false NOT NULL,
	"signoff" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"case_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flooring_fulfilments_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "flooring_fulfilments" ADD CONSTRAINT "flooring_fulfilments_lead_id_flooring_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."flooring_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flooring_fulfilments" ADD CONSTRAINT "flooring_fulfilments_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flooring_fulfilments" ADD CONSTRAINT "flooring_fulfilments_fitter_id_staff_users_id_fk" FOREIGN KEY ("fitter_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flooring_fulfilments" ADD CONSTRAINT "flooring_fulfilments_case_id_customer_service_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."customer_service_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flooring_fitter_schedule_idx" ON "flooring_fulfilments" USING btree ("fitter_id","scheduled_date");