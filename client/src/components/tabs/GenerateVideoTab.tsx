import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import type {
  DesignedVoiceAsset,
  GeneratedAudio,
  GeneratedImage,
  GeneratedVideo,
  Project,
  VideoSettings,
  VideoStage,
} from '../../types';
import StatusChip from '../common/StatusChip';
import ConfirmDialog from '../common/ConfirmDialog';
import MediaPreviewDialog, { type MediaPreviewTarget } from '../common/MediaPreviewDialog';
import { mockApi } from '../../services/mockApi';
import { useApp } from '../../store/AppContext';
import { parseScript } from '../../services/scriptParser';
import { exportAsset, filenameFromAssetUrl } from '../../services/fileExport';
import { validateVideoSettings } from '../../services/validation';
import {
  countStaleOutputs,
  formatOptionalRoundedSeconds,
  isStaleOutputRecord,
  partitionFreshOutputs,
} from '../../utils/outputStability';

interface Props {
  project: Project;
  designedVoices: DesignedVoiceAsset[];
  audios: GeneratedAudio[];
  images: GeneratedImage[];
  videos: GeneratedVideo[];
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.75}>{label}</Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <Box
          component="input"
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          sx={{ width: 36, height: 28, border: 'none', borderRadius: 1, cursor: 'pointer', p: 0, bgcolor: 'transparent' }}
        />
        <Typography variant="caption" fontFamily="monospace">{value}</Typography>
      </Stack>
    </Box>
  );
}

function StageRow({ stage }: { stage: VideoStage }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1.5} py={1}>
      {stage.status === 'success' ? (
        <CheckCircleOutlineIcon sx={{ fontSize: 18, color: 'success.main', flexShrink: 0 }} />
      ) : stage.status === 'running' ? (
        <Box sx={{ width: 18, height: 18, flexShrink: 0 }}>
          <LinearProgress variant="determinate" value={stage.progress} sx={{ borderRadius: 1, mt: 0.75 }} />
        </Box>
      ) : (
        <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: 'text.disabled', flexShrink: 0 }} />
      )}
      <Typography
        variant="body2"
        fontWeight={stage.status === 'running' ? 600 : 400}
        color={stage.status === 'success' ? 'success.main' : stage.status === 'running' ? 'text.primary' : 'text.secondary'}
      >
        {stage.label}
      </Typography>
      {stage.status === 'running' && (
        <Typography variant="caption" color="text.secondary">{stage.progress}%</Typography>
      )}
    </Stack>
  );
}

export default function GenerateVideoTab({
  project,
  designedVoices = [],
  audios = [],
  images = [],
  videos = [],
}: Props) {
  const { dispatch, toast, trackRun } = useApp();
  const [settings, setSettings] = useState<VideoSettings>(project.videoSettings);
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [previewTarget, setPreviewTarget] = useState<MediaPreviewTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GeneratedVideo | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const safeDesignedVoices = useMemo(() => (Array.isArray(designedVoices) ? designedVoices : []), [designedVoices]);
  const safeAudios = useMemo(() => (Array.isArray(audios) ? audios : []), [audios]);
  const safeImages = useMemo(() => (Array.isArray(images) ? images : []), [images]);
  const safeVideos = useMemo(() => (Array.isArray(videos) ? videos : []), [videos]);

  useEffect(() => {
    setSettings(project.videoSettings);
  }, [project.videoSettings]);

  useEffect(() => {
    if (safeDesignedVoices.length === 0) {
      setSelectedVoiceId('');
      return;
    }
    if (selectedVoiceId && !safeDesignedVoices.some((voice) => voice.id === selectedVoiceId)) {
      setSelectedVoiceId('');
    }
  }, [safeDesignedVoices, selectedVoiceId]);

  const segments = parseScript(project.scriptContent, project.id);
  const { fresh: freshAudios } = partitionFreshOutputs(safeAudios, project.scriptContent);
  const { fresh: freshImages } = partitionFreshOutputs(safeImages, project.scriptContent);
  const matchedAudio = segments.filter((segment) => freshAudios.some((audio) => audio.segmentIndex === segment.index && audio.status === 'success'));
  const scenesWithImages = segments.filter((segment) => freshImages.some((image) => image.segmentIndex === segment.index && image.status === 'success'));
  const fallbackScenes = segments.filter((segment) => !freshImages.some((image) => image.segmentIndex === segment.index && image.status === 'success'));
  const staleAudioCount = countStaleOutputs(safeAudios, project.scriptContent);
  const staleImageCount = countStaleOutputs(safeImages, project.scriptContent);
  const staleVideoCount = countStaleOutputs(safeVideos, project.scriptContent);
  const runningVideo = safeVideos.find((video) => video.status === 'running');
  const anyRunning = !!runningVideo;

  const updateSetting = <K extends keyof VideoSettings>(key: K, value: VideoSettings[K]) => {
    setSettings((previous) => ({ ...previous, [key]: value }));
  };

  const handleGenerate = async () => {
    const validation = validateVideoSettings(settings);
    if (!validation.success) {
      toast(validation.message, 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const response = await mockApi.requestVideoGeneration(project.id, {
        settings: validation.data,
        designedVoiceId: selectedVoiceId || null,
        autoGenerateAudios: true,
        autoGenerateImages: true,
      });
      dispatch({
        type: 'UPDATE_PROJECT',
        payload: {
          ...project,
          videoSettings: validation.data,
        },
      });
      trackRun(project.id, response.run, {
        successMessage: 'Video generated successfully',
        failureMessage: 'Video generation failed',
      });
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      await mockApi.deleteVideo(project.id, deleteTarget.id);
      dispatch({ type: 'DELETE_VIDEO', projectId: project.id, id: deleteTarget.id });
      toast('Video deleted', 'info');
      setDeleteTarget(null);
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, height: '100%', overflow: 'auto' }}>
      <Typography variant="h6" fontWeight={700} mb={3}>Generate Video</Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} mb={2.5}>Video Settings</Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 4 }}>
                  <TextField
                    label="Width"
                    type="number"
                    size="small"
                    fullWidth
                    value={settings.width}
                    onChange={(event) => updateSetting('width', Number(event.target.value))}
                  />
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <TextField
                    label="Height"
                    type="number"
                    size="small"
                    fullWidth
                    value={settings.height}
                    onChange={(event) => updateSetting('height', Number(event.target.value))}
                  />
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <TextField
                    label="FPS"
                    type="number"
                    size="small"
                    fullWidth
                    value={settings.fps}
                    onChange={(event) => updateSetting('fps', Number(event.target.value))}
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    label="Font Family"
                    size="small"
                    fullWidth
                    value={settings.fontFamily}
                    onChange={(event) => updateSetting('fontFamily', event.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    label="Arabic Font"
                    size="small"
                    fullWidth
                    value={settings.arabicFontFamily}
                    onChange={(event) => updateSetting('arabicFontFamily', event.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Divider sx={{ my: 0.5 }}><Typography variant="caption" color="text.secondary">Colors</Typography></Divider>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <ColorInput label="Body" value={settings.bodyColor} onChange={(value) => updateSetting('bodyColor', value)} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <ColorInput label="Heading" value={settings.headingColor} onChange={(value) => updateSetting('headingColor', value)} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <ColorInput label="SubHeading" value={settings.subHeadingColor} onChange={(value) => updateSetting('subHeadingColor', value)} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <ColorInput label="Background" value={settings.backgroundColor} onChange={(value) => updateSetting('backgroundColor', value)} />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Divider sx={{ my: 0.5 }}><Typography variant="caption" color="text.secondary">Options</Typography></Divider>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    label="Words/Scene"
                    type="number"
                    size="small"
                    fullWidth
                    value={settings.wordsPerScene}
                    onChange={(event) => updateSetting('wordsPerScene', Number(event.target.value))}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 8 }}>
                  <TextField
                    label="Output Filename"
                    size="small"
                    fullWidth
                    value={settings.outputFilename}
                    onChange={(event) => updateSetting('outputFilename', event.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Designed Voice (optional)</InputLabel>
                    <Select
                      value={selectedVoiceId}
                      label="Designed Voice (optional)"
                      onChange={(event) => setSelectedVoiceId(event.target.value)}
                    >
                      <MenuItem value="">Auto (latest shared voice)</MenuItem>
                      {safeDesignedVoices.map((voice) => (
                        <MenuItem key={voice.id} value={voice.id}>{voice.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <FormControlLabel
                    control={<Switch checked={settings.separatorLine} onChange={(event) => updateSetting('separatorLine', event.target.checked)} size="small" />}
                    label={<Typography variant="body2">Separator Line</Typography>}
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <FormControlLabel
                    control={<Switch checked={settings.fadeTransition} onChange={(event) => updateSetting('fadeTransition', event.target.checked)} size="small" />}
                    label={<Typography variant="body2">Fade Transition</Typography>}
                  />
                </Grid>
                {settings.fadeTransition && (
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      label="Fade Duration (s)"
                      type="number"
                      size="small"
                      value={settings.fadeTransitionDuration}
                      onChange={(event) => updateSetting('fadeTransitionDuration', Number(event.target.value))}
                      inputProps={{ step: 0.1, min: 0.1, max: 2 }}
                      sx={{ maxWidth: 180 }}
                    />
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>Summary</Typography>
              {(staleAudioCount > 0 || staleImageCount > 0 || staleVideoCount > 0) && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  {[
                    staleAudioCount > 0 ? `${staleAudioCount} stale audio` : null,
                    staleImageCount > 0 ? `${staleImageCount} stale image` : null,
                    staleVideoCount > 0 ? `${staleVideoCount} stale video` : null,
                  ].filter(Boolean).join(', ')} asset{staleAudioCount + staleImageCount + staleVideoCount > 1 ? 's are' : ' is'} visible for inspection but will not be reused for a new render.
                </Alert>
              )}
              <Stack spacing={1.5}>
                {[
                  { label: 'Total segments', value: segments.length, color: 'text.primary' },
                  { label: 'Matched audio', value: matchedAudio.length, color: matchedAudio.length > 0 ? 'success.main' : 'warning.main' },
                  { label: 'Scenes with images', value: scenesWithImages.length, color: scenesWithImages.length > 0 ? 'info.main' : 'text.secondary' },
                  { label: 'Fallback scenes', value: fallbackScenes.length, color: fallbackScenes.length > 0 ? 'warning.main' : 'success.main' },
                ].map((item) => (
                  <Stack key={item.label} direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                    <Chip label={item.value} size="small" sx={{ fontWeight: 700, color: item.color }} />
                  </Stack>
                ))}
                <Divider />
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Resolution</Typography>
                  <Typography variant="body2" fontWeight={600}>{settings.width}×{settings.height} @ {settings.fps}fps</Typography>
                </Stack>
              </Stack>

              <Button
                variant="contained"
                fullWidth
                onClick={() => void handleGenerate()}
                disabled={submitting || anyRunning}
                startIcon={<MovieOutlinedIcon />}
                sx={{ mt: 3 }}
              >
                {submitting || anyRunning ? 'Generating…' : 'Generate Video'}
              </Button>
              <Typography variant="caption" color="text.secondary" display="block" mt={1} textAlign="center">
                Missing audio and image assets are generated automatically before rendering.
              </Typography>
            </CardContent>
          </Card>

          {runningVideo && runningVideo.stages.length > 0 && (
            <Card sx={{ border: (theme) => `1px solid ${alpha(theme.palette.primary.main, 0.3)}` }}>
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="subtitle2" fontWeight={700} mb={1.5}>Generation Progress</Typography>
                <Stack divider={<Divider />}>
                  {runningVideo.stages.map((stage, index) => <StageRow key={`${runningVideo.id}-${index}`} stage={stage} />)}
                </Stack>
              </CardContent>
            </Card>
          )}
        </Grid>

        {safeVideos.length > 0 && (
          <Grid size={12}>
            <Typography variant="subtitle1" fontWeight={700} mb={2}>Generated Videos</Typography>
            <Grid container spacing={2}>
              {safeVideos.map((video) => (
                <Grid key={video.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Card sx={{ borderRadius: 2, overflow: 'hidden' }}>
                    {video.thumbnailUrl ? (
                      <CardMedia component="img" image={video.thumbnailUrl} sx={{ height: 160, objectFit: 'cover' }} />
                    ) : (
                      <Box sx={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05) }}>
                        <MovieOutlinedIcon sx={{ fontSize: 48, opacity: 0.65 }} />
                      </Box>
                    )}
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box>
                          <Typography variant="body2" fontWeight={700}>{video.filename}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatOptionalRoundedSeconds(video.duration)} · {video.settings.width}×{video.settings.height}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          {isStaleOutputRecord(video, project.scriptContent) && (
                            <Chip label="Stale" size="small" color="warning" sx={{ height: 20, fontSize: '0.62rem' }} />
                          )}
                          <StatusChip status={video.status} />
                        </Stack>
                      </Stack>
                      <Stack direction="row" spacing={0.5} mt={1}>
                        <Tooltip title="Preview">
                          <span>
                            <IconButton
                              size="small"
                              sx={{ color: 'secondary.main' }}
                              onClick={() => video.videoUrl && setPreviewTarget({
                                title: video.filename,
                                kind: 'video',
                                src: video.videoUrl,
                              })}
                              disabled={!video.videoUrl}
                            >
                              <PlayArrowIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Export">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => video.videoUrl && exportAsset(
                                video.videoUrl,
                                filenameFromAssetUrl(video.videoUrl, video.filename),
                              ).catch((error: Error) => toast(error.message, 'error'))}
                              disabled={!video.videoUrl}
                            >
                              <DownloadIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => setDeleteTarget(video)} sx={{ color: 'error.main' }}>
                            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Grid>
        )}
      </Grid>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Video?"
        message={`Delete "${deleteTarget?.filename}"? This cannot be undone.`}
        confirmLabel="Delete"
        dangerous
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <MediaPreviewDialog media={previewTarget} onClose={() => setPreviewTarget(null)} />
    </Box>
  );
}
