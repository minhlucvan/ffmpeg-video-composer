export type LogParams = Record<string, unknown>;

export type ProjectConfig = {
  buildDir?: string;
  tempDir?: string;
  assetsDir?: string;
  outputDir?: string;
  music?: MusicConfig;
  fields?: Record<string, string>;
  currentLocale?: string;
  codecConfig?: CodecConfig;
  hardwareConfig?: HardwareConfig;
  audioConfig?: AudioConfig;
  videoConfig?: VideoConfig;
  subtitles?: SubtitleConfig;
};

type SubtitleConfig = {
  name: string;
  url?: string;
  fonts?: string[];
};

type MusicConfig = {
  name: string;
  url?: string;
};

type CodecConfig = {
  videoCodec?: string;
  audioCodec?: string;
};

type HardwareConfig = {
  hwaccel?: string;
  preset?: string;
};

type AudioConfig = {
  sampleRate?: number;
  channelLayout?: string;
};

type VideoConfig = {
  orientation?: string;
  scale?: string;
  setsar?: string;
};

export type ProjectBuildInfos = {
  totalSegments: number;
  totalLength: number;
  currentLength: number;
  currentProgress: number;
  currentIncrement: number;
  durations: number[];
  videoInputs: string[];
  musicInputs: string[];
  musicFilters: string[];
  audiosSegments?: TimedMedia[];
  audioPath?: string;
  fileConcatPath: string;
  musicPath: string;
  subtitlePath?: string;
  backgroundAudioPath?: string;
};

// Descriptor
export interface TemplateDescriptor {
  global?: TemplateDescriptorGlobal;
  sections?: Section[];
  audios?: TimedMedia[];
  overlays?: Overlay[];
}


export interface Overlay {
  name: string;
  type: 'color' | 'blur',
  options: OverlayOptions;
}

export interface OverlayOptions {
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  blurStrength: number;
}
interface TemplateDescriptorGlobal {
  variables?: Variables;
  orientation?: string;
  colorsList?: string[];
  musicEnabled?: boolean;
  audioVolumeLevel?: number;
  transitionDuration?: number;
  music?: MusicConfig;
  audio?: MusicConfig;
  subtitlesEnabled?: boolean;
  subtitles?: SubtitleConfig;
  audioEnabled?: boolean;
  blurEnabled?: boolean;
}

export interface Variables {
  [key: string]: string | string[];
}

export interface Section {
  name: string;
  type: string;
  visibility: string[];
  options?: SectionOptions;
  inputs?: Input[];
  maps?: Map[];
  filters?: Filter[];
  title?: Translation;
  description?: Translation;
}

interface SectionOptions {
  upperCase?: boolean;
  lowerCase?: boolean;
  useVideoSection?: string;
  duration?: number;
  musicVolumeLevel?: number;
  fields?: Field[];
  speed?: number;
  muteSection?: boolean;
  videoUrl?: string;
  logoUrl?: string;
  backgroundUrl?: string;
  backgroundColor?: string;
  forceAspectRatio?: boolean;
  forceOriginalAspectRatio?: boolean;
  extension?: string;
  useAudio?: boolean;
}

interface Input {
  name: string;
  url: string;
  extension?: string;
}

export interface Map {
  inputs: string[];
  outputs: string[];
  filters?: Filter[];
  options?: MapOptions;
}

type MapOptions = {
  useSectionFilters?: boolean;
};

export interface Filter {
  type: string;
  value?: string | number;
  values?: FilterValues;
  range?: string;
}

interface FilterValues {
  h?: number | string;
  w?: number | string;
  x?: number | string;
  y?: number | string;
  c?: string;
  t?: string | number;
  text?: Translation;
  fontcolor?: string;
  fontsize?: number | string;
  fontfile?: string;
  alpha?: string;
  d?: string;
  st?: string;
  color?: string;
}

interface Translation {
  [key: string]: string | undefined;
}

interface Field {
  name: string;
  maxLength: number;
  label: Translation;
}

export type Media = {
  name: string;
  url?: string;
  path?: string;
  extension?: string;
  options?: {
    frames: number;
  };
};

export type TimedMedia = Media & {
  options: {
    start: number;
    end: number;
    duration: number;
    volume?: number;
  };
};

export type TemplateAssets = {
  fonts: Record<string, string>;
  musics: Record<string, string>;
  inputs: string[];
};

type MapAnimationOptions = {
  frames: number;
  frequency: number;
  duration: number;
  overlay: string;
  scale: string;
  persistent: boolean;
};

export type MapAnimationInput = {
  url: string;
  name: string;
  type: string;
  extension: string;
  options: MapAnimationOptions;
  filters: Filter[];
};

export type FFMpegInfos = {
  duration: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  sampleRate: number | null;
};
