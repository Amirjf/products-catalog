import { z } from "zod";

const env = z
  .object({
    ADMIN_TOKEN: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(3000),
  })
  .parse(process.env);

export const config = {
  adminToken: env.ADMIN_TOKEN,
  databaseUrl: env.DATABASE_URL,
  port: env.PORT,
};
