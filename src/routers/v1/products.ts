import { type RequestHandler, Router } from "express";

import * as products from "../../controllers/products.js";
import { requireAdmin } from "../../middleware/auth.js";

type Method = "delete" | "get" | "patch" | "post";

export const productRoutes = {
  "/": { get: products.list, post: products.create },
  "/:id": {
    delete: products.remove,
    get: products.get,
    patch: products.update,
  },
} satisfies Record<string, Partial<Record<Method, RequestHandler>>>;

export const isWrite = (method: string) => method !== "get";

export const productsRouter = Router();

for (const [path, methods] of Object.entries(productRoutes)) {
  for (const [method, handler] of Object.entries(methods)) {
    const guards = isWrite(method) ? [requireAdmin] : [];
    productsRouter[method as Method](path, ...guards, handler);
  }
}
