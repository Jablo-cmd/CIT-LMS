import { app } from "./app.js";
import { config, isPreviewSafeMode } from "./config.js";
import { prisma } from "./db.js";
import { verifyPrivateBucket } from "./services/document-storage.js";

const server = await (async () => {
  if (!isPreviewSafeMode) await verifyPrivateBucket();
  return app.listen(config.PORT, () => {
    console.log(isPreviewSafeMode
      ? `CIT-LMS API running in restricted Preview mode on port ${config.PORT}`
      : `CIT-LMS API listening on port ${config.PORT}`);
  });
})();

async function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down`);
  server.close(async () => {
    if (!isPreviewSafeMode) await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
