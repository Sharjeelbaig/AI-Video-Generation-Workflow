import type { Project, VoiceDesign, GeneratedAudio, GeneratedImage } from '../types';

const sampleScript = `<Heading>Introduction to Artificial Intelligence</Heading>
Artificial intelligence is transforming how we interact with technology.
<image>A futuristic neural network visualization with glowing blue nodes and connections</image>
---
<SubHeading>Machine Learning Fundamentals</SubHeading>
Machine learning enables computers to learn from data without being explicitly programmed.
<image>Abstract data visualization showing gradient descent on a 3D surface</image>
---
<Heading>Natural Language Processing</Heading>
NLP allows machines to understand, interpret, and generate human language.
<image>Text flowing through a digital brain with highlighted sentiment patterns</image>
---
<SubHeading>Deep Learning Revolution</SubHeading>
Deep learning uses neural networks with many layers to solve complex problems.
<image>Layered neural network architecture with illuminated pathways</image>
---
<Heading>الذكاء الاصطناعي في العالم العربي</Heading>
يشهد العالم العربي نمواً متسارعاً في تبني تقنيات الذكاء الاصطناعي.
<image>Modern smart city skyline in the Middle East with AI overlay graphics</image>
---
<SubHeading>Future of AI</SubHeading>
The future holds unprecedented possibilities as AI continues to evolve and expand.
<image>Sunrise over a futuristic city with autonomous vehicles and drone networks</image>`;

export const DEMO_PROJECTS: Project[] = [
  {
    id: 'proj_001',
    name: 'AI Technology Explainer',
    description: 'A comprehensive explainer video about artificial intelligence and its applications in the modern world.',
    language: 'en-ar',
    aspectRatio: '16:9',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    status: 'success',
    archived: false,
    scriptContent: sampleScript,
    defaultVoiceDesignId: 'vd_001',
    videoSettings: {
      width: 1920, height: 1080, fps: 30,
      fontFamily: 'Arial', arabicFontFamily: 'Cairo',
      bodyColor: '#FFFFFF', headingColor: '#F59E0B', subHeadingColor: '#60A5FA',
      backgroundColor: '#0F172A', wordsPerScene: 8,
      separatorLine: true, fadeTransition: true, fadeTransitionDuration: 0.5,
      outputFilename: 'ai_explainer_final.mp4',
    },
  },
  {
    id: 'proj_002',
    name: 'Climate Change Documentary',
    description: 'An impactful documentary series exploring climate change causes and solutions.',
    language: 'en',
    aspectRatio: '16:9',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'idle',
    archived: false,
    scriptContent: `<Heading>The Climate Crisis</Heading>\nOur planet is facing an unprecedented climate emergency.\n<image>Melting glaciers with dramatic lighting</image>\n---\n<SubHeading>Rising Temperatures</SubHeading>\nGlobal temperatures have risen by 1.1°C since pre-industrial times.\n<image>Temperature map of Earth showing heat zones</image>`,
    defaultVoiceDesignId: null,
    videoSettings: {
      width: 1920, height: 1080, fps: 24,
      fontFamily: 'Georgia', arabicFontFamily: 'Amiri',
      bodyColor: '#F3F4F6', headingColor: '#EF4444', subHeadingColor: '#FB923C',
      backgroundColor: '#1C1917', wordsPerScene: 6,
      separatorLine: false, fadeTransition: true, fadeTransitionDuration: 0.8,
      outputFilename: 'climate_documentary.mp4',
    },
  },
  {
    id: 'proj_003',
    name: 'Product Launch Reel',
    description: 'Short-form vertical content for social media product announcement.',
    language: 'en',
    aspectRatio: '9:16',
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'running',
    archived: false,
    scriptContent: `<Heading>Introducing Nova</Heading>\nThe future of productivity is here.\n<image>Sleek product shot of a minimal device on gradient background</image>\n---\nPowered by AI, designed for humans.\n<image>Person using the device with glowing UI elements</image>`,
    defaultVoiceDesignId: null,
    videoSettings: {
      width: 1080, height: 1920, fps: 30,
      fontFamily: 'Helvetica', arabicFontFamily: 'Cairo',
      bodyColor: '#FFFFFF', headingColor: '#22D3EE', subHeadingColor: '#A78BFA',
      backgroundColor: '#030712', wordsPerScene: 5,
      separatorLine: false, fadeTransition: true, fadeTransitionDuration: 0.3,
      outputFilename: 'nova_launch_reel.mp4',
    },
  },
];

export const DEMO_VOICE_DESIGNS: Record<string, VoiceDesign[]> = {
  proj_001: [
    {
      id: 'vd_001',
      projectId: 'proj_001',
      name: 'Professional Narrator',
      promptInstruction: 'Speak in a clear, authoritative tone suitable for educational content. Maintain steady pacing with natural pauses.',
      referenceText: 'Artificial intelligence is transforming how we interact with technology and reshaping industries.',
      speed: 1.0,
      tonePreset: 'formal',
      narrationMood: 'documentary',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      duration: 4.2,
      status: 'success',
      audioUrl: null,
      isDefault: true,
    },
    {
      id: 'vd_002',
      projectId: 'proj_001',
      name: 'Warm Educator',
      promptInstruction: 'Use a warm, approachable voice that makes complex topics feel accessible.',
      referenceText: 'Machine learning enables computers to learn from experience, just like humans do.',
      speed: 0.95,
      tonePreset: 'warm',
      narrationMood: 'educational',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      duration: 3.8,
      status: 'success',
      audioUrl: null,
      isDefault: false,
    },
  ],
};

export const DEMO_AUDIOS: Record<string, GeneratedAudio[]> = {
  proj_001: [
    {
      id: 'aud_001', projectId: 'proj_001', segmentId: 'seg_0', segmentIndex: 0,
      voiceDesignId: 'vd_001', status: 'success', progress: 100,
      audioUrl: null, duration: 6.4, createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), runId: 'run_001',
    },
    {
      id: 'aud_002', projectId: 'proj_001', segmentId: 'seg_1', segmentIndex: 1,
      voiceDesignId: 'vd_001', status: 'success', progress: 100,
      audioUrl: null, duration: 5.1, createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), runId: 'run_001',
    },
    {
      id: 'aud_003', projectId: 'proj_001', segmentId: 'seg_2', segmentIndex: 2,
      voiceDesignId: 'vd_001', status: 'failed', progress: 0,
      audioUrl: null, duration: null, createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), runId: 'run_001',
    },
    {
      id: 'aud_004', projectId: 'proj_001', segmentId: 'seg_3', segmentIndex: 3,
      voiceDesignId: 'vd_001', status: 'success', progress: 100,
      audioUrl: null, duration: 4.7, createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), runId: 'run_001',
    },
  ],
};

export const DEMO_IMAGES: Record<string, GeneratedImage[]> = {
  proj_001: [
    {
      id: 'img_001', projectId: 'proj_001', segmentId: 'seg_0', segmentIndex: 0,
      prompt: 'A futuristic neural network visualization with glowing blue nodes and connections',
      status: 'success', progress: 100,
      thumbnailUrl: 'https://picsum.photos/seed/ai1/400/225',
      width: 1920, height: 1080,
      createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(), runId: 'run_002',
    },
    {
      id: 'img_002', projectId: 'proj_001', segmentId: 'seg_1', segmentIndex: 1,
      prompt: 'Abstract data visualization showing gradient descent on a 3D surface',
      status: 'success', progress: 100,
      thumbnailUrl: 'https://picsum.photos/seed/ai2/400/225',
      width: 1920, height: 1080,
      createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(), runId: 'run_002',
    },
    {
      id: 'img_003', projectId: 'proj_001', segmentId: 'seg_2', segmentIndex: 2,
      prompt: 'Text flowing through a digital brain with highlighted sentiment patterns',
      status: 'failed', progress: 0,
      thumbnailUrl: null,
      width: 1920, height: 1080,
      createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(), runId: 'run_002',
    },
  ],
};
