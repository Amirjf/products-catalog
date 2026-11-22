import express from "express";
import swaggerUi from "swagger-ui-express";

import { errorHandler, notFound } from "./middleware/error-handler.js";
import { openapi } from "./openapi.js";
import { v1Router } from "./routers/v1/index.js";

export const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use("/v1", v1Router);
app.get("/openapi.json", (_req, res) => res.json(openapi));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));
app.use(notFound);
app.use(errorHandler);
