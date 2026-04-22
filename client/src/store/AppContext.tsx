/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import type {
  AppSettings,
  GeneratedAudio,
  GeneratedImage,
  GeneratedVideo,
  Project,
  RunEvent,
  RunJob,
  Toast,
  VoiceDesign,
} from '../types';
import { generateId, mockApi } from '../services/mockApi';
import type { DesignedVoiceAsset } from '../types';

type ProjectLoadState = {
  loading: boolean;
  loaded: boolean;
  error: string | null;
};

interface AppState {
  projects: Project[];
  designedVoices: DesignedVoiceAsset[];
  voiceDesigns: Record<string, VoiceDesign[]>;
  audios: Record<string, GeneratedAudio[]>;
  images: Record<string, GeneratedImage[]>;
  videos: Record<string, GeneratedVideo[]>;
  runs: Record<string, RunJob[]>;
  toasts: Toast[];
  settings: AppSettings | null;
  initialized: boolean;
  initializationError: string | null;
  projectLoadState: Record<string, ProjectLoadState>;
}

type AppAction =
  | { type: 'INIT'; payload: Pick<AppState, 'projects' | 'designedVoices' | 'settings' | 'initializationError'> }
  | { type: 'SET_PROJECTS'; payload: Project[] }
  | { type: 'ADD_PROJECT'; payload: Project }
  | { type: 'UPDATE_PROJECT'; payload: Project }
  | { type: 'DELETE_PROJECT'; payload: string }
  | { type: 'SET_DESIGNED_VOICES'; payload: DesignedVoiceAsset[] }
  | { type: 'SET_VOICE_DESIGNS'; projectId: string; payload: VoiceDesign[] }
  | { type: 'ADD_VOICE_DESIGN'; projectId: string; payload: VoiceDesign }
  | { type: 'UPDATE_VOICE_DESIGN'; projectId: string; payload: VoiceDesign }
  | { type: 'DELETE_VOICE_DESIGN'; projectId: string; id: string }
  | { type: 'SET_AUDIOS'; projectId: string; payload: GeneratedAudio[] }
  | { type: 'UPDATE_AUDIO'; projectId: string; payload: GeneratedAudio }
  | { type: 'DELETE_AUDIO'; projectId: string; id: string }
  | { type: 'SET_IMAGES'; projectId: string; payload: GeneratedImage[] }
  | { type: 'UPDATE_IMAGE'; projectId: string; payload: GeneratedImage }
  | { type: 'DELETE_IMAGE'; projectId: string; id: string }
  | { type: 'SET_VIDEOS'; projectId: string; payload: GeneratedVideo[] }
  | { type: 'ADD_VIDEO'; projectId: string; payload: GeneratedVideo }
  | { type: 'UPDATE_VIDEO'; projectId: string; payload: GeneratedVideo }
  | { type: 'UPDATE_VIDEO_STAGES'; projectId: string; runId: string; stages: GeneratedVideo['stages'] }
  | { type: 'DELETE_VIDEO'; projectId: string; id: string }
  | { type: 'SET_RUNS'; projectId: string; payload: RunJob[] }
  | { type: 'ADD_RUN'; projectId: string; payload: RunJob }
  | { type: 'UPDATE_RUN'; projectId: string; payload: RunJob }
  | { type: 'ADD_TOAST'; payload: Toast }
  | { type: 'REMOVE_TOAST'; payload: string }
  | { type: 'SET_SETTINGS'; payload: AppSettings | null }
  | { type: 'SET_INITIALIZATION_ERROR'; payload: string | null }
  | { type: 'SET_PROJECT_LOAD_STATE'; projectId: string; payload: Partial<ProjectLoadState> };

function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index === -1) {
    return [nextItem, ...items];
  }
  const next = [...items];
  next[index] = nextItem;
  return next;
}

function omitRecordEntry<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'INIT':
      return {
        ...state,
        ...action.payload,
        initialized: true,
      };
    case 'SET_PROJECTS':
      return { ...state, projects: action.payload };
    case 'ADD_PROJECT':
      return { ...state, projects: upsertById(state.projects, action.payload) };
    case 'UPDATE_PROJECT':
      return { ...state, projects: upsertById(state.projects, action.payload) };
    case 'DELETE_PROJECT': {
      return {
        ...state,
        projects: state.projects.filter((project) => project.id !== action.payload),
        voiceDesigns: omitRecordEntry(state.voiceDesigns, action.payload),
        audios: omitRecordEntry(state.audios, action.payload),
        images: omitRecordEntry(state.images, action.payload),
        videos: omitRecordEntry(state.videos, action.payload),
        runs: omitRecordEntry(state.runs, action.payload),
        projectLoadState: omitRecordEntry(state.projectLoadState, action.payload),
      };
    }
    case 'SET_DESIGNED_VOICES':
      return { ...state, designedVoices: action.payload };
    case 'SET_VOICE_DESIGNS':
      return {
        ...state,
        voiceDesigns: { ...state.voiceDesigns, [action.projectId]: action.payload },
      };
    case 'ADD_VOICE_DESIGN':
    case 'UPDATE_VOICE_DESIGN':
      return {
        ...state,
        voiceDesigns: {
          ...state.voiceDesigns,
          [action.projectId]: upsertById(state.voiceDesigns[action.projectId] || [], action.payload),
        },
      };
    case 'DELETE_VOICE_DESIGN':
      return {
        ...state,
        voiceDesigns: {
          ...state.voiceDesigns,
          [action.projectId]: (state.voiceDesigns[action.projectId] || []).filter((voiceDesign) => voiceDesign.id !== action.id),
        },
      };
    case 'SET_AUDIOS':
      return {
        ...state,
        audios: { ...state.audios, [action.projectId]: action.payload },
      };
    case 'UPDATE_AUDIO':
      return {
        ...state,
        audios: {
          ...state.audios,
          [action.projectId]: upsertById(state.audios[action.projectId] || [], action.payload),
        },
      };
    case 'DELETE_AUDIO':
      return {
        ...state,
        audios: {
          ...state.audios,
          [action.projectId]: (state.audios[action.projectId] || []).filter((audio) => audio.id !== action.id),
        },
      };
    case 'SET_IMAGES':
      return {
        ...state,
        images: { ...state.images, [action.projectId]: action.payload },
      };
    case 'UPDATE_IMAGE':
      return {
        ...state,
        images: {
          ...state.images,
          [action.projectId]: upsertById(state.images[action.projectId] || [], action.payload),
        },
      };
    case 'DELETE_IMAGE':
      return {
        ...state,
        images: {
          ...state.images,
          [action.projectId]: (state.images[action.projectId] || []).filter((image) => image.id !== action.id),
        },
      };
    case 'SET_VIDEOS':
      return {
        ...state,
        videos: { ...state.videos, [action.projectId]: action.payload },
      };
    case 'ADD_VIDEO':
    case 'UPDATE_VIDEO':
      return {
        ...state,
        videos: {
          ...state.videos,
          [action.projectId]: upsertById(state.videos[action.projectId] || [], action.payload),
        },
      };
    case 'UPDATE_VIDEO_STAGES':
      return {
        ...state,
        videos: {
          ...state.videos,
          [action.projectId]: (state.videos[action.projectId] || []).map((video) => (
            video.runId === action.runId
              ? {
                ...video,
                stages: action.stages,
                progress: Math.max(...action.stages.map((stage) => stage.progress), 0),
              }
              : video
          )),
        },
      };
    case 'DELETE_VIDEO':
      return {
        ...state,
        videos: {
          ...state.videos,
          [action.projectId]: (state.videos[action.projectId] || []).filter((video) => video.id !== action.id),
        },
      };
    case 'SET_RUNS':
      return {
        ...state,
        runs: { ...state.runs, [action.projectId]: action.payload },
      };
    case 'ADD_RUN':
    case 'UPDATE_RUN':
      return {
        ...state,
        runs: {
          ...state.runs,
          [action.projectId]: upsertById(state.runs[action.projectId] || [], action.payload),
        },
      };
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.payload] };
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter((toast) => toast.id !== action.payload) };
    case 'SET_SETTINGS':
      return { ...state, settings: action.payload };
    case 'SET_INITIALIZATION_ERROR':
      return { ...state, initializationError: action.payload };
    case 'SET_PROJECT_LOAD_STATE':
      return {
        ...state,
        projectLoadState: {
          ...state.projectLoadState,
          [action.projectId]: {
            ...(state.projectLoadState[action.projectId] || {
              loading: false,
              loaded: false,
              error: null,
            }),
            ...action.payload,
          },
        },
      };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  toast: (message: string, severity?: Toast['severity']) => void;
  reloadAppData: () => Promise<void>;
  loadProjectResources: (projectId: string, options?: { silent?: boolean }) => Promise<void>;
  refreshDesignedVoices: () => Promise<void>;
  trackRun: (
    projectId: string,
    run: RunJob,
    options?: {
      successMessage?: string;
      failureMessage?: string;
      refreshDesignedVoices?: boolean;
    },
  ) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const initialState: AppState = {
  projects: [],
  designedVoices: [],
  voiceDesigns: {},
  audios: {},
  images: {},
  videos: {},
  runs: {},
  toasts: [],
  settings: null,
  initialized: false,
  initializationError: null,
  projectLoadState: {},
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const trackersRef = useRef(new Map<string, () => void>());

  const toast = useCallback((message: string, severity: Toast['severity'] = 'info') => {
    const id = generateId('toast');
    dispatch({ type: 'ADD_TOAST', payload: { id, message, severity } });
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', payload: id }), 4500);
  }, []);

  const refreshDesignedVoices = useCallback(async () => {
    const designedVoices = await mockApi.listDesignedVoices();
    dispatch({ type: 'SET_DESIGNED_VOICES', payload: designedVoices });
  }, []);

  const loadProjectResources = useCallback(async (projectId: string, options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      dispatch({
        type: 'SET_PROJECT_LOAD_STATE',
        projectId,
        payload: { loading: true, error: null },
      });
    }

    try {
      const [
        projectResult,
        scriptResult,
        voiceDesignsResult,
        audiosResult,
        imagesResult,
        videosResult,
        runsResult,
      ] = await Promise.allSettled([
        mockApi.getProject(projectId),
        mockApi.getScript(projectId),
        mockApi.listVoiceDesigns(projectId),
        mockApi.listAudios(projectId),
        mockApi.listImages(projectId),
        mockApi.listVideos(projectId),
        mockApi.listRuns(projectId),
      ]);

      if (projectResult.status === 'fulfilled') {
        dispatch({ type: 'UPDATE_PROJECT', payload: projectResult.value });
      }

      if (scriptResult.status === 'fulfilled') {
        dispatch({ type: 'UPDATE_PROJECT', payload: scriptResult.value.project });
      }

      if (voiceDesignsResult.status === 'fulfilled') {
        dispatch({ type: 'SET_VOICE_DESIGNS', projectId, payload: voiceDesignsResult.value });
      }
      if (audiosResult.status === 'fulfilled') {
        dispatch({ type: 'SET_AUDIOS', projectId, payload: audiosResult.value });
      }
      if (imagesResult.status === 'fulfilled') {
        dispatch({ type: 'SET_IMAGES', projectId, payload: imagesResult.value });
      }
      if (videosResult.status === 'fulfilled') {
        dispatch({ type: 'SET_VIDEOS', projectId, payload: videosResult.value });
      }
      if (runsResult.status === 'fulfilled') {
        dispatch({ type: 'SET_RUNS', projectId, payload: runsResult.value });
      }

      const firstFailure = [
        projectResult,
        scriptResult,
        voiceDesignsResult,
        audiosResult,
        imagesResult,
        videosResult,
        runsResult,
      ].find((result) => result.status === 'rejected');

      dispatch({
        type: 'SET_PROJECT_LOAD_STATE',
        projectId,
        payload: {
          loading: false,
          loaded: true,
          error: firstFailure?.status === 'rejected' ? firstFailure.reason?.message || 'Failed to load project data' : null,
        },
      });
    } catch (error) {
      dispatch({
        type: 'SET_PROJECT_LOAD_STATE',
        projectId,
        payload: {
          loading: false,
          loaded: false,
          error: error instanceof Error ? error.message : 'Failed to load project data',
        },
      });
      throw error;
    }
  }, []);

  const handleRunEvent = useCallback((projectId: string, runId: string, event: RunEvent) => {
    switch (event.type) {
      case 'run-snapshot':
      case 'run-update':
      case 'run-completed':
      case 'run-failed':
        dispatch({ type: 'UPDATE_RUN', projectId, payload: event.run });
        break;
      case 'voice-design-update':
        dispatch({ type: 'UPDATE_VOICE_DESIGN', projectId, payload: event.voiceDesign });
        break;
      case 'audio-update':
        dispatch({ type: 'UPDATE_AUDIO', projectId, payload: event.audio });
        break;
      case 'image-update':
        dispatch({ type: 'UPDATE_IMAGE', projectId, payload: event.image });
        break;
      case 'video-update':
        dispatch({ type: 'UPDATE_VIDEO', projectId, payload: event.video });
        break;
      case 'video-stages':
        dispatch({ type: 'UPDATE_VIDEO_STAGES', projectId, runId, stages: event.stages });
        break;
      case 'run-error':
        toast(event.message, 'warning');
        break;
      default:
        break;
    }
  }, [toast]);

  const trackRun = useCallback((
    projectId: string,
    run: RunJob,
    options: {
      successMessage?: string;
      failureMessage?: string;
      refreshDesignedVoices?: boolean;
    } = {},
  ) => {
    if (trackersRef.current.has(run.id)) {
      return;
    }

    let fallbackStarted = false;
    let pollTimer: number | undefined;
    let closed = false;

    const cleanup = () => {
      closed = true;
      if (pollTimer) {
        window.clearTimeout(pollTimer);
      }
      const stop = trackersRef.current.get(run.id);
      stop?.();
      trackersRef.current.delete(run.id);
    };

    const finalize = async (finalRun: RunJob) => {
      cleanup();
      if (options.refreshDesignedVoices) {
        try {
          await refreshDesignedVoices();
        } catch {
          // Best effort refresh only.
        }
      }
      try {
        await loadProjectResources(projectId, { silent: true });
      } catch {
        // Best effort refresh only.
      }

      if (finalRun.status === 'success' && options.successMessage) {
        toast(options.successMessage, 'success');
      } else if (finalRun.status === 'failed') {
        toast(options.failureMessage || `${run.label} failed`, 'error');
      }
    };

    const pollRunStatus = async (attempt = 0) => {
      if (closed) {
        return;
      }

      try {
        const latestRun = await mockApi.getRun(projectId, run.id);
        dispatch({ type: 'UPDATE_RUN', projectId, payload: latestRun });
        if (latestRun.status === 'success' || latestRun.status === 'failed') {
          await finalize(latestRun);
          return;
        }
      } catch (error) {
        if (attempt >= 5) {
          toast(error instanceof Error ? error.message : 'Unable to refresh run status', 'error');
          cleanup();
          return;
        }
      }

      const nextDelay = Math.min(10000, 1500 * (attempt + 1));
      pollTimer = window.setTimeout(() => {
        void pollRunStatus(attempt + 1);
      }, nextDelay);
    };

    const stop = mockApi.subscribeToRun(projectId, run.id, {
      onEvent: (event) => {
        handleRunEvent(projectId, run.id, event);
        if (event.type === 'run-completed' || event.type === 'run-failed') {
          void finalize(event.run);
        }
      },
      onError: (error) => {
        if (closed || fallbackStarted) {
          return;
        }
        fallbackStarted = true;
        toast(`Live updates were interrupted for "${run.label}". Retrying in the background.`, 'warning');
        stop();
        trackersRef.current.delete(run.id);
        void pollRunStatus(error.message ? 0 : 1);
      },
    });

    trackersRef.current.set(run.id, stop);
    dispatch({ type: 'ADD_RUN', projectId, payload: run });
  }, [handleRunEvent, loadProjectResources, refreshDesignedVoices, toast]);

  const reloadAppData = useCallback(async () => {
    try {
      dispatch({ type: 'SET_INITIALIZATION_ERROR', payload: null });

      const [settingsResult, projectsResult, designedVoicesResult] = await Promise.allSettled([
        mockApi.getSettings(),
        mockApi.listProjects(),
        mockApi.listDesignedVoices(),
      ]);

      const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : null;
      const projects = projectsResult.status === 'fulfilled' ? projectsResult.value : [];
      const designedVoices = designedVoicesResult.status === 'fulfilled' ? designedVoicesResult.value : [];

      dispatch({
        type: 'INIT',
        payload: {
          projects,
          designedVoices,
          settings,
          initializationError: null,
        },
      });

      await Promise.allSettled(projects.map((project) => loadProjectResources(project.id, { silent: true })));
    } catch (error) {
      dispatch({
        type: 'INIT',
        payload: {
          projects: [],
          designedVoices: [],
          settings: null,
          initializationError: error instanceof Error ? error.message : 'Unable to connect to the backend',
        },
      });
    }
  }, [loadProjectResources]);

  useEffect(() => {
    void reloadAppData();

    const trackers = trackersRef.current;
    return () => {
      trackers.forEach((stop) => stop());
      trackers.clear();
    };
  }, [reloadAppData]);

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        toast,
        reloadAppData,
        loadProjectResources,
        refreshDesignedVoices,
        trackRun,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
