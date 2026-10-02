CREATE TABLE "product_price_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"supplier_cost_pence" integer NOT NULL,
	"selling_price_pence" integer NOT NULL,
	"previous_supplier_cost_pence" integer,
	"previous_selling_price_pence" integer,
	"changed_by" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sku" text NOT NULL,
	"supplier_id" text NOT NULL,
	"supplier_sku" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"supplier_cost_pence" integer NOT NULL,
	"selling_price_pence" integer NOT NULL,
	"details" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_changed_by_staff_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "products_supplier_sku_idx" ON "products" USING btree ("supplier_sku");