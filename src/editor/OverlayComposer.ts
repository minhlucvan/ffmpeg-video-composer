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
  /**
   * Blur a box area in the video
   * @param x Top-left x-coordinate of the box
   * @param y Top-left y-coordinate of the box
   * @param width Width of the box
   * @param height Height of the box
   * @param outputPath Path to save the blurred video
   */
  blurBox = async (
    input: string,
    outputPath: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<string> => {
    this.logger.info('[BlurBox] Starting box blur process');

    const command =
      `-y -i ${input} ` +
      `-vf "drawbox=x=${x}:y=${y}:w=${width}:h=${height}:color=black@0.0:t=fill,boxblur=luma_radius=10:luma_power=2" ` +
      `-c:a copy ${outputPath}`;

    this.logger.debug(`[BlurBox][Command] ffmpeg ${command}`);

    return command;
  };

  applyBlurBox = async (outputPath: string): Promise<void> => {
    const time = new Date().getTime();
    const temp = `${this.filesystemAdapter.getTempDir()}/tmp_video_${time}.mp4`;

    await this.filesystemAdapter.move(outputPath, temp);

    const command = await this.blurBox(temp, outputPath, 0, 0, 100, 100);
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
