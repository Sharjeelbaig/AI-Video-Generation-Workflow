import type {
  Project,
  VoiceDesign,
  DesignedVoiceAsset,
  GeneratedAudio,
  GeneratedImage,
  GeneratedVideo,
  RunJob,
  VideoSettings,
  Language,
  AspectRatio,
  ScriptSegment,
  VideoStage,
} from '../types';

type EventPayload = {
  type: string;
  [key: string]: unknown;
};

const API_BASE = '/api';

function normalizeListResponse<T>(value: unknown, label: string): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  console.warn(`[mockApi] Expected ${label} to be an array but received`, value);
  return [];
}

export function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = await response.json();
      message = body?.detail || body?.message || message;
    } catch {
      // Keep default message when response is not JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function createSseUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function awaitRunCompletion(
  projectId: string,
  runId: string,
  onEvent: (event: EventPayload) => void,
): Promise<RunJob> {
  return new Promise<RunJob>((resolve, reject) => {
    const eventSource = new EventSource(createSseUrl(`/projects/${projectId}/runs/${runId}/events`));

    let finalRun: RunJob | null = null;

    eventSource.onmessage = (message) => {
      let payload: EventPayload;
      try {
        payload = JSON.parse(message.data) as EventPayload;
      } catch {
        return;
      }

      onEvent(payload);

      if (payload.type === 'run-update' || payload.type === 'run-snapshot') {
        finalRun = payload.run as RunJob;
      }

      if (payload.type === 'run-completed') {
        finalRun = (payload.run as RunJob) || finalRun;
        eventSource.close();
        if (finalRun) {
          resolve(finalRun);
          return;
        }
        reject(new Error('Run completed without run payload'));
      }

      if (payload.type === 'run-failed') {
        const run = (payload.run as RunJob) || finalRun;
        const errorMessage = typeof payload.message === 'string'
          ? payload.message
          : 'Run failed';
        eventSource.close();
        if (run) {
          reject(new Error(errorMessage));
        } else {
          reject(new Error('Run failed without run payload'));
        }
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      reject(new Error('Run event stream disconnected'));
    };
  });
}

export const mockApi = {
  async healthCheck(): Promise<{ status: string }> {
    return request<{ status: string }>('/health');
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
    return request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateProject(projectId: string, patch: Partial<Project>): Promise<Project> {
    return request<Project>(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  async duplicateProject(projectId: string): Promise<Project> {
    return request<Project>(`/projects/${projectId}/duplicate`, {
      method: 'POST',
    });
  },

  async deleteProject(projectId: string): Promise<void> {
    await request<{ status: string }>(`/projects/${projectId}`, {
      method: 'DELETE',
    });
  },

  async getScript(projectId: string): Promise<{ content: string; segments: ScriptSegment[]; project: Project }> {
    return request<{ content: string; segments: ScriptSegment[]; project: Project }>(`/projects/${projectId}/script`);
  },

  async saveScript(projectId: string, content: string): Promise<{ content: string; segments: ScriptSegment[]; project: Project }> {
    return request<{ content: string; segments: ScriptSegment[]; project: Project }>(`/projects/${projectId}/script`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  },

  async listVoiceDesigns(projectId: string): Promise<VoiceDesign[]> {
    const response = await request<unknown>(`/projects/${projectId}/voice-designs`);
    return normalizeListResponse<VoiceDesign>(response, `voice designs for project ${projectId}`);
  },

  async listDesignedVoices(): Promise<DesignedVoiceAsset[]> {
    const response = await request<unknown>('/designed-voices');
    return normalizeListResponse<DesignedVoiceAsset>(response, 'designed voices');
  },

  async deleteVoiceDesign(projectId: string, voiceDesignId: string): Promise<void> {
    await request<{ status: string }>(`/projects/${projectId}/voice-designs/${voiceDesignId}`, {
      method: 'DELETE',
    });
  },

  async setDefaultVoice(projectId: string, voiceDesignId: string): Promise<{ project: Project; voiceDesign: VoiceDesign }> {
    return request<{ project: Project; voiceDesign: VoiceDesign }>(`/projects/${projectId}/default-voice`, {
      method: 'POST',
      body: JSON.stringify({ voiceDesignId }),
    });
  },

  async designVoice(
    projectId: string,
    params: {
      name: string;
      promptInstruction: string;
      referenceText: string;
      speed: number;
      tonePreset: VoiceDesign['tonePreset'];
      narrationMood: VoiceDesign['narrationMood'];
    },
  ): Promise<VoiceDesign> {
    const response = await request<{ run: RunJob; voiceDesign: VoiceDesign }>(`/projects/${projectId}/voice-designs`, {
      method: 'POST',
      body: JSON.stringify({
        ...params,
        setAsDefault: false,
      }),
    });

    let latestVoiceDesign = response.voiceDesign;

    await awaitRunCompletion(projectId, response.run.id, (event) => {
      if (event.type === 'voice-design-update' && event.voiceDesign) {
        latestVoiceDesign = event.voiceDesign as VoiceDesign;
      }
    });

    return latestVoiceDesign;
  },

  async listAudios(projectId: string): Promise<GeneratedAudio[]> {
    const response = await request<unknown>(`/projects/${projectId}/audios`);
    return normalizeListResponse<GeneratedAudio>(response, `audios for project ${projectId}`);
  },

  async deleteAudio(projectId: string, audioId: string): Promise<void> {
    await request<{ status: string }>(`/projects/${projectId}/audios/${audioId}`, {
      method: 'DELETE',
    });
  },

  async generateAudio(
    projectId: string,
    segmentId: string,
    segmentIndex: number,
    designedVoiceId: string | null,
    _runId: string,
    onProgress: (progress: number) => void,
  ): Promise<GeneratedAudio> {
    const response = await request<{ run: RunJob }>(`/projects/${projectId}/generate-audios`, {
      method: 'POST',
      body: JSON.stringify({
        segmentIndices: [segmentIndex],
        designedVoiceId: designedVoiceId || undefined,
        clearExisting: false,
      }),
    });

    await awaitRunCompletion(projectId, response.run.id, (event) => {
      if (event.type === 'audio-update' && event.audio) {
        const audio = event.audio as GeneratedAudio;
        if (audio.segmentId !== segmentId) {
          return;
        }
        onProgress(audio.progress ?? 0);
      }
    });

    const allAudios = await mockApi.listAudios(projectId);
    const latest = allAudios.find((audio) => audio.segmentId === segmentId && audio.runId === response.run.id)
      || allAudios.find((audio) => audio.segmentId === segmentId);

    if (!latest) {
      throw new Error(`Audio generation did not return a result for segment ${segmentIndex + 1}`);
    }

    if (latest.status === 'failed') {
      throw new Error(`Audio generation failed for segment ${segmentIndex + 1}`);
    }

    return latest;
  },

  async listImages(projectId: string): Promise<GeneratedImage[]> {
    const response = await request<unknown>(`/projects/${projectId}/images`);
    return normalizeListResponse<GeneratedImage>(response, `images for project ${projectId}`);
  },

  async deleteImage(projectId: string, imageId: string): Promise<void> {
    await request<{ status: string }>(`/projects/${projectId}/images/${imageId}`, {
      method: 'DELETE',
    });
  },

  async generateImage(
    projectId: string,
    segmentId: string,
    segmentIndex: number,
    _prompt: string,
    _runId: string,
    onProgress: (progress: number) => void,
  ): Promise<GeneratedImage> {
    const response = await request<{ run: RunJob }>(`/projects/${projectId}/generate-images`, {
      method: 'POST',
      body: JSON.stringify({
        segmentIndices: [segmentIndex],
      }),
    });

    await awaitRunCompletion(projectId, response.run.id, (event) => {
      if (event.type === 'image-progress' && event.segmentIndex === segmentIndex) {
        const p = typeof event.progress === 'number' ? event.progress : 0;
        onProgress(p);
      }

      if (event.type === 'image-update' && event.image) {
        const image = event.image as GeneratedImage;
        if (image.segmentId !== segmentId) {
          return;
        }
        onProgress(image.progress ?? 0);
      }
    });

    const allImages = await mockApi.listImages(projectId);
    const latest = allImages.find((image) => image.segmentId === segmentId && image.runId === response.run.id)
      || allImages.find((image) => image.segmentId === segmentId);

    if (!latest) {
      throw new Error(`Image generation did not return a result for segment ${segmentIndex + 1}`);
    }

    if (latest.status === 'failed') {
      throw new Error(`Image generation failed for segment ${segmentIndex + 1}`);
    }

    return latest;
  },

  async listVideos(projectId: string): Promise<GeneratedVideo[]> {
    const response = await request<unknown>(`/projects/${projectId}/videos`);
    return normalizeListResponse<GeneratedVideo>(response, `videos for project ${projectId}`);
  },

  async deleteVideo(projectId: string, videoId: string): Promise<void> {
    await request<{ status: string }>(`/projects/${projectId}/videos/${videoId}`, {
      method: 'DELETE',
    });
  },

  async generateVideo(
    projectId: string,
    settings: VideoSettings,
    designedVoiceId: string | null,
    _runId: string,
    onStageUpdate: (stages: { label: string; status: 'running' | 'success' | 'failed'; progress: number }[]) => void,
  ): Promise<GeneratedVideo> {
    const response = await request<{ run: RunJob }>(`/projects/${projectId}/generate-video`, {
      method: 'POST',
      body: JSON.stringify({
        settings,
        designedVoiceId: designedVoiceId || undefined,
        autoGenerateAudios: true,
        autoGenerateImages: true,
      }),
    });

    await awaitRunCompletion(projectId, response.run.id, (event) => {
      if (event.type === 'video-stages' && event.stages) {
        const stages = (event.stages as VideoStage[]).map((stage) => ({
          label: stage.label,
          status: stage.status === 'idle' || stage.status === 'queued' ? 'running' : stage.status,
          progress: stage.progress,
        }));
        onStageUpdate(stages);
      }
    });

    const allVideos = await mockApi.listVideos(projectId);
    const latest = allVideos.find((video) => video.runId === response.run.id) || allVideos[0];

    if (!latest) {
      throw new Error('Video generation did not return an output');
    }

    if (latest.status === 'failed') {
      throw new Error('Video generation failed');
    }

    return latest;
  },

  async listRuns(projectId: string): Promise<RunJob[]> {
    const response = await request<unknown>(`/projects/${projectId}/runs`);
    return normalizeListResponse<RunJob>(response, `runs for project ${projectId}`);
  },

  createRunJob(projectId: string, type: RunJob['type'], label: string, itemIds: string[]): RunJob {
    return {
      id: generateId('run'),
      projectId,
      type,
      status: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
      itemIds,
      label,
    };
  },
};
