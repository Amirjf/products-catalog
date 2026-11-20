import type { Request, Response } from "express";

import { Router } from "express";

import type { Product } from "../../db/schema.js";

import { requireAdmin } from "../../middleware/auth.js";
import * as productsService from "../../services/products.js";
import {
  createSchema,
  idSchema,
  listQuerySchema,
  patchSchema,
} from "./products.schemas.js";

// Usually 30s stale or less, 60s at worst (see docs/adr/0003).
const READ_CACHE = "public, max-age=30, stale-while-revalidate=30";

// null: no precondition. -1: an unparseable tag, which can never match.
function expectedVersion(req: Request): null | number {
  const header = req.get("If-Match");
  if (header === undefined || header === "*") return null;
  const version = /^"(\d{1,9})"$/.exec(header)?.[1];
  return version === undefined ? -1 : Number(version);
}

function sendProduct(res: Response, product: Product, status = 200) {
  // Set before res.json: Express keeps an existing ETag and answers a matching
  // If-None-Match with 304.
  res
    .status(status)
    .set("ETag", `"${String(product.version)}"`)
    .json(product);
}

export const productsRouter = Router();

productsRouter.get("/", async (req, res) => {
  // req.query is read-only in Express 5, so parse into a local.
  const page = await productsService.list(listQuerySchema.parse(req.query));
  res.set("Cache-Control", READ_CACHE).json(page);
});

productsRouter.get("/:id", async (req, res) => {
  const product = await productsService.get(idSchema.parse(req.params.id));
  res.set("Cache-Control", READ_CACHE);
  sendProduct(res, product);
});

productsRouter.post("/", requireAdmin, async (req, res) => {
  const product = await productsService.create(createSchema.parse(req.body));
  // baseUrl is wherever this router is mounted, e.g. /v1/products.
  res.location(`${req.baseUrl}/${product.id}`);
  sendProduct(res, product, 201);
});

productsRouter.patch("/:id", requireAdmin, async (req, res) => {
  const product = await productsService.update(
    idSchema.parse(req.params.id),
    patchSchema.parse(req.body),
    expectedVersion(req),
  );
  sendProduct(res, product);
});

productsRouter.delete("/:id", requireAdmin, async (req, res) => {
  await productsService.remove(
    idSchema.parse(req.params.id),
    expectedVersion(req),
  );
  res.status(204).end();
});
