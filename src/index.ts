import { app } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db/client.js";

const server = app.listen(config.port, () => {
  console.log(`Listening on port ${String(config.port)}`);
});

process.on("SIGTERM", () => {
  server.close(() => void pool.end());
});
