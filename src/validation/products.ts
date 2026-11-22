import { z } from "zod";

import { SORTS } from "../services/products.js";

const MAX_ATTRIBUTES = 32;
const MAX_ATTRIBUTES_BYTES = 4000;

const sku = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/)
  .meta({ description: "Unique and case-sensitive. Cannot be changed." });
const name = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .meta({ description: "Trimmed." });
const description = z.string().max(5000).nullable();
const category = z
  .string()
  .trim()
  .toLowerCase()
  .max(64)
  .regex(/^[a-z0-9-]+$/)
  .meta({ description: "Trimmed and lowercased before these checks." });
const priceCents = z
  .int()
  .min(0)
  .max(2_147_483_647)
  .meta({ description: "US cents. The whole catalog uses US dollars." });
const attributeValue = z.union([z.string().max(500), z.number(), z.boolean()]);

// The database CHECK allows 4,096 bytes of jsonb text. jsonb text puts a space
// after each colon and comma, so it is longer than JSON.stringify output, and the
// API limit is 4,000 bytes.
const attributesOf = <T extends z.ZodType>(value: T) =>
  z
    .record(z.string().min(1).max(64), value)
    .refine(
      (a) => Object.keys(a).length <= MAX_ATTRIBUTES,
      `At most ${String(MAX_ATTRIBUTES)} attributes`,
    )
    .refine(
      (a) => Buffer.byteLength(JSON.stringify(a)) <= MAX_ATTRIBUTES_BYTES,
      "Attributes are too large",
    )
    .meta({
      description: `At most ${MAX_ATTRIBUTES_BYTES.toLocaleString("en-US")} bytes as JSON.`,
      maxProperties: MAX_ATTRIBUTES,
    });

export const idSchema = z.uuid();

export const createSchema = z.strictObject({
  attributes: attributesOf(attributeValue).default({}),
  category,
  description: description.default(null),
  name,
  priceCents,
  sku,
});

// JSON Merge Patch: absent fields are untouched, null clears description, and
// a null attribute value removes that attribute. sku is absent on purpose, so
// strictObject rejects it.
export const patchSchema = z
  .strictObject({
    attributes: attributesOf(attributeValue.nullable()),
    category,
    description,
    name,
    priceCents,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Patch is empty");

const priceFilter = z.coerce.number().int().min(0).max(2_147_483_647).meta({
  description: "Inclusive. minPriceCents greater than maxPriceCents is a 400.",
});

export const listQuerySchema = z
  .strictObject({
    category: category
      .optional()
      .meta({ description: "Exact match, after trimming and lowercasing." }),
    cursor: z.string().min(1).optional().meta({
      description:
        "The nextCursor of the previous page, which is null on the last page. A cursor only works with the sort it came from.",
    }),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    maxPriceCents: priceFilter.optional(),
    minPriceCents: priceFilter.optional(),
    sort: z.enum(SORTS).default("newest"),
  })
  .refine(
    (q) =>
      q.minPriceCents === undefined ||
      q.maxPriceCents === undefined ||
      q.minPriceCents <= q.maxPriceCents,
    "minPriceCents must not be greater than maxPriceCents",
  );
