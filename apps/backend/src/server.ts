import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { buildApp } from "./app.js";

const config = loadConfig();
const db = openDb(config.dbPath);
const app = buildApp(db, config);

app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
