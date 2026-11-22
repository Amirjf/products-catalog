import type { ErrorRequestHandler, RequestHandler } from "express";

import { DatabaseError } from "pg";
import { ZodError } from "zod";

import { HttpError } from "../errors.js";

interface ErrorBody {
  code: string;
  details?: { message: string; path: string }[];
  message: string;
  status: number;
}

export const notFound: RequestHandler = () => {
  throw new HttpError(404, "not_found", "Route not found");
};

function describe(err: unknown): ErrorBody {
  if (err instanceof HttpError) {
    return { code: err.code, message: err.message, status: err.status };
  }
  if (err instanceof ZodError) {
    return {
      code: "validation_error",
      details: err.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join("."),
      })),
      message: "Request validation failed",
      status: 400,
    };
  }
  if (err instanceof Error) {
    // Drizzle wraps driver errors, so the PostgreSQL error is in err.cause.
    const pgError = err.cause instanceof DatabaseError ? err.cause : err;
    if (pgError instanceof DatabaseError && pgError.code === "23505") {
      return {
        code: "conflict",
        message: "A product with this sku already exists",
        status: 409,
      };
    }
    if (pgError instanceof DatabaseError && pgError.code === "23514") {
      return {
        code: "validation_error",
        message: `Violates constraint ${pgError.constraint ?? ""}`,
        status: 400,
      };
    }
    // express.json throws these for malformed JSON and for a body that is too large.
    if ("status" in err && typeof err.status === "number" && err.status < 500) {
      return { code: "bad_request", message: err.message, status: err.status };
    }
  }
  return {
    code: "internal_error",
    message: "Internal server error",
    status: 500,
  };
}

// Express recognises an error handler by its four parameters.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const { status, ...error } = describe(err);
  if (status >= 500) console.error(err);
  res.status(status).set("Cache-Control", "no-store").json({ error });
};
