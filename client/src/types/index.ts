export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3';
export type Language = 'en' | 'ar' | 'en-ar';
export type ProjectStatus = 'idle' | 'running' | 'success' | 'failed' | 'archived';
export type JobStatus = 'idle' | 'queued' | 'running' | 'success' | 'failed';
export type TonePreset = 'neutral' | 'warm' | 'formal' | 'energetic' | 'calm';
export type NarrationMood = 'documentary' | 'conversational' | 'dramatic' | 'educational' | 'inspirational';

export interface Project {
  id: string;
  name: string;
  description: string;
  language: Language;
  aspectRatio: AspectRatio;
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;
  archived: boolean;
  scriptContent: string;
  defaultVoiceDesignId: string | null;
  outputFolder?: string | null;
  videoSettings: VideoSettings;
}

export interface DesignedVoiceAsset {
  id: string;
  filename: string;
  name: string;
  audioUrl: string;
  createdAt: string;
}

export interface ScriptSegment {
  id: string;
  projectId: string;
  index: number;
  rawText: string;
  cleanText: string;
  heading: string | null;
  subHeading: string | null;
  imagePrompt: string | null;
  sourceBlockIndex: number;
  imagePromptSourceBlockIndex: number | null;
  hasNarration: boolean;
  warnings: string[];
  isEmpty: boolean;
}

export interface VoiceDesign {
  id: string;
  projectId: string;
  name: string;
  promptInstruction: string;
  referenceText: string;
  speed: number;
  tonePreset: TonePreset;
  narrationMood: NarrationMood;
  createdAt: string;
  duration: number | null;
  status: JobStatus;
  audioUrl: string | null;
  isDefault: boolean;
}

export interface GeneratedAudio {
  id: string;
  projectId: string;
  segmentId: string;
  segmentIndex: number;
  voiceDesignId: string;
  status: JobStatus;
  progress: number;
  audioUrl: string | null;
  duration: number | null;
  createdAt: string;
  runId: string;
  parserVersion?: number | null;
  scriptFingerprint?: string | null;
}

export interface GeneratedImage {
  id: string;
  projectId: string;
  segmentId: string;
  segmentIndex: number;
  prompt: string;
  status: JobStatus;
  progress: number;
  thumbnailUrl: string | null;
  width: number;
  height: number;
  createdAt: string;
  runId: string;
  parserVersion?: number | null;
  scriptFingerprint?: string | null;
  promptBlockIndex?: number | null;
}

export interface GeneratedVideo {
  id: string;
  projectId: string;
  status: JobStatus;
  progress: number;
  stages: VideoStage[];
  videoUrl: string | null;
  thumbnailUrl: string | null;
  filename: string;
  duration: number | null;
  createdAt: string;
  runId: string;
  settings: VideoSettings;
  parserVersion?: number | null;
  scriptFingerprint?: string | null;
}

export interface VideoStage {
  label: string;
  status: JobStatus;
  progress: number;
}

export interface VideoSettings {
  width: number;
  height: number;
  fps: number;
  fontFamily: string;
  arabicFontFamily: string;
  bodyColor: string;
  headingColor: string;
  subHeadingColor: string;
  backgroundColor: string;
  wordsPerScene: number;
  separatorLine: boolean;
  fadeTransition: boolean;
  fadeTransitionDuration: number;
  outputFilename: string;
}

export interface RunJob {
  id: string;
  projectId: string;
  type: 'voice-design' | 'generate-voice' | 'generate-images' | 'generate-video';
  status: JobStatus;
  startedAt: string;
  completedAt: string | null;
  itemIds: string[];
  label: string;
}

export interface ProjectStats {
  scriptSegments: number;
  voiceDesigns: number;
  generatedAudios: number;
  generatedImages: number;
  videos: number;
  latestStatus: ProjectStatus;
}

export interface Toast {
  id: string;
  message: string;
  severity: 'success' | 'error' | 'warning' | 'info';
}

export interface AppSettings {
  projectsDirectory: string;
  configPath: string;
  appDataDirectory: string;
  logsDirectory: string;
  stateDirectory: string;
}

export type RunEvent =
  | { type: 'run-snapshot'; run: RunJob }
  | { type: 'run-update'; run: RunJob }
  | { type: 'run-completed'; run: RunJob }
  | { type: 'run-failed'; run: RunJob }
  | { type: 'run-error'; message: string }
  | { type: 'voice-design-update'; voiceDesign: VoiceDesign }
  | { type: 'audio-update'; audio: GeneratedAudio }
  | { type: 'image-update'; image: GeneratedImage }
  | { type: 'image-progress'; segmentIndex: number; status: JobStatus; progress: number }
  | { type: 'video-update'; video: GeneratedVideo }
  | { type: 'video-stages'; stages: VideoStage[] }
  | { type: 'log'; stream: 'stdout' | 'stderr'; line: string };
