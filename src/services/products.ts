import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client.js";
import { type Product, products } from "../db/schema.js";
import { HttpError } from "../errors.js";

export const SORTS = ["newest", "price_asc", "price_desc"] as const;
export interface ListQuery {
  category?: string | undefined;
  cursor?: string | undefined;
  limit: number;
  maxPriceCents?: number | undefined;
  minPriceCents?: number | undefined;
  sort: Sort;
}

export type NewProduct = typeof products.$inferInsert;

// A null attribute value removes that attribute.
export interface ProductPatch {
  attributes?: Record<string, boolean | null | number | string> | undefined;
  category?: string | undefined;
  description?: null | string | undefined;
  name?: string | undefined;
  priceCents?: number | undefined;
}

export type Sort = (typeof SORTS)[number];

const cursorSchema = z.discriminatedUnion("sort", [
  z.strictObject({
    lastId: z.uuid(),
    lastValue: z.iso.datetime(),
    sort: z.literal("newest"),
  }),
  z.strictObject({
    lastId: z.uuid(),
    lastValue: z.int(),
    sort: z.enum(["price_asc", "price_desc"]),
  }),
]);
type Cursor = z.infer<typeof cursorSchema>;

const encodeCursor = (cursor: Cursor) =>
  Buffer.from(JSON.stringify(cursor)).toString("base64url");

// A row comparison makes (sort column, id) one key, so ties on the sort column
// never skip or repeat a product.
function afterCursor(cursor: Cursor) {
  switch (cursor.sort) {
    case "newest":
      return sql`(${products.createdAt}, ${products.id}) < (${cursor.lastValue}::timestamptz, ${cursor.lastId}::uuid)`;
    case "price_asc":
      return sql`(${products.priceCents}, ${products.id}) > (${cursor.lastValue}::int, ${cursor.lastId}::uuid)`;
    case "price_desc":
      return sql`(${products.priceCents}, ${products.id}) < (${cursor.lastValue}::int, ${cursor.lastId}::uuid)`;
  }
}

function decodeCursor(raw: string, sort: Sort): Cursor {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(raw, "base64url").toString());
  } catch {
    json = undefined;
  }
  const parsed = cursorSchema.safeParse(json);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_cursor", "Cursor is not valid");
  }
  if (parsed.data.sort !== sort) {
    throw new HttpError(
      400,
      "invalid_cursor",
      "Cursor was issued for a different sort",
    );
  }
  return parsed.data;
}

// Both columns go in the same direction so one index serves the whole ORDER BY.
const ORDER_BY = {
  newest: [desc(products.createdAt), desc(products.id)],
  price_asc: [asc(products.priceCents), asc(products.id)],
  price_desc: [desc(products.priceCents), desc(products.id)],
};

export async function create(input: NewProduct): Promise<Product> {
  const [product] = await db.insert(products).values(input).returning();
  if (!product) throw new Error("Insert returned no row");
  return product;
}

export async function get(id: string): Promise<Product> {
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) throw new HttpError(404, "not_found", "Product not found");
  return product;
}

export async function list(query: ListQuery) {
  const rows = await listQuery(query);

  const items = rows.slice(0, query.limit);
  const last = items.at(-1);
  const nextCursor =
    rows.length > query.limit && last
      ? encodeCursor(cursorFor(query.sort, last))
      : null;
  return { items, nextCursor };
}

export function listQuery(query: ListQuery) {
  return (
    db
      .select()
      .from(products)
      .where(
        and(
          query.category === undefined
            ? undefined
            : eq(products.category, query.category),
          query.minPriceCents === undefined
            ? undefined
            : gte(products.priceCents, query.minPriceCents),
          query.maxPriceCents === undefined
            ? undefined
            : lte(products.priceCents, query.maxPriceCents),
          query.cursor === undefined
            ? undefined
            : afterCursor(decodeCursor(query.cursor, query.sort)),
        ),
      )
      .orderBy(...ORDER_BY[query.sort])
      // One extra row tells us whether there is a next page.
      .limit(query.limit + 1)
  );
}

export async function remove(
  id: string,
  expectedVersion: null | number,
): Promise<void> {
  const deleted = await db
    .delete(products)
    .where(matches(id, expectedVersion))
    .returning({ id: products.id });
  if (deleted.length === 0) throw await missingOrStale(id);
}

export async function update(
  id: string,
  { attributes, ...fields }: ProductPatch,
  expectedVersion: null | number,
): Promise<Product> {
  const [product] = await db
    .update(products)
    .set({
      ...fields,
      // Merge, then drop the keys the patch set to null.
      ...(attributes && {
        attributes: sql`jsonb_strip_nulls(${products.attributes} || ${JSON.stringify(attributes)}::jsonb)`,
      }),
      updatedAt: sql`now()`,
      version: sql`${products.version} + 1`,
    })
    .where(matches(id, expectedVersion))
    .returning();
  if (!product) throw await missingOrStale(id);
  return product;
}

function cursorFor(sort: Sort, last: Product): Cursor {
  return sort === "newest"
    ? { lastId: last.id, lastValue: last.createdAt.toISOString(), sort }
    : { lastId: last.id, lastValue: last.priceCents, sort };
}

// A null expectedVersion means no precondition.
function matches(id: string, expectedVersion: null | number) {
  return and(
    eq(products.id, id),
    expectedVersion === null
      ? undefined
      : eq(products.version, expectedVersion),
  );
}

// A conditional write touched no row, so the product is either gone or has changed.
async function missingOrStale(id: string): Promise<HttpError> {
  const exists = await db.$count(products, eq(products.id, id));
  return exists
    ? new HttpError(412, "precondition_failed", "Product has changed")
    : new HttpError(404, "not_found", "Product not found");
}
