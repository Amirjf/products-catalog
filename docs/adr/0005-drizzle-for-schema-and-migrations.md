# Drizzle ORM for schema, migrations and queries

The first plan was plain SQL through `pg` with a single schema file and no migration tool. We switched to Drizzle before writing any query code, because the schema needs versioned migrations. The table is defined once in `src/db/schema.ts`. `drizzle-kit generate` writes versioned SQL migrations from it into `drizzle/`, and the row types the API uses come from the same definition.

We chose Drizzle over a heavier ORM because its queries map one-to-one to SQL. This service depends on PostgreSQL using specific indexes, so the generated SQL has to be predictable.

## Consequences

- Two places still use raw SQL through Drizzle's `sql` template tag: the keyset row comparison `(col, id) > (a, b)` and the JSONB merge for attributes. Drizzle has no builder for either.
- Migrations run as a one-off job, `node dist/migrate.js`, before the API starts. They never run inside the API process, so several API instances cannot race to migrate.
- Migrations in `drizzle/` are generated files. Change `src/db/schema.ts` and run `npm run db:generate`. Don't edit them by hand.
- We verified the index choices with `EXPLAIN ANALYZE` against the SQL that Drizzle generates, not by reading the query builder code. The README shows the plans.
