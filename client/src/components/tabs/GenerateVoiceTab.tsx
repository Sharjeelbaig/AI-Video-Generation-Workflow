import { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Checkbox from '@mui/material/Checkbox';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import type { DesignedVoiceAsset, GeneratedAudio, Project } from '../../types';
import StatusChip from '../common/StatusChip';
import ConfirmDialog from '../common/ConfirmDialog';
import MediaPreviewDialog, { type MediaPreviewTarget } from '../common/MediaPreviewDialog';
import { mockApi } from '../../services/mockApi';
import { useApp } from '../../store/AppContext';
import { parseScript } from '../../services/scriptParser';
import { exportAsset, filenameFromAssetUrl } from '../../services/fileExport';
import {
  formatOptionalSeconds,
  getPreferredOutputForSegment,
  partitionFreshOutputs,
} from '../../utils/outputStability';

interface Props {
  project: Project;
  designedVoices: DesignedVoiceAsset[];
  audios: GeneratedAudio[];
}

export default function GenerateVoiceTab({ project, designedVoices = [], audios = [] }: Props) {
  const { dispatch, toast, trackRun } = useApp();
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<GeneratedAudio | null>(null);
  const [previewTarget, setPreviewTarget] = useState<MediaPreviewTarget | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const safeDesignedVoices = useMemo(() => (Array.isArray(designedVoices) ? designedVoices : []), [designedVoices]);
  const safeAudios = useMemo(() => (Array.isArray(audios) ? audios : []), [audios]);
  const segments = parseScript(project.scriptContent, project.id);
  const { stale: staleAudios } = partitionFreshOutputs(safeAudios, project.scriptContent);
  const anyRunning = safeAudios.some((audio) => audio.status === 'running');

  useEffect(() => {
    if (safeDesignedVoices.length === 0) {
      setSelectedVoiceId('');
      return;
    }
    if (selectedVoiceId && !safeDesignedVoices.some((voice) => voice.id === selectedVoiceId)) {
      setSelectedVoiceId('');
    }
  }, [safeDesignedVoices, selectedVoiceId]);

  const getAudioStateForSegment = useCallback((segmentIndex: number) => (
    getPreferredOutputForSegment(safeAudios, segmentIndex, project.scriptContent)
  ), [project.scriptContent, safeAudios]);

  const toggleSelect = (segmentIndex: number) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(segmentIndex)) {
        next.delete(segmentIndex);
      } else {
        next.add(segmentIndex);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === segments.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(segments.map((segment) => segment.index)));
  };

  const startGeneration = async (
    segmentIndices: number[],
    label: string,
    successMessage: string,
    clearExisting = false,
  ) => {
    if (segmentIndices.length === 0) {
      toast('Select at least one segment', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const response = await mockApi.requestAudioGeneration(project.id, {
        segmentIndices,
        designedVoiceId: selectedVoiceId || null,
        clearExisting,
      });
      trackRun(project.id, {
        ...response.run,
        label,
      }, {
        successMessage,
        failureMessage: `${label} failed`,
      });
      setSelected(new Set());
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryFailed = async () => {
    const failedSegments = segments
      .filter((segment) => {
        const { record, stale } = getAudioStateForSegment(segment.index);
        return !stale && record?.status === 'failed';
      })
      .map((segment) => segment.index);

    if (failedSegments.length === 0) {
      toast('No failed segments to retry', 'info');
      return;
    }

    await startGeneration(
      failedSegments,
      `Retry ${failedSegments.length} failed voice segment${failedSegments.length > 1 ? 's' : ''}`,
      'Voice retry completed',
    );
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      await mockApi.deleteAudio(project.id, deleteTarget.id);
      dispatch({ type: 'DELETE_AUDIO', projectId: project.id, id: deleteTarget.id });
      toast('Audio deleted', 'info');
      setDeleteTarget(null);
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const failedCount = segments.filter((segment) => {
    const { record, stale } = getAudioStateForSegment(segment.index);
    return !stale && record?.status === 'failed';
  }).length;

  if (segments.length === 0) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="info">
          Your script is empty. Go to the <strong>Script</strong> tab to add content.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, height: '100%', overflow: 'auto' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} mb={3} spacing={2}>
        <Typography variant="h6" fontWeight={700}>Generate Voice</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button
            size="small"
            variant="outlined"
            onClick={() => void startGeneration(
              segments.map((segment) => segment.index),
              'Generate all voice segments',
              'Voice generation complete',
              true,
            )}
            disabled={submitting || anyRunning}
            startIcon={<GraphicEqIcon />}
          >
            All
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => void startGeneration(
              Array.from(selected),
              `Generate ${selected.size} selected voice segment${selected.size === 1 ? '' : 's'}`,
              `Generated ${selected.size} audio segment${selected.size === 1 ? '' : 's'}`,
            )}
            disabled={submitting || anyRunning || selected.size === 0}
          >
            Selected ({selected.size})
          </Button>
          {failedCount > 0 && (
            <Button
              size="small"
              variant="outlined"
              color="warning"
              onClick={() => void handleRetryFailed()}
              disabled={submitting || anyRunning}
              startIcon={<RefreshIcon />}
            >
              Retry Failed ({failedCount})
            </Button>
          )}
        </Stack>
      </Stack>

      {safeDesignedVoices.length === 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No reusable designed voices were found in the shared voice library. Create one in the Voice Design tab before generating narration.
        </Alert>
      )}

      {staleAudios.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {staleAudios.length} generated audio asset{staleAudios.length > 1 ? 's are' : ' is'} from an older script/parser state and should be regenerated before final export.
        </Alert>
      )}

      <Stack direction="row" spacing={2} alignItems="center" mb={3}>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel>Designed Voice</InputLabel>
          <Select value={selectedVoiceId} label="Designed Voice" onChange={(event) => setSelectedVoiceId(event.target.value)}>
            <MenuItem value="">Auto (latest shared voice)</MenuItem>
            {safeDesignedVoices.map((voice) => (
              <MenuItem key={voice.id} value={voice.id}>
                {voice.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Checkbox
            size="small"
            checked={selected.size === segments.length}
            indeterminate={selected.size > 0 && selected.size < segments.length}
            onChange={toggleAll}
          />
          <Typography variant="caption" color="text.secondary">Select all</Typography>
        </Stack>
      </Stack>

      <Stack spacing={1.5}>
        {segments.map((segment) => {
          const { record: audio, stale } = getAudioStateForSegment(segment.index);
          const status = audio?.status ?? 'idle';
          const progress = audio?.progress ?? 0;

          return (
            <Card
              key={segment.id}
              sx={{
                border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.4)}`,
                borderRadius: 2,
                opacity: status === 'failed' ? 0.85 : 1,
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                  <Checkbox
                    size="small"
                    checked={selected.has(segment.index)}
                    onChange={() => toggleSelect(segment.index)}
                    disabled={status === 'running'}
                  />
                  <Box flexGrow={1} minWidth={0}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.75}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="caption" fontWeight={700} sx={{ color: 'primary.main' }}>#{segment.index + 1}</Typography>
                        {segment.heading && (
                          <Chip label={segment.heading} size="small" sx={{ height: 18, fontSize: '0.62rem', maxWidth: 150 }} />
                        )}
                        {stale && status !== 'running' && (
                          <Chip label="Stale" size="small" color="warning" sx={{ height: 18, fontSize: '0.62rem' }} />
                        )}
                      </Stack>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <StatusChip status={status} />
                        {audio && (
                          <Typography variant="caption" color="text.secondary">{formatOptionalSeconds(audio.duration)}</Typography>
                        )}
                        {audio && status === 'success' && (
                          <>
                            <Tooltip title="Preview">
                              <span>
                                <IconButton
                                  size="small"
                                  sx={{ color: 'secondary.main' }}
                                  onClick={() => audio.audioUrl && setPreviewTarget({
                                    title: `Segment #${segment.index + 1}`,
                                    kind: 'audio',
                                    src: audio.audioUrl,
                                  })}
                                  disabled={!audio.audioUrl}
                                >
                                  <PlayArrowIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Export">
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={() => audio.audioUrl && exportAsset(
                                    audio.audioUrl,
                                    filenameFromAssetUrl(audio.audioUrl, `segment-${segment.index + 1}.wav`),
                                  ).catch((error: Error) => toast(error.message, 'error'))}
                                  disabled={!audio.audioUrl}
                                >
                                  <DownloadIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </>
                        )}
                        {audio && (
                          <Tooltip title="Delete">
                            <IconButton size="small" onClick={() => setDeleteTarget(audio)} sx={{ color: 'error.main' }}>
                              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {status !== 'running' && (
                          <Tooltip title={audio ? 'Regenerate' : 'Generate'}>
                            <IconButton
                              size="small"
                              onClick={() => void startGeneration(
                                [segment.index],
                                `${audio ? 'Regenerate' : 'Generate'} voice for segment ${segment.index + 1}`,
                                `Segment ${segment.index + 1} voice ready`,
                              )}
                              disabled={submitting || anyRunning}
                              sx={{ color: 'text.secondary' }}
                            >
                              <RefreshIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" fontSize="0.8rem" sx={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {segment.cleanText || <em style={{ opacity: 0.5 }}>No text content</em>}
                    </Typography>
                    {status === 'running' && (
                      <Box mt={1}>
                        <LinearProgress variant="indeterminate" color="primary" />
                        <Typography variant="caption" color="text.secondary">
                          {progress > 0 ? `${progress}%` : 'Waiting for generation…'}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Audio?"
        message="Delete this generated audio? This cannot be undone."
        confirmLabel="Delete"
        dangerous
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <MediaPreviewDialog media={previewTarget} onClose={() => setPreviewTarget(null)} />
    </Box>
  );
}
