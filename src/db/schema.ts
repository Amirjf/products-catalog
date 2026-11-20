import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export type Attributes = Record<string, boolean | number | string>;

// Millisecond precision so a JS Date in a pagination cursor matches the stored value exactly.
const timestampMs = (name: string) =>
  timestamp(name, { precision: 3, withTimezone: true }).notNull().defaultNow();

export const products = pgTable(
  "products",
  {
    attributes: jsonb().$type<Attributes>().notNull().default({}),
    category: text().notNull(),
    createdAt: timestampMs("created_at"),
    description: text(),
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text().notNull(),
    priceCents: integer("price_cents").notNull(),
    sku: text().notNull().unique(),
    updatedAt: timestampMs("updated_at"),
    version: integer().notNull().default(1),
  },
  (t) => [
    check("products_category_slug", sql`${t.category} ~ '^[a-z0-9-]+$'`),
    check("products_price_non_negative", sql`${t.priceCents} >= 0`),
    // Backstop for the API's validation: at most 4 KB of attributes.
    check(
      "products_attributes_size",
      sql`octet_length(${t.attributes}::text) <= 4096`,
    ),
    // One index per (filter, sort) pair; id is the tie-breaker for keyset
    // pagination. price_desc scans the price indexes backward.
    // price_cents trails so "price range, newest first" is filtered inside the
    // index and only matching rows are read from the table.
    index("products_created_idx").on(t.createdAt, t.id, t.priceCents),
    index("products_price_idx").on(t.priceCents, t.id),
    index("products_category_created_idx").on(t.category, t.createdAt, t.id),
    index("products_category_price_idx").on(t.category, t.priceCents, t.id),
  ],
);

export type Product = typeof products.$inferSelect;
