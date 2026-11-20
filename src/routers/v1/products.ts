import { Router } from "express";

import * as products from "../../controllers/products.js";
import { requireAdmin } from "../../middleware/auth.js";

export const productsRouter = Router();

productsRouter.get("/", products.list);
productsRouter.get("/:id", products.get);
productsRouter.post("/", requireAdmin, products.create);
productsRouter.patch("/:id", requireAdmin, products.update);
productsRouter.delete("/:id", requireAdmin, products.remove);
