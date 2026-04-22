import type {
  AppSettings,
  AspectRatio,
  DesignedVoiceAsset,
  GeneratedAudio,
  GeneratedImage,
  GeneratedVideo,
  Language,
  Project,
  RunEvent,
  RunJob,
  ScriptSegment,
  VideoSettings,
  VoiceDesign,
} from '../types';

const API_BASE = '/api';

type RunSubscriptionHandlers = {
  onEvent: (event: RunEvent) => void;
  onError?: (error: Error) => void;
};

type JsonBody = Record<string, unknown> | undefined;

function normalizeListResponse<T>(value: unknown, label: string): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  console.warn(`[api] Expected ${label} to be an array but received`, value);
  return [];
}

export function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = await response.json();
      message = body?.error?.message || body?.message || body?.detail || message;
    } catch {
      // Keep fallback message when the body is not JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function post<T>(path: string, body?: JsonBody): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

function put<T>(path: string, body?: JsonBody): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

function patch<T>(path: string, body?: JsonBody): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

function del(path: string): Promise<void> {
  return request<void>(path, { method: 'DELETE' });
}

function createSseUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export const mockApi = {
  async healthCheck(): Promise<{ status: string }> {
    return request<{ status: string }>('/health');
  },

  async getSettings(): Promise<AppSettings> {
    return request<AppSettings>('/settings');
  },

  async updateSettings(projectsDirectory: string): Promise<AppSettings> {
    return put<AppSettings>('/settings', { projectsDirectory });
  },

  async listProjects(): Promise<Project[]> {
    const response = await request<unknown>('/projects');
    return normalizeListResponse<Project>(response, 'projects');
  },

  async getProject(projectId: string): Promise<Project> {
    return request<Project>(`/projects/${projectId}`);
  },

  async createProject(data: {
    name: string;
    description: string;
    language: Language;
    aspectRatio: AspectRatio;
  }): Promise<Project> {
    return post<Project>('/projects', data);
  },

  async updateProject(projectId: string, patchBody: Partial<Project>): Promise<Project> {
    return patch<Project>(`/projects/${projectId}`, patchBody);
  },

  async duplicateProject(projectId: string): Promise<Project> {
    return post<Project>(`/projects/${projectId}/duplicate`);
  },

  async deleteProject(projectId: string): Promise<void> {
    return del(`/projects/${projectId}`);
  },

  async getScript(projectId: string): Promise<{ content: string; segments: ScriptSegment[]; project: Project }> {
    return request<{ content: string; segments: ScriptSegment[]; project: Project }>(`/projects/${projectId}/script`);
  },

  async saveScript(projectId: string, content: string): Promise<{ content: string; segments: ScriptSegment[]; project: Project }> {
    return put<{ content: string; segments: ScriptSegment[]; project: Project }>(`/projects/${projectId}/script`, { content });
  },

  async listVoiceDesigns(projectId: string): Promise<VoiceDesign[]> {
    const response = await request<unknown>(`/projects/${projectId}/voice-designs`);
    return normalizeListResponse<VoiceDesign>(response, `voice designs for project ${projectId}`);
  },

  async listDesignedVoices(): Promise<DesignedVoiceAsset[]> {
    const response = await request<unknown>('/designed-voices');
    return normalizeListResponse<DesignedVoiceAsset>(response, 'designed voices');
  },

  async requestVoiceDesign(
    projectId: string,
    params: {
      name: string;
      promptInstruction: string;
      referenceText: string;
      speed: number;
      tonePreset: VoiceDesign['tonePreset'];
      narrationMood: VoiceDesign['narrationMood'];
      setAsDefault?: boolean;
    },
  ): Promise<{ run: RunJob; voiceDesign: VoiceDesign }> {
    return post<{ run: RunJob; voiceDesign: VoiceDesign }>(`/projects/${projectId}/voice-designs`, {
      ...params,
      setAsDefault: params.setAsDefault ?? false,
    });
  },

  async deleteVoiceDesign(projectId: string, voiceDesignId: string): Promise<void> {
    return del(`/projects/${projectId}/voice-designs/${voiceDesignId}`);
  },

  async setDefaultVoice(projectId: string, voiceDesignId: string): Promise<{ project: Project; voiceDesign: VoiceDesign }> {
    return post<{ project: Project; voiceDesign: VoiceDesign }>(`/projects/${projectId}/default-voice`, { voiceDesignId });
  },

  async listAudios(projectId: string): Promise<GeneratedAudio[]> {
    const response = await request<unknown>(`/projects/${projectId}/audios`);
    return normalizeListResponse<GeneratedAudio>(response, `audios for project ${projectId}`);
  },

  async requestAudioGeneration(
    projectId: string,
    params: {
      segmentIndices?: number[];
      voiceDesignId?: string | null;
      designedVoiceId?: string | null;
      clearExisting?: boolean;
      speed?: number;
    },
  ): Promise<{ run: RunJob }> {
    return post<{ run: RunJob }>(`/projects/${projectId}/generate-audios`, {
      segmentIndices: params.segmentIndices,
      voiceDesignId: params.voiceDesignId || undefined,
      designedVoiceId: params.designedVoiceId || undefined,
      clearExisting: params.clearExisting,
      speed: params.speed,
    });
  },

  async deleteAudio(projectId: string, audioId: string): Promise<void> {
    return del(`/projects/${projectId}/audios/${audioId}`);
  },

  async listImages(projectId: string): Promise<GeneratedImage[]> {
    const response = await request<unknown>(`/projects/${projectId}/images`);
    return normalizeListResponse<GeneratedImage>(response, `images for project ${projectId}`);
  },

  async requestImageGeneration(
    projectId: string,
    params: {
      segmentIndices?: number[];
      width?: number;
      height?: number;
      maxWorkers?: number;
    },
  ): Promise<{ run: RunJob }> {
    return post<{ run: RunJob }>(`/projects/${projectId}/generate-images`, params);
  },

  async deleteImage(projectId: string, imageId: string): Promise<void> {
    return del(`/projects/${projectId}/images/${imageId}`);
  },

  async listVideos(projectId: string): Promise<GeneratedVideo[]> {
    const response = await request<unknown>(`/projects/${projectId}/videos`);
    return normalizeListResponse<GeneratedVideo>(response, `videos for project ${projectId}`);
  },

  async requestVideoGeneration(
    projectId: string,
    params: {
      settings?: VideoSettings;
      voiceDesignId?: string | null;
      designedVoiceId?: string | null;
      autoGenerateAudios?: boolean;
      autoGenerateImages?: boolean;
    },
  ): Promise<{ run: RunJob }> {
    return post<{ run: RunJob }>(`/projects/${projectId}/generate-video`, {
      settings: params.settings,
      voiceDesignId: params.voiceDesignId || undefined,
      designedVoiceId: params.designedVoiceId || undefined,
      autoGenerateAudios: params.autoGenerateAudios ?? true,
      autoGenerateImages: params.autoGenerateImages ?? true,
    });
  },

  async deleteVideo(projectId: string, videoId: string): Promise<void> {
    return del(`/projects/${projectId}/videos/${videoId}`);
  },

  async listRuns(projectId: string): Promise<RunJob[]> {
    const response = await request<unknown>(`/projects/${projectId}/runs`);
    return normalizeListResponse<RunJob>(response, `runs for project ${projectId}`);
  },

  async getRun(projectId: string, runId: string): Promise<RunJob> {
    return request<RunJob>(`/projects/${projectId}/runs/${runId}`);
  },

  subscribeToRun(projectId: string, runId: string, handlers: RunSubscriptionHandlers): () => void {
    const eventSource = new EventSource(createSseUrl(`/projects/${projectId}/runs/${runId}/events`));

    eventSource.onmessage = (message) => {
      if (!message.data) {
        return;
      }

      try {
        handlers.onEvent(JSON.parse(message.data) as RunEvent);
      } catch (error) {
        handlers.onError?.(error instanceof Error ? error : new Error('Invalid run event payload'));
      }
    };

    eventSource.onerror = () => {
      handlers.onError?.(new Error('Run event stream disconnected'));
    };

    return () => {
      eventSource.close();
    };
  },
};
