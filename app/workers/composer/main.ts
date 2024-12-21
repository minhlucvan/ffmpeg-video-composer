import payload from './payload';
import { compile } from '../../../lib/index';
import { createProjectConfig, createTemplateDescriptor } from "./composer";

function main() {
  const templateDescriptor = createTemplateDescriptor(payload);
  const projectConfig = createProjectConfig();

  return compile(projectConfig, templateDescriptor);
}

main();
