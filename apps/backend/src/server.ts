import { cleanupExpiredAuthData } from "./auth/repo.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { buildApp } from "./app.js";

const config = loadConfig();
const db = openDb(config.dbPath);
const app = buildApp(db, config);

// Expired sessions/OTP rows are otherwise only swept at boot — without a
// periodic pass they'd accumulate for the whole process lifetime. A failed
// sweep (e.g. a transient DB error) is logged and left for the next tick —
// an incidental cleanup must never take the process down.
setInterval(
  () => {
    try {
      cleanupExpiredAuthData(db, Date.now());
    } catch (err) {
      app.log.error(err, "expired auth data cleanup failed");
    }
  },
  6 * 60 * 60 * 1000,
).unref();

app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
