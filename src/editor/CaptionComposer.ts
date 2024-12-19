import { inject, injectable } from 'tsyringe';
import AbstractLogger from '../platform/logging/AbstractLogger';
import AbstractFFmpeg from '../platform/ffmpeg/AbstractFFmpeg';
import AbstractFilesystem from '../platform/filesystem/AbstractFilesystem';
import Template from '../core/models/Template';
import Project from '../core/models/Project';
import AssetManager from './managers/AssetManager';

@injectable()
class CaptionComposer {
  private buildAssetsDir: string;
  private subtitleAssetsDir: string;
  private fontsAssetsDir: string;

  constructor(
    private readonly project: Project,
    private readonly template: Template,
    private readonly assetsManager: AssetManager,

    @inject('logger') private readonly logger: AbstractLogger,
    @inject('ffmpegAdapter') private readonly ffmpegAdapter: AbstractFFmpeg,
    @inject('filesystemAdapter') private readonly filesystemAdapter: AbstractFilesystem
  ) {}

  /**
   * Load and prepare the subtitles if provided.
   * If the project or template has a configuration for captions, we ensure the file exists.
   */
  loadSubtitles = async (): Promise<void> => {
    this.logger.info('[Captions] Loading subtitles...');

    this.buildAssetsDir = await this.filesystemAdapter.getBuildPath('assets');
    this.subtitleAssetsDir = await this.filesystemAdapter.getAssetsPath('subtitles');
    this.fontsAssetsDir = await this.filesystemAdapter.getAssetsPath('fonts');

    // Check project or template for subtitle configuration
    if (!this.project.config.subtitles) {
      // Try template global subtitles
      if (this.template.descriptor.global?.subtitles) {
        this.project.config.subtitles = this.template.descriptor.global.subtitles;
      }
    }

    // If still no subtitles, just return (no operation)
    if (!this.project.config.subtitles) {
      this.logger.info('[Captions] No subtitles configured. Skipping.');
      return;
    }

    const subtitleName = this.project.config.subtitles.name;
    const subtitleFormattedName = this.formatSubtitleName(subtitleName.substring(0, subtitleName.lastIndexOf('.')));
    const destination = `${this.buildAssetsDir}/${subtitleFormattedName}.ass`;
    const subtitlePathInCache = `${this.subtitleAssetsDir}/${subtitleFormattedName}.ass`;

    if (await this.checkSubtitleExists(subtitlePathInCache)) {
      this.logger.info(`[Captions] Loaded from cache ${subtitlePathInCache}`);
      this.project.buildInfos.subtitlePath = subtitlePathInCache;
    } else if (this.project.config.subtitles.url) {
      this.logger.info(`[Captions] Fetching ${this.project.config.subtitles.url}`);
      await this.downloadAndSaveSubtitle(this.project.config.subtitles.url, destination);
      this.project.buildInfos.subtitlePath = destination;
    } else {
      // If no URL provided and not in cache, we cannot proceed
      this.logger.info('[Captions] Subtitle URL not provided and not in cache.');
    }

    // load fonts
    if (this.project.config.subtitles.fonts) {
      for (const font of this.project.config.subtitles.fonts) {
        await this.assetsManager.fetchFont(font);
        this.logger.info(`[Captions] Fetching font ${font}`);
      }
    }
  };

  private async downloadAndSaveSubtitle(url: string, destination: string): Promise<void> {
    const subtitlePath = await this.filesystemAdapter.fetch(url);
    await this.filesystemAdapter.move(subtitlePath, destination);
    this.logger.info(`[Captions] Fetched subtitle to ${destination}`);
  }

  private formatSubtitleName(name: string): string {
    return name.replace(/[:.' ]/g, '_').toLowerCase();
  }

  private async checkSubtitleExists(filePath: string): Promise<boolean> {
    return await this.filesystemAdapter.stat(filePath);
  }

  /**
   * Burn the subtitles into the given video file.
   * @param finalVideo The video file to burn the subtitles into.
   * @param scale Optional scaling string for the filter (e.g., "scale=1280:-1,"), leave empty if no scaling is needed.
   * @param burnPreset The ffmpeg preset for encoding speed/quality.
   */
  burnCaptions = async (finalVideo: string, scale: string = '', burnPreset: string = 'fast'): Promise<void> => {
    this.logger.info('[Captions] Burning subtitles...');
    if (!this.project.buildInfos.subtitlePath) {
      this.logger.info('[Captions] No subtitles to burn. Skipping.');
      // Just copy the input to output if no captions (or do nothing)
      return;
    }

    const time = new Date().getTime();
    const temp = `${this.filesystemAdapter.getTempDir()}/tmp_video_${time}.mp4`;

    await this.filesystemAdapter.move(finalVideo, temp);

    const subtitleFile = this.project.buildInfos.subtitlePath;

    // Check if both finalVideo and subtitleFile exist
    const inputExists = await this.filesystemAdapter.stat(temp);
    const subtitleExists = await this.filesystemAdapter.stat(subtitleFile);

    if (!inputExists) {
      throw new Error(`[Captions] Input video file does not exist: ${temp}`);
    }

    if (!subtitleExists) {
      throw new Error(`[Captions] Subtitle file does not exist: ${subtitleFile}`);
    }

    // ffmpeg command to burn in subtitles:
    // Example:
    // ffmpeg -i input.mp4 -vf "scale=1280:-1,ass=subtitle.ass:fontsdir=/tmp" -c:a copy -preset fast output.mp4
    // If no scaling needed, just omit scale.
    const fontsDir = this.fontsAssetsDir;
    let vfFilters = `${scale}ass=${subtitleFile}:fontsdir=${fontsDir}`;
    vfFilters = vfFilters.replace(/,\s*$/, ''); // Remove trailing commas if any

    const command = [
      '',
      '-y',
      '-i',
      temp,
      '-vf',
      vfFilters,
      '-max_muxing_queue_size',
      '1024',
      '-c:a',
      'copy',
      '-preset',
      burnPreset,
      finalVideo,
    ].join(' ');

    this.logger.debug(`[Captions][Command] ffmpeg ${command}`);
    const result = await this.ffmpegAdapter.execute(command);
    this.logger.info(`[Captions] ffmpeg process exited with rc ${result.rc}`);

    if (result.rc === 1) {
      throw new Error('Error burning subtitles into the video');
    }
  };
}

export default CaptionComposer;
