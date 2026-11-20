# Drizzle ORM for schema, migrations and queries

The first plan was plain SQL through `pg` with a single schema file and no migration tool. We switched to Drizzle before any query code was written, because the schema needs a clean way to change over time: the table is defined once in `src/db/schema.ts`, `drizzle-kit generate` writes versioned SQL migrations into `drizzle/`, and the row types used by the API come from the same definition.

Drizzle was chosen over a heavier ORM because its queries map one-to-one to SQL. This service depends on Postgres using specific indexes, so the generated SQL has to be predictable.

## Consequences

- Two places still use raw SQL fragments (`sql\`...\``): the keyset row comparison `(col, id) > (a, b)` and the JSONB merge for attributes. Drizzle has no builder for either.
- Migrations run as a one-off job (`node dist/migrate.js`) before the API starts, never inside the API process, so several API instances don't race to migrate.
- Migrations in `drizzle/` are generated files. Change `src/db/schema.ts` and run `npm run db:generate`; don't edit them by hand.
- The index choices are verified with `EXPLAIN ANALYZE` against the SQL Drizzle generates (see the README), not assumed from the query builder code.
