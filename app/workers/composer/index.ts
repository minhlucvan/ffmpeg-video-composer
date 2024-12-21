import { Worker } from "bullmq";
import { queueName } from "./types"
import processor from "./processor";

export default function init(connection) {
  const worker = new Worker(queueName, processor, { connection });

  worker.on("ready", () => {
    console.info("Composer queue is ready");
  });

  worker.on("completed", (job) => {
    console.info(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job.id} failed with error`, err);
  });

  worker.on("error", (err) => {
    console.error("Queue error", err);
  });

  return worker;
}
