import request from "supertest";
import { expect, it } from "vitest";

import { app } from "./app.js";
import { productsRouter } from "./routers/v1/products.js";

it("documents every products route", async () => {
  const res = await request(app).get("/openapi.json");
  expect(res.status).toBe(200);
  const paths = (res.body as { paths: Record<string, Record<string, unknown>> })
    .paths;

  const routes = productsRouter.stack.flatMap(({ route }) => {
    if (!route) return [];
    const path = route.path === "/" ? "" : route.path.replace(":id", "{id}");
    return route.stack.map((layer) => ({
      method: layer.method,
      path: `/v1/products${path}`,
    }));
  });

  // Each write route has a second layer for requireAdmin, so check for at least
  // five routes instead of an exact count.
  expect(routes.length).toBeGreaterThanOrEqual(5);
  for (const { method, path } of routes) {
    expect(paths[path]?.[method], `${method} ${path}`).toBeDefined();
  }
});

it("serves the Swagger UI", async () => {
  const res = await request(app).get("/docs/");
  expect(res.status).toBe(200);
  expect(res.text).toContain("swagger-ui");
});
