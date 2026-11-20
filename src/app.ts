import express from "express";

import { errorHandler, notFound } from "./middleware/error-handler.js";
import { v1Router } from "./routers/v1/index.js";

export const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

// Only successful reads opt in to caching; writes and errors stay no-store.
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use("/v1", v1Router);
app.use(notFound);
app.use(errorHandler);
