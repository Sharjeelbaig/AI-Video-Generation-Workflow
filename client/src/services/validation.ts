import { z } from 'zod';
import type {
  AspectRatio,
  Language,
  NarrationMood,
  TonePreset,
  VideoSettings,
} from '../types';

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };

type CreateProjectInput = {
  name: string;
  description: string;
  language: Language;
  aspectRatio: AspectRatio;
};

type VoiceDesignInput = {
  name: string;
  promptInstruction: string;
  referenceText: string;
  speed: number;
  tonePreset: TonePreset;
  narrationMood: NarrationMood;
};

const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(80, 'Project name must be 80 characters or less'),
  description: z.string().trim().max(240, 'Description must be 240 characters or less'),
  language: z.custom<Language>(),
  aspectRatio: z.custom<AspectRatio>(),
});

const voiceDesignSchema = z.object({
  name: z.string().trim().min(1, 'Voice name is required').max(80, 'Voice name must be 80 characters or less'),
  promptInstruction: z.string().trim().min(1, 'Voice style prompt is required').max(1200, 'Voice style prompt must be 1200 characters or less'),
  referenceText: z.string().trim().max(1200, 'Reference text must be 1200 characters or less'),
  speed: z.number().min(0.5, 'Voice speed must be between 0.5x and 2x').max(2, 'Voice speed must be between 0.5x and 2x'),
  tonePreset: z.custom<TonePreset>(),
  narrationMood: z.custom<NarrationMood>(),
});

const projectsDirectorySchema = z.string().trim().min(1, 'Projects directory is required');

const videoSettingsSchema = z.object({
  width: z.number().positive('Video width must be a positive number'),
  height: z.number().positive('Video height must be a positive number'),
  fps: z.number().positive('FPS must be a positive number'),
  fontFamily: z.string().trim().min(1, 'Both font fields are required'),
  arabicFontFamily: z.string().trim().min(1, 'Both font fields are required'),
  bodyColor: z.string(),
  headingColor: z.string(),
  subHeadingColor: z.string(),
  backgroundColor: z.string(),
  wordsPerScene: z.number().positive('Words per scene must be a positive number'),
  separatorLine: z.boolean(),
  fadeTransition: z.boolean(),
  fadeTransitionDuration: z.number(),
  outputFilename: z.string().trim().min(1, 'Output filename is required').refine(
    (value) => value.toLowerCase().endsWith('.mp4'),
    'Output filename must end with .mp4',
  ),
}).refine(
  (value) => !value.fadeTransition || value.fadeTransitionDuration > 0,
  {
    message: 'Fade transition duration must be greater than 0',
    path: ['fadeTransitionDuration'],
  },
);

function success<T>(data: T): ValidationResult<T> {
  return { success: true, data };
}

function failure<T>(message: string): ValidationResult<T> {
  return { success: false, message };
}

export function validateProjectInput(input: CreateProjectInput): ValidationResult<CreateProjectInput> {
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message || 'Invalid project input');
  }
  return success(parsed.data);
}

export function validateScriptContent(content: string): ValidationResult<string> {
  if (content.length > 200_000) {
    return failure('Script content is too large');
  }
  return success(content);
}

export function validateVoiceDesignInput(input: VoiceDesignInput): ValidationResult<VoiceDesignInput> {
  const parsed = voiceDesignSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message || 'Invalid voice design input');
  }
  return success(parsed.data);
}

export function validateProjectsDirectory(directory: string): ValidationResult<string> {
  const parsed = projectsDirectorySchema.safeParse(directory);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message || 'Invalid projects directory');
  }
  return success(parsed.data);
}

export function validateVideoSettings(settings: VideoSettings): ValidationResult<VideoSettings> {
  const parsed = videoSettingsSchema.safeParse(settings);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message || 'Invalid video settings');
  }
  return success(parsed.data);
}
