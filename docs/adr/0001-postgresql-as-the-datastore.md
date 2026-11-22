# PostgreSQL as the datastore

The catalog holds a few hundred thousand products, most requests are reads, and clients filter by category and price range with pagination. We store products in one PostgreSQL table. At 300,000 products the table is about 52 MB and the indexes about 90 MB, so the whole dataset fits in memory on a small instance. Composite B-tree indexes answer a query for a category, a price range and a sort with keyset pagination in about a millisecond. Read replicas scale reads. The database enforces unique SKUs and non-negative prices.

## Considered options

- **MongoDB.** It has no advantage for this data shape, and its constraints are weaker. The `attributes` JSONB column covers the schema flexibility people usually choose it for, without giving up constraints on the other columns.
- **Elasticsearch or OpenSearch.** It is a second system to keep in sync with the source of truth. It is worth that cost only with full-text search or facets, which are out of scope. It is the planned read model if search is added.
- **DynamoDB.** Every filter and sort combination needs its own global secondary index, and ad-hoc range filters are awkward.

## Consequences

- `id` defaults to `uuidv7()`, which needs PostgreSQL 18. UUIDv7 values are time-ordered, so new rows go to the end of the primary-key index.
- `attributes` is stored and returned but not filterable. A GIN index is the next step if filtering on attributes is needed.
