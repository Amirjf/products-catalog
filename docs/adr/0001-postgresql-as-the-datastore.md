# PostgreSQL as the datastore

The catalog holds a few hundred thousand products, reads vastly outnumber writes, and clients filter by category and price range with pagination. We store products in one PostgreSQL table. 300k products are about 52 MB of table and 88 MB of indexes, so the whole dataset sits in memory on a small instance; composite B-tree indexes answer "category + price range + sort" with keyset pagination in about a millisecond; read replicas scale reads; and the database itself enforces unique SKUs and non-negative prices.

## Considered options

- **MongoDB**: no advantage for this data shape, and weaker constraints. The schema flexibility people usually choose it for is covered by the `attributes` JSONB column, without giving up constraints on the other columns.
- **Elasticsearch / OpenSearch**: a second system to keep in sync with the source of truth. It only pays off with full-text search or facets, which are out of scope. It is the planned read model if search is added.
- **DynamoDB**: every filter and sort combination needs its own GSI, and ad-hoc range filters are awkward.

## Consequences

- `id` defaults to `uuidv7()`, which needs PostgreSQL 18. UUIDv7 values are time-ordered, so new rows go to the end of the primary-key index.
- `attributes` is stored and returned but not filterable. A GIN index is the next step if filtering on attributes is needed.
