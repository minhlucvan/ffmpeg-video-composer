import 'reflect-metadata';
import { container } from 'tsyringe';
import PlatformBridge from './platform/PlatformBridge';
import TemplateDirector from './director/TemplateDirector';
import { ProjectConfig, TemplateDescriptor } from './core/types';
import Project from './core/models/Project';

const bridge = new PlatformBridge();
const fileSystem = bridge.create('filesystem');
container.registerInstance('logger', bridge.create('logger'));
container.registerInstance('ffmpegAdapter', bridge.create('ffmpeg'));
container.registerInstance('filesystemAdapter', fileSystem);
container.registerInstance('musicAdapter', bridge.create('music'));

export async function loadConfig(configPath: string): Promise<TemplateDescriptor> {
  return JSON.parse(await fileSystem.read(configPath));
}

export async function compile(projectConfig: ProjectConfig, templateDescriptor: TemplateDescriptor): Promise<Project> {
  const director = container.resolve(TemplateDirector).config(projectConfig, templateDescriptor);

  // Start compilation
  return await director.construct();
}
