import { Queue } from "bullmq";
import { queueName } from './workers/composer/types';
import payload from './workers/composer/payload';

const connection = {
  host: "redis.oneflow.vn",
  port: 6379,
};

const myQueue = new Queue(queueName, { connection });

async function addJobs() {
  console.log("Adding jobs...");
  await myQueue.add("my-job", { payload });
  console.log("Done");
  await myQueue.close();
}

addJobs();
