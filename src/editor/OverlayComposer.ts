import { inject, injectable } from 'tsyringe';
import AbstractLogger from '../platform/logging/AbstractLogger';
import AbstractFFmpeg from '../platform/ffmpeg/AbstractFFmpeg';
import AbstractFilesystem from '../platform/filesystem/AbstractFilesystem';
import Template from '../core/models/Template';
import Project from '../core/models/Project';
import AssetManager from './managers/AssetManager';

@injectable()
class OverlayComposer {
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

  blurBox = async (
    input: string,
    outputPath: string,
    x: number,
    y: number,
    width: number,
    height: number,
    blurStrength: number = 10
  ): Promise<string> => {
    this.logger.info('[BlurBox] Starting box blur process');

    // Validate inputs
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || blurStrength < 0) {
      throw new Error('Invalid box dimensions, coordinates, or blur strength');
    }

    // Construct FFmpeg command
    const filterComplex = [
      `[0:v]crop=${width}:${height}:${x}:${y},avgblur=${blurStrength}[fg];`,
      `[0:v][fg]overlay=${x}:${y}[v]`
    ].join('');

    const command = [
      '-y',
      `-i ${input}`,
      `-filter_complex "${filterComplex}"`,
      `-map "[v]" -map 0:a -c:v libx264 -c:a copy -movflags +faststart ${outputPath}`
    ].join(' ');

    this.logger.debug(`[BlurBox][Command] ffmpeg ${command}`);

    return command;
  };

  applyBlurBox = async (outputPath: string): Promise<void> => {
    const time = new Date().getTime();
    const temp = `${this.filesystemAdapter.getTempDir()}/tmp_video_${time}.mp4`;

    await this.filesystemAdapter.move(outputPath, temp);

    const overlays = this.template.descriptor.overlays;

    if (!overlays) {
      this.logger.info('[BlurBox] No overlays found in template descriptor');
      return
    }

    const blurOverlay = overlays.find((overlay) => overlay.type === 'blur');

    if (!blurOverlay) {
      this.logger.info('[BlurBox] No blur overlay found in template descriptor');
      return;
    }

    this.logger.info('[BlurBox] Applying blur overlay');
    const { options: { x, y, width, height, blurStrength } } = blurOverlay;

    this.logger.info(`[BlurBox] Applying blur overlay at x:${x}, y:${y}, width:${width}, height:${height}, strength:${blurStrength}`);
    const command = await this.blurBox(temp, outputPath, x, y, width, height, blurStrength);
    const result = await this.ffmpegAdapter.execute(command);

    this.logger.info(`[BlurBox] ffmpeg process exited with rc ${result.rc}`);

    if (result.rc === 1) {
      this.project.errors.push('blurBox');
      throw new Error('[BlurBox] Errors on box blur');
    }

    this.logger.info(`[Music] Cleaning up temporary file ${temp}`);
  };
}

export default OverlayComposer;
