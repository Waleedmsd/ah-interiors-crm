CREATE TABLE "case_workflows" (
	"case_id" text PRIMARY KEY NOT NULL,
	"product_id" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"purchase_order_id" text,
	"delivery_id" text,
	"approval_id" text,
	"refund_id" text,
	"refund_pence" integer DEFAULT 0 NOT NULL,
	"customer_next_date" text DEFAULT '' NOT NULL,
	"supplier_next_date" text DEFAULT '' NOT NULL,
	"contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"returns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"customer_confirmed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "case_workflows_delivery_id_unique" UNIQUE("delivery_id"),
	CONSTRAINT "case_workflows_refund_id_unique" UNIQUE("refund_id")
);
--> statement-breakpoint
ALTER TABLE "case_workflows" ADD CONSTRAINT "case_workflows_case_id_customer_service_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."customer_service_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_workflows" ADD CONSTRAINT "case_workflows_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_workflows" ADD CONSTRAINT "case_workflows_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_workflows" ADD CONSTRAINT "case_workflows_delivery_id_delivery_jobs_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."delivery_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_workflows" ADD CONSTRAINT "case_workflows_approval_id_management_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."management_approvals"("id") ON DELETE no action ON UPDATE no action;