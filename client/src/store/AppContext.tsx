import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import type {
  Project, VoiceDesign, DesignedVoiceAsset, GeneratedAudio, GeneratedImage, GeneratedVideo, RunJob, Toast
} from '../types';
import { generateId } from '../services/mockApi';
import { mockApi } from '../services/mockApi';

interface AppState {
  projects: Project[];
  designedVoices: DesignedVoiceAsset[];
  voiceDesigns: Record<string, VoiceDesign[]>;
  audios: Record<string, GeneratedAudio[]>;
  images: Record<string, GeneratedImage[]>;
  videos: Record<string, GeneratedVideo[]>;
  runs: Record<string, RunJob[]>;
  toasts: Toast[];
  initialized: boolean;
}

type AppAction =
  | { type: 'INIT'; payload: AppState }
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
  | { type: 'DELETE_VIDEO'; projectId: string; id: string }
  | { type: 'ADD_RUN'; projectId: string; payload: RunJob }
  | { type: 'UPDATE_RUN'; projectId: string; payload: RunJob }
  | { type: 'ADD_TOAST'; payload: Toast }
  | { type: 'REMOVE_TOAST'; payload: string };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'INIT': return { ...action.payload, initialized: true };
    case 'SET_PROJECTS': return { ...state, projects: action.payload };
    case 'ADD_PROJECT': return { ...state, projects: [...state.projects, action.payload] };
    case 'UPDATE_PROJECT': return {
      ...state,
      projects: state.projects.map(p => p.id === action.payload.id ? action.payload : p),
    };
    case 'DELETE_PROJECT': return {
      ...state,
      projects: state.projects.filter(p => p.id !== action.payload),
    };
    case 'SET_DESIGNED_VOICES': return { ...state, designedVoices: action.payload };
    case 'SET_VOICE_DESIGNS': return {
      ...state,
      voiceDesigns: { ...state.voiceDesigns, [action.projectId]: action.payload },
    };
    case 'ADD_VOICE_DESIGN': return {
      ...state,
      voiceDesigns: {
        ...state.voiceDesigns,
        [action.projectId]: [...(state.voiceDesigns[action.projectId] || []), action.payload],
      },
    };
    case 'UPDATE_VOICE_DESIGN': return {
      ...state,
      voiceDesigns: {
        ...state.voiceDesigns,
        [action.projectId]: (state.voiceDesigns[action.projectId] || []).map(
          v => v.id === action.payload.id ? action.payload : v
        ),
      },
    };
    case 'DELETE_VOICE_DESIGN': return {
      ...state,
      voiceDesigns: {
        ...state.voiceDesigns,
        [action.projectId]: (state.voiceDesigns[action.projectId] || []).filter(v => v.id !== action.id),
      },
    };
    case 'SET_AUDIOS': return {
      ...state,
      audios: { ...state.audios, [action.projectId]: action.payload },
    };
    case 'UPDATE_AUDIO': return {
      ...state,
      audios: {
        ...state.audios,
        [action.projectId]: (state.audios[action.projectId] || []).map(
          a => a.id === action.payload.id ? action.payload : a
        ).concat(
          (state.audios[action.projectId] || []).find(a => a.id === action.payload.id) ? [] : [action.payload]
        ),
      },
    };
    case 'DELETE_AUDIO': return {
      ...state,
      audios: {
        ...state.audios,
        [action.projectId]: (state.audios[action.projectId] || []).filter(a => a.id !== action.id),
      },
    };
    case 'SET_IMAGES': return {
      ...state,
      images: { ...state.images, [action.projectId]: action.payload },
    };
    case 'UPDATE_IMAGE': return {
      ...state,
      images: {
        ...state.images,
        [action.projectId]: (state.images[action.projectId] || []).map(
          i => i.id === action.payload.id ? action.payload : i
        ).concat(
          (state.images[action.projectId] || []).find(i => i.id === action.payload.id) ? [] : [action.payload]
        ),
      },
    };
    case 'DELETE_IMAGE': return {
      ...state,
      images: {
        ...state.images,
        [action.projectId]: (state.images[action.projectId] || []).filter(i => i.id !== action.id),
      },
    };
    case 'SET_VIDEOS': return {
      ...state,
      videos: { ...state.videos, [action.projectId]: action.payload },
    };
    case 'ADD_VIDEO': return {
      ...state,
      videos: {
        ...state.videos,
        [action.projectId]: [...(state.videos[action.projectId] || []), action.payload],
      },
    };
    case 'UPDATE_VIDEO': return {
      ...state,
      videos: {
        ...state.videos,
        [action.projectId]: (state.videos[action.projectId] || []).map(
          v => v.id === action.payload.id ? action.payload : v
        ),
      },
    };
    case 'DELETE_VIDEO': return {
      ...state,
      videos: {
        ...state.videos,
        [action.projectId]: (state.videos[action.projectId] || []).filter(v => v.id !== action.id),
      },
    };
    case 'ADD_RUN': return {
      ...state,
      runs: {
        ...state.runs,
        [action.projectId]: [...(state.runs[action.projectId] || []), action.payload],
      },
    };
    case 'UPDATE_RUN': return {
      ...state,
      runs: {
        ...state.runs,
        [action.projectId]: (state.runs[action.projectId] || []).map(
          r => r.id === action.payload.id ? action.payload : r
        ),
      },
    };
    case 'ADD_TOAST': return { ...state, toasts: [...state.toasts, action.payload] };
    case 'REMOVE_TOAST': return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
    default: return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  toast: (message: string, severity?: Toast['severity']) => void;
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
  initialized: false,
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [projectsResult, designedVoicesResult] = await Promise.allSettled([
          mockApi.listProjects(),
          mockApi.listDesignedVoices(),
        ]);

        const projects = projectsResult.status === 'fulfilled' ? projectsResult.value : [];
        const designedVoices = designedVoicesResult.status === 'fulfilled' ? designedVoicesResult.value : [];

        const voiceDesigns: Record<string, VoiceDesign[]> = {};
        const audios: Record<string, GeneratedAudio[]> = {};
        const images: Record<string, GeneratedImage[]> = {};
        const videos: Record<string, GeneratedVideo[]> = {};
        const runs: Record<string, RunJob[]> = {};

        await Promise.all(
          projects.map(async (project) => {
            const [
              projectVoiceDesigns,
              projectAudios,
              projectImages,
              projectVideos,
              projectRuns,
            ] = await Promise.allSettled([
              mockApi.listVoiceDesigns(project.id),
              mockApi.listAudios(project.id),
              mockApi.listImages(project.id),
              mockApi.listVideos(project.id),
              mockApi.listRuns(project.id),
            ]);

            voiceDesigns[project.id] = projectVoiceDesigns.status === 'fulfilled' ? projectVoiceDesigns.value : [];
            audios[project.id] = projectAudios.status === 'fulfilled' ? projectAudios.value : [];
            images[project.id] = projectImages.status === 'fulfilled' ? projectImages.value : [];
            videos[project.id] = projectVideos.status === 'fulfilled' ? projectVideos.value : [];
            runs[project.id] = projectRuns.status === 'fulfilled' ? projectRuns.value : [];
          }),
        );

        if (!mounted) {
          return;
        }

        dispatch({
          type: 'INIT',
          payload: {
            projects,
            designedVoices,
            voiceDesigns,
            audios,
            images,
            videos,
            runs,
            toasts: [],
            initialized: true,
          },
        });
      } catch {
        if (!mounted) {
          return;
        }

        dispatch({
          type: 'INIT',
          payload: {
            projects: [],
            designedVoices: [],
            voiceDesigns: {},
            audios: {},
            images: {},
            videos: {},
            runs: {},
            toasts: [],
            initialized: true,
          },
        });
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const toast = useCallback((message: string, severity: Toast['severity'] = 'info') => {
    const id = generateId('toast');
    dispatch({ type: 'ADD_TOAST', payload: { id, message, severity } });
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', payload: id }), 4500);
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, toast }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
