import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../app.js";
import { db, pool } from "../../db/client.js";
import { type Product, products } from "../../db/schema.js";

const AUTH = { Authorization: "Bearer test-token" };
const MISSING_ID = "019a0000-0000-7000-8000-000000000000";

interface Page {
  items: Product[];
  nextCursor: null | string;
}

const phone = { category: "phones", name: "Phone", priceCents: 49900 };

async function create(body: Record<string, unknown>): Promise<Product> {
  const res = await request(app).post("/v1/products").set(AUTH).send(body);
  expect(res.status).toBe(201);
  return res.body as Product;
}

// Follows nextCursor to the end and returns every id in the order served.
async function pageThrough(query: string): Promise<string[]> {
  const ids: string[] = [];
  let cursor: null | string = null;
  do {
    const url: string =
      `/v1/products?${query}` + (cursor === null ? "" : `&cursor=${cursor}`);
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
    const page = res.body as Page;
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
  } while (cursor !== null);
  return ids;
}

beforeEach(async () => {
  await db.delete(products);
});

afterAll(async () => {
  await pool.end();
});

describe("auth", () => {
  it("returns 401 on writes without the admin token", async () => {
    const product = await create({ ...phone, sku: "A-1" });
    const url = `/v1/products/${product.id}`;

    const responses = await Promise.all([
      request(app)
        .post("/v1/products")
        .send({ ...phone, sku: "A-2" }),
      request(app).patch(url).send({ name: "x" }),
      request(app).delete(url),
      request(app).delete(url).set("Authorization", "Bearer wrong"),
    ]);

    expect(responses.map((res) => res.status)).toEqual([401, 401, 401, 401]);
    expect(responses[0].headers["cache-control"]).toBe("no-store");
    expect((await request(app).get(url)).status).toBe(200);
  });
});

describe("create and read", () => {
  it("creates a product and serves it with caching headers", async () => {
    const res = await request(app)
      .post("/v1/products")
      .set(AUTH)
      .send({
        attributes: { color: "black" },
        category: "  Phones ",
        name: "Phone",
        priceCents: 49900,
        sku: "A-1",
      });
    const created = res.body as Product;

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/v1/products/${created.id}`);
    expect(res.headers.etag).toBe('"1"');
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(created).toMatchObject({
      attributes: { color: "black" },
      category: "phones",
      description: null,
      version: 1,
    });

    const read = await request(app).get(`/v1/products/${created.id}`);
    expect(read.status).toBe(200);
    expect(read.body).toEqual(created);
    expect(read.headers.etag).toBe('"1"');
    expect(read.headers["cache-control"]).toBe(
      "public, max-age=30, stale-while-revalidate=30",
    );
  });

  it("returns 304 when If-None-Match matches the ETag", async () => {
    const product = await create({ ...phone, sku: "A-1" });

    const single = await request(app)
      .get(`/v1/products/${product.id}`)
      .set("If-None-Match", '"1"');
    expect(single.status).toBe(304);

    const list = await request(app).get("/v1/products");
    const listAgain = await request(app)
      .get("/v1/products")
      .set("If-None-Match", list.headers.etag ?? "");
    expect(listAgain.status).toBe(304);
  });

  it("returns 409 on a duplicate sku", async () => {
    await create({ ...phone, sku: "A-1" });
    const res = await request(app)
      .post("/v1/products")
      .set(AUTH)
      .send({ ...phone, sku: "A-1" });

    expect(res.status).toBe(409);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("returns 400 on invalid input", async () => {
    const bodies = [
      { ...phone, sku: "A-1", stock: 3 },
      { ...phone, priceCents: -1, sku: "A-1" },
      { ...phone, category: "mobile phones", sku: "A-1" },
      { ...phone, attributes: { size: { nested: true } }, sku: "A-1" },
      { ...phone, name: null, sku: "A-1" },
    ];
    for (const body of bodies) {
      const res = await request(app).post("/v1/products").set(AUTH).send(body);
      expect(res.status).toBe(400);
    }
  });

  it("returns 404 for a missing product", async () => {
    const res = await request(app).get(`/v1/products/${MISSING_ID}`);
    expect(res.status).toBe(404);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("update and delete", () => {
  it("patches fields, bumps the version and clears description with null", async () => {
    const product = await create({
      ...phone,
      attributes: { color: "black", storage: "128GB" },
      description: "Old",
      sku: "A-1",
    });

    const res = await request(app)
      .patch(`/v1/products/${product.id}`)
      .set(AUTH)
      .send({
        attributes: { color: null, size: "L" },
        description: null,
        priceCents: 100,
      });

    expect(res.status).toBe(200);
    expect(res.headers.etag).toBe('"2"');
    expect(res.body).toMatchObject({
      attributes: { size: "L", storage: "128GB" },
      description: null,
      name: "Phone",
      priceCents: 100,
      sku: "A-1",
      version: 2,
    });
  });

  it("returns 400 when a patch is invalid", async () => {
    const product = await create({ ...phone, sku: "A-1" });
    const bodies = [{ sku: "A-2" }, { name: null }, { colour: "red" }, {}];

    for (const body of bodies) {
      const res = await request(app)
        .patch(`/v1/products/${product.id}`)
        .set(AUTH)
        .send(body);
      expect(res.status).toBe(400);
    }
  });

  it("returns 412 on a stale If-Match for PATCH and DELETE", async () => {
    const product = await create({ ...phone, sku: "A-1" });
    const url = `/v1/products/${product.id}`;
    const fresh = await request(app)
      .patch(url)
      .set(AUTH)
      .set("If-Match", '"1"')
      .send({ priceCents: 1 });
    expect(fresh.status).toBe(200);

    const stalePatch = await request(app)
      .patch(url)
      .set(AUTH)
      .set("If-Match", '"1"')
      .send({ priceCents: 2 });
    const staleDelete = await request(app)
      .delete(url)
      .set(AUTH)
      .set("If-Match", '"1"');

    expect(stalePatch.status).toBe(412);
    expect(staleDelete.status).toBe(412);
    const read = await request(app).get(url);
    expect(read.body).toMatchObject({ priceCents: 1, version: 2 });
  });

  it("deletes a product, then returns 404 for it", async () => {
    const product = await create({ ...phone, sku: "A-1" });
    const url = `/v1/products/${product.id}`;

    const res = await request(app).delete(url).set(AUTH).set("If-Match", '"1"');

    expect(res.status).toBe(204);
    expect((await request(app).get(url)).status).toBe(404);
  });

  it("returns 404 on PATCH or DELETE of a missing product", async () => {
    const url = `/v1/products/${MISSING_ID}`;
    const patch = await request(app).patch(url).set(AUTH).send({ name: "x" });
    const del = await request(app).delete(url).set(AUTH);

    expect(patch.status).toBe(404);
    expect(del.status).toBe(404);
  });
});

describe("list", () => {
  // One INSERT creates 45 phones with the same price and created_at, and 15
  // books at three other prices. Every sort has to break ties on id.
  beforeEach(async () => {
    const row = (i: number, category: string, priceCents: number) => ({
      category,
      name: `Product ${String(i)}`,
      priceCents,
      sku: `S-${String(i)}`,
    });
    await db
      .insert(products)
      .values([
        ...Array.from({ length: 45 }, (_, i) => row(i, "phones", 1000)),
        ...Array.from({ length: 15 }, (_, i) =>
          row(100 + i, "books", 500 * (1 + (i % 3))),
        ),
      ]);
  });

  it.each(["newest", "price_asc", "price_desc"])(
    "pages through equal sort values without duplicates or gaps (%s)",
    async (sort) => {
      const ids = await pageThrough(`sort=${sort}&limit=7`);
      const all = await request(app).get(`/v1/products?sort=${sort}&limit=100`);
      const expected = (all.body as Page).items.map((item) => item.id);

      expect(expected).toHaveLength(60);
      expect(new Set(ids).size).toBe(60);
      expect(ids).toEqual(expected);
    },
  );

  it("sorts by price in both directions", async () => {
    const prices = async (sort: string) => {
      const res = await request(app).get(`/v1/products?sort=${sort}&limit=100`);
      return (res.body as Page).items.map((item) => item.priceCents);
    };
    const ascending = await prices("price_asc");

    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
    expect(await prices("price_desc")).toEqual([...ascending].reverse());
  });

  it("combines category and inclusive price filters", async () => {
    const res = await request(app).get(
      "/v1/products?category=Books&minPriceCents=1000&maxPriceCents=1500&sort=price_asc",
    );
    const page = res.body as Page;

    expect(res.status).toBe(200);
    expect(page.items).toHaveLength(10);
    expect(page.nextCursor).toBeNull();
    expect(page.items.every((item) => item.category === "books")).toBe(true);
    expect(page.items.map((item) => item.priceCents)).toEqual([
      ...Array.from({ length: 5 }, () => 1000),
      ...Array.from({ length: 5 }, () => 1500),
    ]);

    const filtered = await pageThrough(
      "category=phones&minPriceCents=1000&maxPriceCents=1000&limit=20",
    );
    expect(new Set(filtered).size).toBe(45);
  });

  it("returns 400 on invalid query parameters", async () => {
    const first = await request(app).get("/v1/products?sort=price_asc&limit=5");
    const cursor = String((first.body as Page).nextCursor);
    const urls = [
      "/v1/products?minPriceCents=500&maxPriceCents=100",
      "/v1/products?limit=101",
      "/v1/products?colour=red",
      "/v1/products?cursor=not-a-cursor",
      `/v1/products?sort=newest&cursor=${cursor}`,
    ];

    for (const url of urls) {
      const res = await request(app).get(url);
      expect(res.status).toBe(400);
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  });
});
