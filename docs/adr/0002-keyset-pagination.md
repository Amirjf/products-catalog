# Keyset pagination with an opaque cursor

List endpoints paginate with a keyset cursor instead of `offset` and page numbers. The cursor is the base64url encoding of `{sort, lastValue, lastId}`. The service fetches the next page with a row comparison such as `(price_cents, id) > (lastValue, lastId)`, so every page is one short index range scan at any depth. At 300,000 rows, a keyset page takes under 1 ms at any depth, while `OFFSET 150000` takes 176 ms because PostgreSQL reads and discards 150,000 rows. Offset pages also shift when products are inserted or deleted while a client is paging.

## Consequences

- Clients cannot jump to page N, and there is no total count. `COUNT(*)` over a filtered set on every list request would cost more than the page itself.
- Every sort needs a unique tie-breaker, which is `id`. Both ORDER BY columns must go in the same direction so that one index serves the sort. `price_desc` scans the price indexes backward.
- `created_at` has millisecond precision, `timestamptz(3)`, so that the JavaScript `Date` in a cursor equals the stored value. With microseconds, a page boundary could skip or repeat rows.
- A cursor is only valid for the sort it was issued for. Using it with another sort returns 400.
