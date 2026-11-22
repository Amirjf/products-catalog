import type { Request, RequestHandler, Response } from "express";

import type { Product } from "../db/schema.js";

import * as productsService from "../services/products.js";
import {
  createSchema,
  idSchema,
  listQuerySchema,
  patchSchema,
} from "../validation/products.js";

const READ_CACHE = "public, max-age=30, stale-while-revalidate=30";

function expectedVersion(req: Request): null | number {
  const header = req.get("If-Match");
  if (header === undefined || header === "*") return null;
  const version = /^"(\d{1,9})"$/.exec(header)?.[1];
  return version === undefined ? -1 : Number(version);
}

function sendProduct(res: Response, product: Product, status = 200) {
  res
    .status(status)
    .set("ETag", `"${String(product.version)}"`)
    .json(product);
}

export const list: RequestHandler = async (req, res) => {
  const page = await productsService.list(listQuerySchema.parse(req.query));
  res.set("Cache-Control", READ_CACHE).json(page);
};

export const get: RequestHandler = async (req, res) => {
  const product = await productsService.get(idSchema.parse(req.params.id));
  res.set("Cache-Control", READ_CACHE);
  sendProduct(res, product);
};

export const create: RequestHandler = async (req, res) => {
  const product = await productsService.create(createSchema.parse(req.body));
  res.location(`${req.baseUrl}/${product.id}`);
  sendProduct(res, product, 201);
};

export const update: RequestHandler = async (req, res) => {
  const product = await productsService.update(
    idSchema.parse(req.params.id),
    patchSchema.parse(req.body),
    expectedVersion(req),
  );
  sendProduct(res, product);
};

export const remove: RequestHandler = async (req, res) => {
  await productsService.remove(
    idSchema.parse(req.params.id),
    expectedVersion(req),
  );
  res.status(204).end();
};
