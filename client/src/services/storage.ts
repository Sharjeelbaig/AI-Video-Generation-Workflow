import type {
  Project, VoiceDesign, GeneratedAudio, GeneratedImage, GeneratedVideo, RunJob
} from '../types';

const KEYS = {
  projects: 'ams_projects',
  voiceDesigns: (pid: string) => `ams_vd_${pid}`,
  audios: (pid: string) => `ams_audio_${pid}`,
  images: (pid: string) => `ams_img_${pid}`,
  videos: (pid: string) => `ams_vid_${pid}`,
  runs: (pid: string) => `ams_runs_${pid}`,
};

function get<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function set<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

export const storage = {
  getProjects: (): Project[] => get<Project>(KEYS.projects),
  saveProjects: (projects: Project[]) => set(KEYS.projects, projects),

  getVoiceDesigns: (pid: string): VoiceDesign[] => get<VoiceDesign>(KEYS.voiceDesigns(pid)),
  saveVoiceDesigns: (pid: string, items: VoiceDesign[]) => set(KEYS.voiceDesigns(pid), items),

  getAudios: (pid: string): GeneratedAudio[] => get<GeneratedAudio>(KEYS.audios(pid)),
  saveAudios: (pid: string, items: GeneratedAudio[]) => set(KEYS.audios(pid), items),

  getImages: (pid: string): GeneratedImage[] => get<GeneratedImage>(KEYS.images(pid)),
  saveImages: (pid: string, items: GeneratedImage[]) => set(KEYS.images(pid), items),

  getVideos: (pid: string): GeneratedVideo[] => get<GeneratedVideo>(KEYS.videos(pid)),
  saveVideos: (pid: string, items: GeneratedVideo[]) => set(KEYS.videos(pid), items),

  getRuns: (pid: string): RunJob[] => get<RunJob>(KEYS.runs(pid)),
  saveRuns: (pid: string, items: RunJob[]) => set(KEYS.runs(pid), items),

  clearProject: (pid: string) => {
    localStorage.removeItem(KEYS.voiceDesigns(pid));
    localStorage.removeItem(KEYS.audios(pid));
    localStorage.removeItem(KEYS.images(pid));
    localStorage.removeItem(KEYS.videos(pid));
    localStorage.removeItem(KEYS.runs(pid));
  },
};
