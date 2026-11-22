import type { RequestHandler } from "express";

import { createHash, timingSafeEqual } from "node:crypto";

import { config } from "../config.js";
import { HttpError } from "../errors.js";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

export const requireAdmin: RequestHandler = (req, _res, next) => {
  const sent = /^Bearer (.+)$/.exec(req.get("Authorization") ?? "")?.[1] ?? "";
  if (!timingSafeEqual(sha256(sent), sha256(config.adminToken))) {
    throw new HttpError(401, "unauthorized", "Missing or invalid admin token");
  }
  next();
};
