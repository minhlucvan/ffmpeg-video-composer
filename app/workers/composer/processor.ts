import { Job } from "bullmq";
import { compile } from '../../../lib/index';
import { createProjectConfig, createTemplateDescriptor } from "./composer";
import { uploadFile } from "./ftp";
import * as fs from 'fs';

function processCompose(payload) {
  const templateDescriptor = createTemplateDescriptor(payload);
  const projectConfig = createProjectConfig();

  return compile(projectConfig, templateDescriptor);
}

/**
 * Dummy worker
 *
 * This worker is responsible for doing something useful.
 *
 */
export default async function (job: Job) {
  try {
    await job.log("Start processing job");
    const result = await processCompose(job.data.payload);

    job.log("Processing completed");

    const outputFile = result.finalVideo;
    const projectId = job.data.payload.id;
    const remotePath = `/projects/${projectId}/output.mp4`;

    // Upload the file to FTP
    await job.log("Uploading file to FTP");
    await uploadFile(outputFile, remotePath, {
      host: process.env.FTP_HOST,
      port: parseInt(process.env.FTP_PORT, 10),
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
    });
    await job.log("Upload completed");

    // cleanup
    await job.log("Cleaning up");
    fs.unlinkSync(outputFile);

    return { success: true, output: remotePath };
  } catch (error) {
    console.error('Error in worker', error);
    return { success: false };
  }
}
