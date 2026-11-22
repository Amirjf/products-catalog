import { z } from "zod";

import { isWrite, productRoutes } from "./routers/v1/products.js";
import {
  createSchema,
  listQuerySchema,
  patchSchema,
} from "./validation/products.js";

const input = (schema: z.ZodType) => z.toJSONSchema(schema, { io: "input" });

const listQuery = input(listQuerySchema);

const json = (schema: object) => ({ "application/json": { schema } });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const error = (description: string) => ({
  content: json(ref("Error")),
  description,
});
const etag = {
  ETag: {
    description: 'The product version in quotes, for example "3".',
    schema: { type: "string" },
  },
};
const product = (description: string, headers: object = etag) => ({
  content: json(ref("Product")),
  description,
  headers,
});

const id = {
  in: "path",
  name: "id",
  required: true,
  schema: { format: "uuid", type: "string" },
};
const ifMatch = {
  description:
    'The ETag of the version you read, for example "3". The write fails with 412 if the product has changed since. Omit the header or send * to skip the check.',
  in: "header",
  name: "If-Match",
  schema: { type: "string" },
};
const ifNoneMatch = {
  description:
    "An ETag from an earlier response. If it matches, the response is 304.",
  in: "header",
  name: "If-None-Match",
  schema: { type: "string" },
};

const invalid = error("Validation failed");
const unauthorized = error("Missing or invalid admin token");
const missing = error("Product not found");
const stale = error("Product has changed since the If-Match version");
const admin = [{ adminToken: [] }];

interface Operation {
  description?: string;
  parameters?: object[];
  requestBody?: object;
  responses: Record<number, object>;
  summary: string;
}

const operations = {
  "/": {
    get: {
      description: "Results use keyset pagination.",
      parameters: [
        ...Object.entries(listQuery.properties ?? {}).map(([name, schema]) => ({
          in: "query",
          name,
          schema,
        })),
        ifNoneMatch,
      ],
      responses: {
        200: {
          content: json({
            properties: {
              items: { items: ref("Product"), type: "array" },
              nextCursor: {
                description:
                  "Pass this as cursor to get the next page. It is null on the last page.",
                type: ["string", "null"],
              },
            },
            required: ["items", "nextCursor"],
            type: "object",
          }),
          description: "A page of products",
        },
        304: { description: "Not modified" },
        400: error("Invalid query or cursor"),
      },
      summary: "List products",
    },
    post: {
      requestBody: { content: json(input(createSchema)), required: true },
      responses: {
        201: product("Created", {
          ...etag,
          Location: {
            description: "URL of the new product",
            schema: { type: "string" },
          },
        }),
        400: invalid,
        409: error("A product with this sku already exists"),
      },
      summary: "Create a product",
    },
  },
  "/:id": {
    delete: {
      parameters: [id, ifMatch],
      responses: {
        204: { description: "Deleted" },
        400: invalid,
        404: missing,
        412: stale,
      },
      summary: "Delete a product",
    },
    get: {
      parameters: [id, ifNoneMatch],
      responses: {
        200: product("The product"),
        304: { description: "Not modified" },
        400: invalid,
        404: missing,
      },
      summary: "Get a product",
    },
    patch: {
      description:
        "Follows JSON Merge Patch: absent fields are untouched, a null description clears it, and a null attribute value removes that attribute. The patch must not be empty. sku cannot be changed.",
      parameters: [id, ifMatch],
      requestBody: { content: json(input(patchSchema)), required: true },
      responses: {
        200: product("The updated product"),
        400: invalid,
        404: missing,
        412: stale,
      },
      summary: "Update a product",
    },
  },
} satisfies {
  [Path in keyof typeof productRoutes]: Record<
    keyof (typeof productRoutes)[Path],
    Operation
  >;
};

const paths = Object.fromEntries(
  Object.entries(operations).map(([path, methods]) => [
    `/v1/products${path}`.replace(/\/$/, "").replace(/:(\w+)/g, "{$1}"),
    Object.fromEntries(
      Object.entries(methods).map(
        ([method, operation]: [string, Operation]) => [
          method,
          isWrite(method)
            ? {
                ...operation,
                responses: { ...operation.responses, 401: unauthorized },
                security: admin,
              }
            : operation,
        ],
      ),
    ),
  ]),
);

export const openapi = {
  components: {
    schemas: {
      Error: {
        properties: {
          error: {
            properties: {
              code: { type: "string" },
              details: {
                items: {
                  properties: {
                    message: { type: "string" },
                    path: { type: "string" },
                  },
                  type: "object",
                },
                type: "array",
              },
              message: { type: "string" },
            },
            required: ["code", "message"],
            type: "object",
          },
        },
        required: ["error"],
        type: "object",
      },
      Product: {
        properties: {
          attributes: {
            additionalProperties: { type: ["string", "number", "boolean"] },
            type: "object",
          },
          category: { type: "string" },
          createdAt: { format: "date-time", type: "string" },
          description: { type: ["string", "null"] },
          id: { format: "uuid", type: "string" },
          name: { type: "string" },
          priceCents: { type: "integer" },
          sku: { type: "string" },
          updatedAt: { format: "date-time", type: "string" },
          version: { type: "integer" },
        },
        required: [
          "attributes",
          "category",
          "createdAt",
          "description",
          "id",
          "name",
          "priceCents",
          "sku",
          "updatedAt",
          "version",
        ],
        type: "object",
      },
    },
    securitySchemes: { adminToken: { scheme: "bearer", type: "http" } },
  },
  info: { title: "Products catalog", version: "1.0.0" },
  openapi: "3.1.0",
  paths,
};
