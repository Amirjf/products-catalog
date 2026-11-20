DROP INDEX "products_created_idx";--> statement-breakpoint
CREATE INDEX "products_created_idx" ON "products" USING btree ("created_at","id","price_cents");