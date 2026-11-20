# Keyset pagination with an opaque cursor

List endpoints paginate with a keyset cursor instead of `offset`/page numbers. The cursor is the base64url encoding of `{sort, lastValue, lastId}`, and the next page is fetched with a row comparison such as `(price_cents, id) > (lastValue, lastId)`, so every page is one short index range scan no matter how deep it is. Measured at 300k rows: a keyset page takes under 1 ms at any depth, while `OFFSET 150000` takes 176 ms because Postgres reads and throws away 150k rows. Offset pages also shift when products are inserted or deleted while a client is paging.

## Consequences

- Clients cannot jump to page N, and there is no total count. `COUNT(*)` over a filtered set on every list request would cost more than the page itself.
- Every sort needs a unique tie-breaker (`id`), and both ORDER BY columns must go in the same direction so one index serves the sort. `price_desc` scans the price indexes backward.
- `created_at` is stored with millisecond precision (`timestamptz(3)`) so that the JS `Date` in a cursor equals the stored value exactly. With microseconds, a page boundary could skip or repeat rows.
- A cursor is only valid for the sort it was issued for; using it with another sort returns 400.
