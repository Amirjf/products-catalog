# Product catalog

Backend for an e-commerce product catalog: a REST API to create, read, update and delete products, and to list them with filters and pagination.

It is built for the stated load: a few hundred thousand products, far more reads than writes, and listing by category and price range.

- **Stack**: Node 24, TypeScript, Express 5, PostgreSQL 18, Drizzle ORM, zod.
- **Decisions**: the five short records in [`docs/adr`](docs/adr) explain the choices that would be expensive to change.

## Run it

```sh
docker compose up --build
```

This starts PostgreSQL, applies the migrations, seeds 300,000 products, and starts the API on <http://localhost:3000>, with interactive docs at <http://localhost:3000/docs> (spec at `/openapi.json`). The first start takes about 30 seconds.

```sh
curl "localhost:3000/v1/products?category=phones&minPriceCents=10000&maxPriceCents=20000&sort=price_asc&limit=5"

curl -X POST localhost:3000/v1/products \
  -H "Authorization: Bearer dev-admin-token" -H "Content-Type: application/json" \
  -d '{"sku":"TSHIRT-RED-M","name":"Red T-shirt, M","category":"shirts","priceCents":1999,"attributes":{"color":"red","size":"M"}}'
```

- If port 3000 is taken: `API_PORT=3100 docker compose up --build`.
- PostgreSQL is published on host port **5433** (not 5432, which a local Postgres often holds). Override with `DB_PORT`.
- To reseed from scratch: `docker compose down -v`, then start again.
- The admin token defaults to `dev-admin-token`. Set `ADMIN_TOKEN` to change it.

### Development

```sh
nvm use && npm install
cp .env.example .env
docker compose up -d --wait db   # database only
npm run db:migrate               # apply migrations to the dev database
npm run dev                      # API with reload
npm run test:run                 # integration tests, against the catalog_test database
npm run type-check && npm run lint && npm run format:check && npm run spellcheck
```

After changing `src/db/schema.ts`, run `npm run db:generate` to write a new migration into `drizzle/`.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the same checks, the tests and the build on every pull request and on every push to `main`.

### Layout

A request goes router → controller → service, and each layer has one job.

```
src/
  index.ts        starts the server
  app.ts          Express app: body parsing, cache default, routes, docs, errors
  routers/v1/     paths, and which of them need the admin token
  controllers/    HTTP only: parse the request, set status and headers
  validation/     zod schemas for bodies, query parameters and ids
  services/       queries and rules; no Express types
  db/             Drizzle schema and connection pool
  middleware/     admin token check, error handler
  openapi.ts      the spec behind /openapi.json and /docs
  migrate.ts      one-off job: apply migrations, then seed
drizzle/          generated SQL migrations
db/               seed data, and the script that creates the test database
docs/adr/         decision records
```

## Terms

- **Catalog**: the full set of products of one retailer. There is one catalog and no seller concept.
- **Product**: one sellable thing with exactly one SKU. A T-shirt in S, M and L is three products; there is no variant grouping.
- **SKU**: the retailer's own unique code for a product. It is set at creation and never changes.
- **Category**: a lowercase slug such as `phones`. Each product has exactly one, and the list is flat.
- **Attributes**: free-form details of a product such as color or size. Stored and returned, not filterable.

## API

Reads are public. Writes need `Authorization: Bearer <ADMIN_TOKEN>`.

| Method and path           | What it does                 | Success                           | Errors                  |
| ------------------------- | ---------------------------- | --------------------------------- | ----------------------- |
| `GET /v1/products`        | List, filter, sort, paginate | `200` `{ items, nextCursor }`     | `400`                   |
| `GET /v1/products/:id`    | Read one product             | `200`, or `304` on a matching tag | `400` `404`             |
| `POST /v1/products`       | Create                       | `201` with `Location` and `ETag`  | `400` `401` `409`       |
| `PATCH /v1/products/:id`  | Partial update               | `200` with `ETag`                 | `400` `401` `404` `412` |
| `DELETE /v1/products/:id` | Delete                       | `204`                             | `400` `401` `404` `412` |

**Product**

```json
{
  "id": "019a2c5e-7b51-7974-b6eb-d973c4090000",
  "sku": "TSHIRT-RED-M",
  "name": "Red T-shirt, M",
  "description": null,
  "category": "shirts",
  "priceCents": 1999,
  "attributes": { "color": "red", "size": "M" },
  "version": 1,
  "createdAt": "2026-11-20T12:00:00.000Z",
  "updatedAt": "2026-11-20T12:00:00.000Z"
}
```

| Field         | Rules                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `sku`         | Required, unique, case-sensitive, `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`. Cannot be changed.                               |
| `name`        | Required, 1–200 characters after trimming.                                                                              |
| `description` | Optional, up to 5,000 characters, nullable.                                                                             |
| `category`    | Required. Trimmed and lowercased, then must match `^[a-z0-9-]+$`, up to 64 characters.                                  |
| `priceCents`  | Required integer from 0 to 2,147,483,647, in US cents. The whole catalog uses one currency (USD).                       |
| `attributes`  | Optional flat object: up to 32 keys of up to 64 characters; values are strings (≤ 500 characters), numbers or booleans. |
|               | At most 4,000 bytes as JSON.                                                                                            |

**List query parameters**

| Parameter                        | Meaning                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `category`                       | Exact category.                                                                 |
| `minPriceCents`, `maxPriceCents` | Price range, both inclusive. `400` if min is greater than max.                  |
| `sort`                           | `newest` (default), `price_asc` or `price_desc`.                                |
| `limit`                          | 1–100, default 20.                                                              |
| `cursor`                         | The `nextCursor` of the previous page. `nextCursor` is `null` on the last page. |

**Rules that apply everywhere**

- Unknown body fields and unknown query parameters return `400`. A typo such as `pricecents` is never silently ignored.
- `PATCH` follows JSON Merge Patch: fields that are absent stay unchanged, `"description": null` clears the description, and a `null` attribute value removes that attribute. `null` on a required field returns `400`, and so does an empty patch or a patch that contains `sku`.
- Request bodies are limited to 16 KB; a larger one returns `413`.
- Every successful write adds 1 to `version` and sets `updatedAt`.
- **Conflicts**: `PATCH` and `DELETE` accept `If-Match: "<version>"`. If the product has changed since, the response is `412`. Without the header, the last write wins.
- A duplicate `sku` on create returns `409`.
- All errors have one shape: `{ "error": { "code", "message", "details"? } }`.
- **Caching**: successful `GET`s send `Cache-Control: public, max-age=30, stale-while-revalidate=30` and an `ETag`, and answer a matching `If-None-Match` with `304`. Writes and errors send `no-store`.

## Data model and indexes

One table, defined in [`src/db/schema.ts`](src/db/schema.ts); the SQL is in the migrations under [`drizzle/`](drizzle).

```
products
  id           uuid         primary key, default uuidv7()
  sku          text         not null, unique
  name         text         not null
  description  text
  category     text         not null, check: slug format
  price_cents  integer      not null, check: >= 0
  attributes   jsonb        not null, default {}, check: at most 4 KB
  version      integer      not null, default 1
  created_at   timestamptz(3)
  updated_at   timestamptz(3)
```

Each combination of filter and sort has an index that returns rows already in order, with `id` as the tie-breaker:

| Index                           | Serves                                               |
| ------------------------------- | ---------------------------------------------------- |
| `(created_at, id, price_cents)` | No category, sorted by newest, with or without range |
| `(price_cents, id)`             | No category, sorted by price, with or without range  |
| `(category, created_at, id)`    | One category, sorted by newest                       |
| `(category, price_cents, id)`   | One category, sorted by price, with or without range |

`price_desc` and `newest` scan these indexes backward, which is why both ORDER BY columns always go in the same direction. Four indexes make writes slower, which is the right trade when reads dominate. At 300k products the table is 52 MB and the indexes are 90 MB.

## Query plans at 300k products

Measured on the seeded database (PostgreSQL 18 in Docker on a laptop), with the SQL that Drizzle generates. Plans are trimmed to the relevant lines.

**Category + price range, sorted by price, from a cursor**: one index range scan.

```
Limit (actual time=0.239..0.985 rows=21 loops=1)
  ->  Index Scan using products_category_price_idx on products
        Index Cond: ((category = 'phones') AND (price_cents >= 10000) AND (price_cents <= 20000)
                     AND (ROW(price_cents, id) > ROW(15049, '01a1f905-…')))
Execution Time: 1.043 ms
```

**Category, most expensive first**: the same index, scanned backward.

```
Limit (actual time=0.062..0.709 rows=21 loops=1)
  ->  Index Scan Backward using products_category_price_idx on products
        Index Cond: (category = 'phones')
Execution Time: 0.716 ms
```

**No filter, newest first, a cursor 150k products deep**: depth doesn't matter.

```
Limit (actual time=0.137..0.681 rows=21 loops=1)
  ->  Index Scan Backward using products_created_idx on products
        Index Cond: (ROW(created_at, id) < ROW('2025-11-20 00:00:00+00', '01a1f905-…'))
Execution Time: 0.693 ms
```

**The same depth with OFFSET**, for comparison. This is why the API has no page numbers.

```
Limit (actual time=176.087..176.095 rows=21 loops=1)
  ->  Index Scan Backward using products_created_idx on products (rows=150021)
Execution Time: 176.104 ms
```

### The one weak query

A price range **without a category, sorted by newest** is the one request no B-tree can serve completely: the filter is a range on one column and the order is on another. So `products_created_idx` carries `price_cents` as a trailing column. Postgres walks the index newest first, checks the price inside the index, and reads only the matching rows from the table.

Medium range (about 1% of products). Before the trailing column this plan read about 2,400 non-matching rows from the table and took 7 ms.

```
Limit (actual time=0.009..0.434 rows=21 loops=1)
  ->  Index Scan Backward using products_created_idx on products
        Index Cond: ((price_cents >= 10000) AND (price_cents <= 11000))
Execution Time: 0.438 ms
```

Narrow range (138 matches): the same plan, but it walks about 15% of the index to find 21 matches.

```
Limit (actual time=0.215..1.293 rows=21 loops=1)
  ->  Index Scan Backward using products_created_idx on products
        Index Cond: ((price_cents >= 10000) AND (price_cents <= 10060))
Execution Time: 1.334 ms
```

What remains: the walk reads about `limit / matching fraction` index entries, so the rarer the price, the longer it gets. The worst case is a walk of the whole index, 13 ms at 300k products (measured by forcing this plan on a range with no matches), and that grows in proportion to the catalog. For very rare ranges Postgres switches to the price index and sorts the few matches instead, which is fast.

## Trade-offs

- **No page numbers and no total count.** Keyset pagination keeps every page fast, but clients can only go to the next page.
- **Reads can be stale.** Usually by 30 seconds or less, 60 at worst. A deleted product can still appear from a cache for that long. Anything that must be exact, such as the price charged at checkout, must not read through a cache.
- **Conflict detection is optional.** A client that doesn't send `If-Match` can overwrite another client's change.
- **Flat categories.** Filtering on `electronics` does not return `phones`.
- **Attributes are not filterable**, and the 32-key limit is checked per request. After merging several patches a product can hold more than 32 keys; the 4 KB database check is the hard limit.
- **A cursor is tied to its sort but not to its filters.** Changing the filters while reusing a cursor returns a valid page of the new filter, starting after the cursor position.
- **Four indexes on one table** slow down writes and take more space than the table.

## Deliberately not built

- **Category tree.** It breaks the `(category, price)` index, because a parent category becomes a set of categories. It needs a materialized path (`ltree`) or a closure table.
- **Keyword search.** The first step is `pg_trgm`; beyond that, a search read model in OpenSearch.
- **Real auth.** One static admin token protects writes. A real system needs an identity provider, roles and an audit log.
- **Inventory and stock.** It belongs to another service. It changes far more often than catalog data and would ruin cache hit rates.
- **Variants, images, multiple currencies, draft/published status, soft delete, total counts.**
- **Redis or an in-process cache** (see [ADR-0003](docs/adr/0003-http-caching-and-staleness.md)).
- **Rate limiting, metrics, tracing.**

## What changes at 10M and 100M products

Extrapolating from the measured sizes: about 1.7 GB of table and 3 GB of indexes at 10M, and about 17 GB and 30 GB at 100M.

**10M products**: the design holds.

- One PostgreSQL primary still fits the data in memory on a mid-sized instance. Keyset pages stay at about a millisecond, because their cost depends on the page size, not the table size.
- Add read replicas behind the CDN, and a connection pooler (PgBouncer) in front of them.
- The weak query needs attention for rare prices: its worst case, a walk of the whole newest-first index, grows from 13 ms to roughly 0.4 s. Either require a category when sorting by newest with a price range, or serve it from a search read model.
- Bulk imports need `COPY` and batching instead of one `POST` per product.
- Schema changes need care: build indexes with `CREATE INDEX CONCURRENTLY`.

**100M products**: the write model stays, the read model changes.

- PostgreSQL remains the source of truth, on a large primary, possibly partitioned by a hash of category to keep index maintenance and vacuum manageable.
- Listing and filtering move to a dedicated search read model (OpenSearch), fed by change data capture from PostgreSQL. At this size clients also expect facets and keyword search, which B-tree indexes don't give.
- Short TTLs stop being enough. Cache entries are purged by event (surrogate keys per product and per category), so TTLs can be long and data still fresh.
- Lookups by id stay on PostgreSQL replicas or move to a key-value cache.
- The API contract doesn't need to change: opaque cursors hide the pagination mechanism, so the backend behind `GET /v1/products` can be swapped.
