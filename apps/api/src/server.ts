import { app } from "./app";
import { config } from "./config";
import { prisma } from "./db";

const server = app.listen(config.PORT, () => {
  console.log(`CIT-LMS API listening on port ${config.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
