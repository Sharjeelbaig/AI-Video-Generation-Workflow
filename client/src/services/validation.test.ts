import { describe, expect, it } from 'vitest';
import {
  validateProjectInput,
  validateProjectsDirectory,
  validateVideoSettings,
  validateVoiceDesignInput,
} from './validation';

describe('validation', () => {
  it('accepts valid project input', () => {
    const result = validateProjectInput({
      name: 'Launch Video',
      description: 'Production test',
      language: 'en',
      aspectRatio: '16:9',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Launch Video');
    }
  });

  it('rejects an empty projects directory', () => {
    const result = validateProjectsDirectory('   ');
    expect(result.success).toBe(false);
  });

  it('rejects invalid video settings', () => {
    const result = validateVideoSettings({
      width: 1920,
      height: 1080,
      fps: 30,
      fontFamily: 'Space Grotesk',
      arabicFontFamily: 'Cairo',
      bodyColor: '#ffffff',
      headingColor: '#f4b75e',
      subHeadingColor: '#6cc8c3',
      backgroundColor: '#000000',
      wordsPerScene: 8,
      separatorLine: true,
      fadeTransition: true,
      fadeTransitionDuration: 0,
      outputFilename: 'demo.mov',
    });

    expect(result.success).toBe(false);
  });

  it('accepts valid voice design input', () => {
    const result = validateVoiceDesignInput({
      name: 'Narrator',
      promptInstruction: 'Calm documentary voice',
      referenceText: '',
      speed: 1,
      tonePreset: 'calm',
      narrationMood: 'documentary',
    });

    expect(result.success).toBe(true);
  });
});
