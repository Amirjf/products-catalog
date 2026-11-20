# HTTP caching only, with a 60-second staleness bound

Reads vastly outnumber writes, so most reads should never reach the service. Successful `GET` responses send `Cache-Control: public, max-age=30, stale-while-revalidate=30` and an `ETag`, so a CDN or reverse proxy absorbs them and revalidation is a cheap `304`. We accept that a read is usually 30 seconds stale or less, and 60 seconds at worst (30 s fresh, then up to 30 s served stale while the cache revalidates). Writes and error responses send `Cache-Control: no-store`.

We deliberately do not use Redis or an in-process cache. Cached list pages are the hard part: one price change can affect any number of cached filter, sort and cursor combinations, and invalidating them correctly is where those designs break. A short TTL needs no invalidation at all.

## Consequences

- After a price change or a delete, shoppers can still see the old data for up to 60 seconds. Anything that must be exact, such as the price charged at checkout, has to read from the service and not from a cache.
- Single-product responses use `"<version>"` as a strong ETag. List responses get Express's weak body-hash ETag.
- Scale path: CDN, then read replicas, then a separate search read model.
