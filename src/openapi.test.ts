import request from "supertest";
import { expect, it } from "vitest";

import { app } from "./app.js";

it("serves the Swagger UI", async () => {
  const res = await request(app).get("/docs/");
  expect(res.status).toBe(200);
  expect(res.text).toContain("swagger-ui");
});
