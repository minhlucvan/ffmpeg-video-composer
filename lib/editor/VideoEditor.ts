import EventEmitter from 'events';
import { inject, injectable } from 'tsyringe';
import AbstractLogger from '../platform/logging/AbstractLogger';
import AbstractFFmpeg from '../platform/ffmpeg/AbstractFFmpeg';
import AbstractFilesystem from '../platform/filesystem/AbstractFilesystem';
import Template from '../core/models/Template';
import Project from '../core/models/Project';
import { Section } from 'lib/core/types';
import MusicComposer from './MusicComposer';
import CaptionComposer from './CaptionComposer';
import AudioComposer from './AudioComposer';
import OverlayComposer from './OverlayComposer';

@injectable()
class VideoEditor {
  public emitter: EventEmitter;

  constructor(
    private readonly project: Project,
    private readonly template: Template,
    private readonly musicComposer: MusicComposer,
    private readonly audioComposer: AudioComposer,
    private readonly captionComposer: CaptionComposer,
    private readonly overlayComposer: OverlayComposer,

    @inject('logger') private readonly logger: AbstractLogger,
    @inject('ffmpegAdapter') private readonly ffmpegAdapter: AbstractFFmpeg,
    @inject('filesystemAdapter')
    private readonly filesystemAdapter: AbstractFilesystem
  ) {}

  concat = async (): Promise<void> => {
    this.logger.info('[Concat] Starting concatenation process');
    const fileList = await this.filesystemAdapter.read(this.project.buildInfos.fileConcatPath);
    const files = fileList.split('\n').filter(Boolean);

    if (files.length === 1) {
      this.logger.info(`[Concat] Single file detected: ${files[0]} -> ${this.project.finalVideo}`);
      await this.filesystemAdapter.copy(files[0].replace('file ', ''), this.project.finalVideo);
      this.logger.info(`[Concat][Command] Copied single file to ${this.project.finalVideo}`);
    } else {
      const command =
        ' -y -vsync 2 -r 30 -f concat -safe 0 -auto_convert 1 ' +
        ` -i ${this.project.buildInfos.fileConcatPath} ` +
        ` -c copy -movflags +faststart ${this.project.finalVideo} `;
      this.logger.debug(`[Concat][Command] ffmpeg ${command}`);

      const result = await this.ffmpegAdapter.execute(command);
      this.logger.info(`[Concat] ffmpeg process exited with rc ${result.rc}`);

      if (result.rc === 1) {
        this.project.errors.push('concat');
        throw new Error('[Concat] Errors on concatenation');
      }
    }
  };

  /**
   * Attach mounted video to the current project
   */
  finalize = async (): Promise<void> => {
    this.logger.info('[End] Finalizing project');

    // append audio if any
    if (this.template.descriptor.global.audioEnabled) {
      await this.audioComposer.appendAudio(this.project.finalVideo);
    }

    // Apply overlay if any
    if (this.template.descriptor.global.blurEnabled) {
      this.logger.info('[End] Applying blur overlay');
      await this.overlayComposer.applyBlurBox(this.project.finalVideo);
    }

    // Burn captions if any
    if (this.template.descriptor.global.subtitlesEnabled) {
      this.logger.info('[End] Burning captions');
      await this.captionComposer.burnCaptions(this.project.finalVideo);
    }

    // Move final video to the outputDir if specified
    if (this.project.config.outputDir) {
      this.logger.info(`[End] Moving final video to ${this.project.config.outputDir}`);
      // await fs.mkdir(fullPath, { recursive: true });

      const outPath = `${this.project.config.outputDir}/output.mp4`;
      await this.filesystemAdapter.move(this.project.finalVideo, outPath);
      this.project.finalVideo = outPath;
    }

    // Finalize only if no errors had been rejected
    if (this.project.errors.length === 0) {
      // Call event
      this.emitter.emit('finalize', {
        video_source: this.project.finalVideo,
        template_assets: this.template.assets,
      });

      // Delete concatenation file
      // await this.filesystemAdapter.unlink(this.project.buildInfos.fileConcatPath);

      this.cleanTemp();

      this.emitter.emit('compilation-progress', 1);
      this.logger.info('[End] project cleaned');

      this.project.clean();
      this.template.clean();
    }
  };

  cleanTemp = async (): Promise<void> => {
    this.logger.info('[Clean] Cleaning temporary files');
    const buildDir = this.filesystemAdapter.getBuildDir();
    await this.filesystemAdapter.clean(buildDir);
  };
}

export default VideoEditor;
