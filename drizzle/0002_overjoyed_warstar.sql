CREATE TABLE "purchase_order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"purchase_order_id" text NOT NULL,
	"product_id" text NOT NULL,
	"supplier_sku" text NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost_pence" integer NOT NULL,
	"received_quantity" integer DEFAULT 0 NOT NULL,
	"customer_id" text
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"supplier_id" text NOT NULL,
	"order_id" text,
	"customer_id" text,
	"buyer_id" text NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"date" text NOT NULL,
	"expected_date" text,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"account_reference" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "supplier_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"supplier_id" text NOT NULL,
	"purchase_order_id" text NOT NULL,
	"order_id" text,
	"customer_id" text,
	"owner_id" text NOT NULL,
	"status" text DEFAULT 'Needs Ordering' NOT NULL,
	"details" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_buyer_id_staff_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_owner_id_staff_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;