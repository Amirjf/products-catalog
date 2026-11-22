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

const timestampMs = () =>
  timestamp({ precision: 3, withTimezone: true }).notNull().defaultNow();

export const products = pgTable(
  "products",
  {
    attributes: jsonb().$type<Attributes>().notNull().default({}),
    category: text().notNull(),
    createdAt: timestampMs(),
    description: text(),
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text().notNull(),
    priceCents: integer().notNull(),
    sku: text().notNull().unique(),
    updatedAt: timestampMs(),
    version: integer().notNull().default(1),
  },
  (t) => [
    check("products_category_slug", sql`${t.category} ~ '^[a-z0-9-]+$'`),
    check("products_price_non_negative", sql`${t.priceCents} >= 0`),
    check(
      "products_attributes_size",
      sql`octet_length(${t.attributes}::text) <= 4096`,
    ),
    index("products_created_idx").on(t.createdAt, t.id, t.priceCents),
    index("products_price_idx").on(t.priceCents, t.id),
    index("products_category_created_idx").on(t.category, t.createdAt, t.id),
    index("products_category_price_idx").on(t.category, t.priceCents, t.id),
  ],
);

export type Product = typeof products.$inferSelect;
