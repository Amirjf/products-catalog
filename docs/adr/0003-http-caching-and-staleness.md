# HTTP caching only, with a 60-second staleness bound

Most requests are reads, so most of them should never reach the service. Successful `GET` responses send `Cache-Control: public, max-age=30, stale-while-revalidate=30` and an `ETag`. A CDN or reverse proxy can then serve them from its cache, and revalidation is a cheap `304`. We accept that a read is usually 30 seconds stale or less, and 60 seconds at worst. The worst case is 30 seconds fresh, then up to 30 more seconds served stale while the cache revalidates. Writes and error responses send `Cache-Control: no-store`.

We do not use Redis or an in-process cache. Cached list pages are the problem. One price change can affect any number of cached combinations of filter, sort and cursor, and the service would have to invalidate every one of them. A short TTL needs no invalidation.

## Consequences

- After a price change or a delete, shoppers can still see the old data for up to 60 seconds. Anything that must be exact, such as the price charged at checkout, has to read from the service and not from a cache.
- Single-product responses use `"<version>"` as a strong ETag. List responses get Express's weak body-hash ETag.
- The scale path is a CDN, then read replicas, then a separate search read model.
