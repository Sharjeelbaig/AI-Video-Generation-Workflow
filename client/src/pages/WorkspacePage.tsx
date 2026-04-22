import { startTransition, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import WorkspaceLayout, { type TabId } from '../components/workspace/WorkspaceLayout';
import OverviewTab from '../components/tabs/OverviewTab';
import ScriptTab from '../components/tabs/ScriptTab';
import VoiceDesignTab from '../components/tabs/VoiceDesignTab';
import GenerateVoiceTab from '../components/tabs/GenerateVoiceTab';
import GenerateImagesTab from '../components/tabs/GenerateImagesTab';
import GenerateVideoTab from '../components/tabs/GenerateVideoTab';
import OutputsTab from '../components/tabs/OutputsTab';
import { useApp } from '../store/AppContext';
import ErrorBoundary from '../components/common/ErrorBoundary';

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { state, loadProjectResources } = useApp();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  useEffect(() => {
    if (!projectId) {
      return;
    }
    void loadProjectResources(projectId);
  }, [loadProjectResources, projectId]);

  if (!state.initialized) {
    return (
      <Box sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Typography color="text.secondary">Loading...</Typography>
      </Box>
    );
  }

  const project = state.projects.find(p => p.id === projectId);
  const loadState = projectId ? state.projectLoadState[projectId] : undefined;

  if (!project) {
    return (
      <Box sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}>
        <Typography variant="h5" fontWeight={700}>Project not found</Typography>
        <Typography color="text.secondary">The project you are looking for does not exist.</Typography>
        <Button
          variant="contained"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/')}
        >
          Back to Projects
        </Button>
      </Box>
    );
  }

  const voiceDesigns = state.voiceDesigns[project.id] || [];
  const audios = state.audios[project.id] || [];
  const images = state.images[project.id] || [];
  const videos = state.videos[project.id] || [];
  const runs = state.runs[project.id] || [];

  return (
    <Box
      sx={{
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'fixed', inset: 0,
          background: `radial-gradient(ellipse 50% 30% at 80% 20%, rgba(6,182,212,0.04) 0%, transparent 60%),
                       radial-gradient(ellipse 40% 30% at 10% 80%, rgba(245,158,11,0.03) 0%, transparent 60%)`,
          pointerEvents: 'none', zIndex: 0,
        },
      }}
    >
      <WorkspaceLayout
        project={project}
        activeTab={activeTab}
        onTabChange={(tab) => startTransition(() => setActiveTab(tab))}
      >
        <Box
          key={activeTab}
          sx={{
            height: '100%',
            animation: 'tabFadeIn 0.2s ease',
            '@keyframes tabFadeIn': {
              from: { opacity: 0, transform: 'translateY(8px)' },
              to: { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          <ErrorBoundary title="Workspace panel failed">
            {loadState?.error && (
              <Alert
                severity="warning"
                action={(
                  <Button color="inherit" size="small" onClick={() => void loadProjectResources(project.id)}>
                    Retry
                  </Button>
                )}
                sx={{ mx: { xs: 2, md: 4 }, mt: { xs: 2, md: 3 } }}
              >
                {loadState.error}
              </Alert>
            )}

            {loadState?.loading && !loadState.loaded && (
              <Stack
                alignItems="center"
                justifyContent="center"
                sx={{ minHeight: 280, px: 3 }}
              >
                <Typography color="text.secondary">Loading project workspace…</Typography>
              </Stack>
            )}

            {activeTab === 'overview' && (
              <OverviewTab
                project={project}
                voiceDesigns={voiceDesigns}
                audios={audios}
                images={images}
                videos={videos}
                runs={runs}
                onNavigate={setActiveTab}
              />
            )}
            {activeTab === 'script' && (
              <ScriptTab project={project} />
            )}
            {activeTab === 'voice-design' && (
              <VoiceDesignTab project={project} voiceDesigns={voiceDesigns} />
            )}
            {activeTab === 'generate-voice' && (
              <GenerateVoiceTab project={project} designedVoices={state.designedVoices} audios={audios} />
            )}
            {activeTab === 'generate-images' && (
              <GenerateImagesTab project={project} images={images} />
            )}
            {activeTab === 'generate-video' && (
              <GenerateVideoTab
                project={project}
                audios={audios}
                images={images}
                videos={videos}
                designedVoices={state.designedVoices}
              />
            )}
            {activeTab === 'outputs' && (
              <OutputsTab
                project={project}
                voiceDesigns={voiceDesigns}
                audios={audios}
                images={images}
                videos={videos}
                onNavigate={setActiveTab}
              />
            )}
          </ErrorBoundary>
        </Box>
      </WorkspaceLayout>
    </Box>
  );
}
