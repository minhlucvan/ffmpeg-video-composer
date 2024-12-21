import initComposer from "./workers/composer";
import 'dotenv/config'

const connection = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT, 10),
};

const composerQueue = initComposer(connection);

process.on("SIGTERM", async () => {
  console.info("SIGTERM signal received: closing queues");

  await composerQueue.close();

  console.info("All closed");
});
