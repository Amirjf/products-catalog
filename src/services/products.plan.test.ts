import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "../db/client.js";
import { list, type ListQuery, listQuery } from "./products.js";

interface PlanNode {
  Filter?: string;
  "Index Name"?: string;
  Plans?: PlanNode[];
}

const flatten = (node: PlanNode): PlanNode[] => [
  node,
  ...(node.Plans ?? []).flatMap(flatten),
];

async function plan(query: ListQuery): Promise<PlanNode[]> {
  const { params, sql } = listQuery(query).toSQL();
  const { rows } = await pool.query<{ "QUERY PLAN": [{ Plan: PlanNode }] }>(
    `EXPLAIN (FORMAT JSON) ${sql}`,
    params,
  );
  const [row] = rows;
  if (!row) throw new Error("EXPLAIN returned no plan");
  return flatten(row["QUERY PLAN"][0].Plan);
}

beforeAll(async () => {
  await pool.query(await readFile("./db/seed.sql", "utf8"));
}, 120_000);

afterAll(async () => {
  await pool.query("TRUNCATE products");
  await pool.end();
});

const range = { maxPriceCents: 11_000, minPriceCents: 10_000 };

describe.each<[Omit<ListQuery, "limit">, string]>([
  [{ sort: "newest" }, "products_created_idx"],
  [{ sort: "newest", ...range }, "products_created_idx"],
  [{ sort: "price_asc" }, "products_price_idx"],
  [{ sort: "price_desc", ...range }, "products_price_idx"],
  [{ category: "phones", sort: "newest" }, "products_category_created_idx"],
  [{ category: "phones", sort: "price_asc" }, "products_category_price_idx"],
  [
    { category: "phones", sort: "price_desc", ...range },
    "products_category_price_idx",
  ],
])("at 300,000 products, %o", (filters, index) => {
  it(`uses only ${index} and checks every filter inside it, on every page`, async () => {
    const query = { limit: 20, ...filters };
    const { nextCursor } = await list(query);
    expect(nextCursor).not.toBeNull();

    for (const page of [query, { ...query, cursor: nextCursor ?? "" }]) {
      const nodes = await plan(page);
      expect(
        nodes.flatMap((node) => node["Index Name"] ?? []),
        "indexes the plan reads",
      ).toEqual([index]);
      expect(
        nodes.flatMap((node) => node.Filter ?? []),
        "conditions checked on table rows after the index scan",
      ).toEqual([]);
    }
  });
});
