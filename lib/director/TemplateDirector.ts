import EventEmitter from 'events';
import { inject, injectable } from 'tsyringe';
import AbstractLogger from '../platform/logging/AbstractLogger';
import AbstractFFmpeg from '../platform/ffmpeg/AbstractFFmpeg';
import AbstractFilesystem from '../platform/filesystem/AbstractFilesystem';
import EventManager from '../platform/EventManager';
import VideoEditor from '../editor/VideoEditor';
import MusicComposer from '../editor/MusicComposer';
import { FFMpegInfos, ProjectConfig, Section, TemplateDescriptor } from 'lib/core/types';
import Project from '../core/models/Project';
import Template from '../core/models/Template';
import TemplateConcreteBuilder from './TemplateConcreteBuilder';
import CaptionComposer from '../editor/CaptionComposer';
import AudioComposer from '../editor/AudioComposer';
import AssetManager from '../editor/managers/AssetManager';

@injectable()
class TemplateDirector {
  private readonly emitter: EventEmitter;

  private builder: TemplateConcreteBuilder;
  private stopBuild: boolean = false;

  constructor(
    private readonly eventManager: EventManager,
    private readonly concreteBuilder: TemplateConcreteBuilder,
    private readonly musicComposer: MusicComposer,
    private readonly captionComposer: CaptionComposer,
    private readonly audioComposer: AudioComposer,
    private readonly videoEditor: VideoEditor,
    private readonly assetManager: AssetManager,

    private project: Project,
    private template: Template,

    @inject('logger') private readonly logger: AbstractLogger,
    @inject('ffmpegAdapter') private readonly ffmpegAdapter: AbstractFFmpeg,
    @inject('filesystemAdapter')
    private readonly filesystemAdapter: AbstractFilesystem
  ) {
    this.emitter = this.eventManager.connect();
    this.emitter.on('task-cancelled', () => (this.stopBuild = true));
    this.videoEditor.emitter = this.emitter;

    this.logger.info('Director class created');
  }

  config = (projectConfig: ProjectConfig, templateDescriptor: TemplateDescriptor): TemplateDirector => {
    this.project.config = projectConfig;
    this.template.descriptor = templateDescriptor;

    this.filesystemAdapter.setBuildDir(this.project.config.buildDir || 'build');
    this.filesystemAdapter.setTempDir(`${this.filesystemAdapter.getBuildDir()}/temp`);

    this.filesystemAdapter.setAssetsDir(this.project.config.assetsDir || 'assets');

    this.project.applyDefault();

    return this;
  };

  construct = async (): Promise<Project> => {
    try {
      await this.init();

      await this.compileVideoSegments();

      if (this.template.descriptor.global.audioEnabled) {
        await this.compileAudioSegments();
      }

      await this.videoEditor.finalize();
    } catch (err) {
      this.fireError(err);

      return null;
    }

    return this.project;
  };

  init = async (): Promise<void> => {
    await this.assetManager.setUpPaths();

    this.project.buildInfos.fileConcatPath = `${this.filesystemAdapter.getBuildDir()}/segments.list`;

    await this.audioComposer.loadAudios();

    await this.musicComposer.loadMusic();

    await this.captionComposer.loadSubtitles();

    await this.filesystemAdapter.write(this.project.buildInfos.fileConcatPath);

    this.logger.info(`[Init] Segment file saved to ${this.project.buildInfos.fileConcatPath}`);
  };

  compileVideoSegments = async (): Promise<void> => {
    this.logger.info('[TemplateDirector] Compiling video segments');

    const sections = this.template.descriptor.sections;
    const videoSegments = this.filterVideoSections(sections);

    await this.calculateTotalLength(videoSegments);

    this.logger.info(`[TemplateDirection] Length: ${this.project.buildInfos.totalLength}`);
    this.project.buildInfos.totalSegments = videoSegments.length;

    await this.processVideoSegments(videoSegments);

    if (!this.stopBuild) {
      await this.finalizeCompilation(videoSegments);
    }
    this.logger.info('[TemplateDirector] Compilation done');
  };

  compileAudioSegments = async (): Promise<void> => {
    await this.audioComposer.composeAudio();
  };

  filterVideoSections = (sections: Section[]): Section[] => {
    return sections.filter((section) => section.visibility.includes('video_segment'));
  };

  calculateTotalLength = async (segments: Section[]): Promise<void> => {
    for (const segment of segments) {
      let duration = segment.options.duration;

      if (segment.type === 'project_video') {
        duration = await this.getVideoSectionDuration(segment);
      }

      this.project.buildInfos.totalLength += duration;
      this.project.buildInfos.durations[segment.name] = duration;
    }
  };

  getVideoSectionDuration = async (segment: Section): Promise<number> => {
    const sectionInfos = await this.fetchSectionInfos(segment);

    if (!sectionInfos.duration) {
      throw new Error('No section info found');
    }

    return sectionInfos.duration;
  };

  processVideoSegments = async (segments: Section[]): Promise<void> => {
    const promises = [];

    for (const segment of segments) {
      if (this.stopBuild) {
        break;
      }

      const promise = await this.processSingleVideoSegment(segment);
      promises.push(promise);
    }

    await Promise.all(promises);
  };

  processSingleVideoSegment = async (segment: Section): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      try {
        this.addToQueue(segment).then(() => {
          this.updateProgress(segment);
          this.logger.info(`[${segment.name}][Editing] finalized (${Math.round(this.project.progress * 100)}%)`);
          resolve(true);
        });
      } catch (err) {
        this.fireError(err);

        reject(false);
      }
    });
  };

  updateProgress = (segment: Section): void => {
    const { totalLength } = this.project.buildInfos;
    const segmentLength = this.project.buildInfos.durations[segment.name];

    this.project.progress = Math.min(1, this.project.progress + segmentLength / totalLength);
    this.project.buildInfos.currentProgress = this.project.progress;

    this.emitter.emit('compilation-progress', this.project.progress);
  };

  finalizeCompilation = async (segments: Section[]): Promise<void> => {
    await this.videoEditor.concat();

    // Append music if option is enabled
    if (this.template.descriptor.global.musicEnabled) {
      await this.musicComposer.loopMusic();

      await this.musicComposer.appendMusic(segments, this.project.finalVideo);
    }
  };

  fetchSectionInfos = async (section: { name: string }): Promise<FFMpegInfos> => {
    this.logger.info(`[${section.name}][Editing] fetching infos`);
    const source = `${this.filesystemAdapter.getAssetsDir('videos')}/${section.name}.mp4`;
    const info = await this.ffmpegAdapter.getInfos(source);

    if (null === info.duration) {
      throw new Error(`Duration not found for ${section.name}`);
    }

    return info;
  };

  addToQueue = async (section: Section): Promise<void> => {
    this.logger.info(`[${section.name}][Editing] started`);

    this.builder = this.concreteBuilder;

    // First, build configuration and retrieve updated assets
    await this.builder.buildPart(section);

    // Then, prepare part
    await this.builder.preparePart();

    // Then, compile part with FFmpeg
    await this.builder.renderPart();

    // Prepare music timeline for volume variations
    this.musicComposer.prepareMusicTrack(section);

    // Append file for concat
    await this.append(section);

    this.logger.info(`[${section.name}][Editing] finalized`);
  };

  append = async (section: Section): Promise<void> => {
    const file = `${this.filesystemAdapter.getBuildDir()}/${section.name}_output.mp4`;
    this.project.buildInfos.videoInputs.push(file);

    await this.filesystemAdapter.append(this.project.buildInfos.fileConcatPath, `file ${file}\n`);

    this.logger.info(`[${section.name}][Append] '${file}'`);
  };

  fireError = (error: unknown): void => {
    globalThis.console.error(error);
    this.logger.error(`[TemplateDirector][Error] ${JSON.stringify(error)}`);

    // Stop the Director build
    this.stopBuild = true;

    // Delete concatenation file
    this.filesystemAdapter.unlink(this.project.buildInfos.fileConcatPath);

    // Fire event
    this.emitter.emit('task-stopped', error);
  };
}

export default TemplateDirector;
