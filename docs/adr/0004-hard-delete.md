# Products are hard-deleted

`DELETE /v1/products/:id` removes the row, and later reads return 404. We chose this over soft delete (a `deleted_at` column or an archived status) because soft delete makes every read query and every index exclude deleted rows, and the read path is the one this service is built around.

This relies on a rule outside this service: an order must copy the product name and price at purchase time. The catalog is not the record of what was sold.

## Consequences

- A deleted product cannot be restored through the API, and there is no history of it here.
- Cached responses can still show a deleted product for up to 60 seconds (see ADR-0003).
- The SKU of a deleted product can be used again by a new product.
