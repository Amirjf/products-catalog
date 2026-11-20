CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"description" text,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"sku" text NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_category_slug" CHECK ("products"."category" ~ '^[a-z0-9-]+$'),
	CONSTRAINT "products_price_non_negative" CHECK ("products"."price_cents" >= 0),
	CONSTRAINT "products_attributes_size" CHECK (octet_length("products"."attributes"::text) <= 4096)
);
--> statement-breakpoint
CREATE INDEX "products_created_idx" ON "products" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "products_price_idx" ON "products" USING btree ("price_cents","id");--> statement-breakpoint
CREATE INDEX "products_category_created_idx" ON "products" USING btree ("category","created_at","id");--> statement-breakpoint
CREATE INDEX "products_category_price_idx" ON "products" USING btree ("category","price_cents","id");