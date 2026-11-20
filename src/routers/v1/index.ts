import { Router } from "express";

import { productsRouter } from "./products.js";

export const v1Router = Router();

v1Router.use("/products", productsRouter);
