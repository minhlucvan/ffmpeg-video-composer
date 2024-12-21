import { inject, injectable } from 'tsyringe';
import AbstractLogger from '../platform/logging/AbstractLogger';
import AbstractFFmpeg from '../platform/ffmpeg/AbstractFFmpeg';
import AbstractFilesystem from '../platform/filesystem/AbstractFilesystem';
import AbstractMusic from '../platform/ffmpeg/AbstractMusic';
import Template from '../core/models/Template';
import Project from '../core/models/Project';
import { FFMpegInfos, TimedMedia } from 'lib/core/types';

@injectable()
class AudioComposer {
  private buildAssetsDir: string;
  private audioAssetsDir: string;

  constructor(
    private readonly project: Project,
    private readonly template: Template,

    @inject('logger') private readonly logger: AbstractLogger,
    @inject('ffmpegAdapter') private readonly ffmpegAdapter: AbstractFFmpeg,
    @inject('filesystemAdapter')
    private readonly filesystemAdapter: AbstractFilesystem,
    @inject('musicAdapter') private readonly musicAdapter: AbstractMusic
  ) {}

  loadAudios = async (): Promise<void> => {
    const audios = this.template.descriptor.audios as TimedMedia[];
    this.logger.info('[Audio] Loading audios...');
    if (!audios) {
      this.logger.info('[Audio] No audio configured. Skipping.');
      return;
    }

    this.buildAssetsDir = await this.filesystemAdapter.getBuildPath('audios');
    this.audioAssetsDir = await this.filesystemAdapter.getBuildPath('audios');

    this.project.buildInfos.audiosSegments = [];

    for (const audio of audios) {
      this.logger.info(`[Audio] Loading ${audio.name}`);
      const audioName = audio.name;
      const audioFormattedName = audioName;
      const destination = `${this.buildAssetsDir}/${audioFormattedName}.mp3`;
      const audioPathInCache = `${this.audioAssetsDir}/${audioFormattedName}.mp3`;
      this.logger.info(`[Audio] Checking if ${audioPathInCache} exists`);

      let audioPath = '';

      if (await this.checkMusicExists(audioPathInCache)) {
        this.logger.info(`[Audio] Loaded from cache ${audioPathInCache}`);
        audioPath = audioPathInCache;
      } else if (audio.url) {
        this.logger.info(`[Audio] Fetching ${audio.name}`);
        await this.downloadAndSaveMusic(audio.url, destination);
        audioPath = destination;
      } else {
        this.logger.error(`[Audio] No URL provided for ${audio.name}`);
        continue;
      }

      if (!audioPath) {
        this.logger.error(`[Audio] Failed to load ${audio.name}`);
        continue;
      }

      this.logger.info(`[Audio] Loaded ${audio.name}`);
      this.project.buildInfos.audiosSegments.push({
        name: audio.name,
        path: audioPath,
        options: {
          ...audio.options,
        },
      });
    }

    this.logger.info(`[Audio] Loaded all audios ${this.project.buildInfos.audiosSegments.length}`);

    // load background audio
    if (this.template.descriptor.global.audio) {
      this.logger.info('[Audio] Loading background audio');

      const { name, url } = this.template.descriptor.global.audio;
      const destination = `${this.buildAssetsDir}/audio_${name}.mp4`;
      const audioPathInCache = `${this.audioAssetsDir}/audio_${name}.mp4`;

      let audioPath = '';

      if (await this.checkMusicExists(audioPathInCache)) {
        this.logger.info(`[Audio] Loaded from cache ${audioPathInCache}`);
        audioPath = audioPathInCache;
      } else if (url) {
        this.logger.info(`[Audio] Fetching bg ${name}`);
        await this.downloadAndSaveMusic(url, destination);
        audioPath = destination;
      } else {
        this.logger.error(`[Audio] No URL provided for ${name}`);
      }

      if (audioPath) {
        this.project.buildInfos.backgroundAudioPath = audioPath;
        this.logger.info(`[Audio] Loaded background audio ${name}`);
      }
    }
  };

  private async downloadAndSaveMusic(url: string, destination: string): Promise<void> {
    const musicPath = await this.downloadMusic(url);

    await this.filesystemAdapter.move(musicPath, destination);

    this.logger.info(`[Music] Fetched ${destination}`);
  }

  private async downloadMusic(url: string): Promise<string> {
    return await this.filesystemAdapter.fetch(url);
  }

  private async checkMusicExists(filePath: string): Promise<boolean> {
    return await this.filesystemAdapter.stat(filePath);
  }

  private fetchSectionInfos = async (source: string): Promise<FFMpegInfos> => {
    const info = await this.ffmpegAdapter.getInfos(source);

    if (null === info.duration) {
      throw new Error(`Duration not found for ${source}`);
    }

    return info;
  };

  private async getAudioDuration(audioPath: string): Promise<number> {
    const infos = await this.fetchSectionInfos(audioPath);
    return infos.duration || 0;
  }

  private calculateAudioDuration = (audioSegments: TimedMedia[]): number => {
    if (!audioSegments || audioSegments.length === 0) return 0;

    // Extract start and end times for each segment
    const segments = audioSegments.map((segment) => {
      const { start = 0, duration } = segment.options || {};
      return { start, end: start + duration };
    });

    // Sort segments by start time
    segments.sort((a, b) => a.start - b.start);

    // Merge overlapping segments
    const mergedSegments = [];
    let currentSegment = segments[0];

    for (let i = 1; i < segments.length; i++) {
      const nextSegment = segments[i];

      if (currentSegment.end >= nextSegment.start) {
        // Overlapping segments: merge them
        currentSegment.end = Math.max(currentSegment.end, nextSegment.end);
      } else {
        // No overlap: push the current segment and move to the next
        mergedSegments.push(currentSegment);

        // Handle gap between segments
        if (nextSegment.start > currentSegment.end) {
          mergedSegments.push({ start: currentSegment.end, end: nextSegment.start });
        }

        currentSegment = nextSegment;
      }
    }

    // Push the last segment
    mergedSegments.push(currentSegment);

    // Calculate the total duration of merged segments
    const totalDuration = mergedSegments.reduce((acc, segment) => {
      return acc + (segment.end - segment.start);
    }, 0);

    return totalDuration;
  };

  composeAudio = async (): Promise<void> => {
    this.logger.info('[Audio] Composing audio segments...');

    if (!this.project.buildInfos.audiosSegments || this.project.buildInfos.audiosSegments.length === 0) {
      this.logger.info('[Audio] No audio segments to compose. Skipping.');
      return;
    }

    this.logger.info('[Audio] Starting audio composition');

    const audioSegments = this.project.buildInfos.audiosSegments;

    const destination = `${this.buildAssetsDir}/audio.m4a`;

    const composedAudioSegments = [...audioSegments];


    // Add blank audio as a base with duration if there are no background audio
    if (!this.project.buildInfos.backgroundAudioPath) {
      this.logger.info('[Audio] No background audio found. Adding blank audio as base.');

      const audioDuration = this.calculateAudioDuration(audioSegments);
      const blankPath = `${this.buildAssetsDir}/blank.m4a`;
      await this.createBlankAudio(audioDuration, blankPath);

      const blankSegment: TimedMedia = {
        name: 'blank',
        path: blankPath,
        options: { start: 0, duration: audioDuration, frames: 0, end: audioDuration },
      };

      composedAudioSegments.unshift(blankSegment);
    } else {
      // Add background audio as the first segment
      this.logger.info('[Audio] Adding background audio as the first segment');

      const audioDuration = await this.getAudioDuration(this.project.buildInfos.backgroundAudioPath);
      const backgroundAudioSegment: TimedMedia = {
        name: 'background',
        path: this.project.buildInfos.backgroundAudioPath,
        options: { start: 0, duration: audioDuration, frames: 0, end: audioDuration, volume: 0.2 },
      };

      composedAudioSegments.unshift(backgroundAudioSegment);
    }

    const composedAudioCommand = this.buildComposeAudioCommand(composedAudioSegments, destination);

    this.logger.info(`[Audio] Composing audio to ${destination}`);
    const result = await this.ffmpegAdapter.execute(composedAudioCommand);

    if (result) {
      this.logger.info('[Audio] Composed audio');
      this.project.buildInfos.audioPath = destination;
    }
  };

  createBlankAudio = async (duration: number, destination: string): Promise<void> => {

    // veryfing if the duration is valid
    if (Number.isNaN(duration) || duration <= 0) {
      this.logger.error(`[Audio] Invalid duration ${duration}`);
      throw new Error('Invalid duration');
    }

    const blankPath = this.addBlankAudio();
    const command = `-y -t ${duration} ${blankPath} ${destination}`;

    this.logger.info(`[Audio] Creating blank audio for ${duration} seconds`);
    const result = await this.ffmpegAdapter.execute(command);

    if (result) {
      this.logger.info(`[Audio] Created blank audio for ${duration} seconds`);
    }
  };

  addBlankAudio = (): string => {
    const { channelLayout, sampleRate } = this.project.config.audioConfig;
    return `-f lavfi -i anullsrc=channel_layout=${channelLayout}:sample_rate=${sampleRate} -c:a aac`;
  };

  /**
   * Build filter complex string for a single audio segment
   * @param segment The audio segment object
   * @param index The index of the audio segment
   * @returns {string} Filter string for the segment
   */
  private buildSegmentFilter = (segment: TimedMedia, index: number): string => {
    const { start = 0, volume } = segment.options || {};
    const startMilliseconds = start * 1000;

    const segmentVolume = volume || 1.0;

    // Construct the filter components with proper chaining
    const filters = [
      // `atrim=start=${start}${duration ? `:end=${start + durationSeconds}` : ''}`, // Trim audio
      `adelay=${startMilliseconds}:all=1`, // Delay audio
      `volume=${segmentVolume}`, // Set volume
    ].join(','); // Use commas for chaining

    const prefix = `[${index}:a]`; // Prefix for input label
    const suffix = `[a${index}]`; // Suffix for output label

    return [prefix, filters, suffix].join(''); // Join components with no space
  };

  /**
   * Build the FFmpeg command to compose audio segments into a single audio file
   * @param audioSegments Array of audio segment objects
   * @param destination Path to save the output audio file
   * @returns {string} FFmpeg command for composing the audio
   */
  private buildComposeAudioCommand = (audioSegments: TimedMedia[], destination: string): string => {
    const inputs: string[] = [];
    const filters: string[] = [];
    const amixInputs: string[] = [];

    let command = '-y';

    audioSegments.forEach((segment, index) => {
      inputs.push(`-i ${segment.path}`); // Add input file
      filters.push(this.buildSegmentFilter(segment, index)); // Build filters
      amixInputs.push(`[a${index}]`); // Collect amix input labels
    });

    // Combine filters and amix inputs
    const filterComplex = [
      filters.join('; '), // Individual filters
      `${amixInputs.join(' ')}amix=inputs=${audioSegments.length}[mixed]`, // Combine all with amix
      `[mixed]loudnorm[out]`, // Normalize audio
    ].join('; '); // Join filter components with semicolon

    // Construct full command
    command += ` ${inputs.join(' ')} -filter_complex "${filterComplex}"`;
    command += ` -map "[out]" -c:a aac -ar 48000 -b:a 192k ${destination}`;

    return command;
  };

  /**
   * Append audio to the final video
   */
  appendAudio = async (finalVideo: string): Promise<void> => {
    this.logger.info('[Audio] Appending audio to the video');

    const time = new Date().getTime();
    const temp = `${this.filesystemAdapter.getTempDir()}/tmp_video_${time}.mp4`;
    const reduceNoiseConfig = 'afftdn=nr=20:nf=-20';

    // Default audio volume level
    const audioVolumeLevel = this.template.descriptor.global.audioVolumeLevel || 1;
    const sampleRate = this.project.config.audioConfig.sampleRate;

    await this.filesystemAdapter.move(finalVideo, temp);

    // Audio channel configuration
    const channelConfig = `aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=stereo`;

    // Building the FFmpeg command
    let command = ` -y -i ${temp} -i ${this.project.buildInfos.audioPath} `;
    let filterComplex = `[0:a]${channelConfig},volume=${audioVolumeLevel},${reduceNoiseConfig},apad[audio_formatted]; `;

    // Add music to the audio
    filterComplex += ` [1:a]${channelConfig}[music_formatted]; `;
    filterComplex += ` [audio_formatted][music_formatted]amix=inputs=2[final]`;

    // Completing the command
    command += ` -filter_complex '${filterComplex}' `;
    command += ` -map 0:v -map '[final]' -c:v copy -c:a aac -ac 2 -shortest ${finalVideo} `;

    this.logger.debug(`[Audio][Command] ffmpeg ${command}`);
    const result = await this.ffmpegAdapter.execute(command);
    this.logger.info(`[Audio] ffmpeg process exited with rc ${result.rc}`);

    if (result.rc === 1) {
      throw new Error('Error on audio appending');
    }

    // Clean up the temporary file
    this.logger.info(`[Audio] Cleaning up temporary file ${temp}`);
    // await this.filesystemAdapter.unlink(temp).catch((error) => {
    //   this.logger.error(`[Audio] Error cleaning up temporary file: ${error}`);
    // });
  };
}

export default AudioComposer;
