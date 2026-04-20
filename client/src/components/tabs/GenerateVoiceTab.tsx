import { useState, useCallback, useEffect } from 'react';
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
import type { Project, DesignedVoiceAsset, GeneratedAudio, ScriptSegment } from '../../types';
import StatusChip from '../common/StatusChip';
import ConfirmDialog from '../common/ConfirmDialog';
import { mockApi, generateId } from '../../services/mockApi';
import { useApp } from '../../store/AppContext';
import { parseScript } from '../../services/scriptParser';
import {
  formatOptionalSeconds,
  getPreferredOutputForSegment,
  isStaleOutputRecord,
  partitionFreshOutputs,
} from '../../utils/outputStability';

interface Props {
  project: Project;
  designedVoices: DesignedVoiceAsset[];
  audios: GeneratedAudio[];
}

export default function GenerateVoiceTab({ project, designedVoices = [], audios = [] }: Props) {
  const { dispatch, toast } = useApp();
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [running, setRunning] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<Record<number, number>>({});
  const [deleteTarget, setDeleteTarget] = useState<GeneratedAudio | null>(null);

  const safeDesignedVoices = Array.isArray(designedVoices) ? designedVoices : [];
  const safeAudios = Array.isArray(audios) ? audios : [];
  const segments = parseScript(project.scriptContent, project.id);
  const { stale: staleAudios } = partitionFreshOutputs(safeAudios, project.scriptContent);

  useEffect(() => {
    if (safeDesignedVoices.length === 0) {
      setSelectedVoiceId('');
      return;
    }
    if (!selectedVoiceId) {
      return;
    }
    const hasSelection = safeDesignedVoices.some((voice) => voice.id === selectedVoiceId);
    if (!hasSelection) {
      setSelectedVoiceId('');
    }
  }, [safeDesignedVoices, selectedVoiceId]);

  const getAudioStateForSegment = useCallback((idx: number) => (
    getPreferredOutputForSegment(safeAudios, idx, project.scriptContent)
  ), [project.scriptContent, safeAudios]);

  const toggleSelect = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === segments.length) setSelected(new Set());
    else setSelected(new Set(segments.map((_, i) => i)));
  };

  const generateSegment = async (seg: ScriptSegment, runId: string) => {
    const idx = seg.index;
    setRunning(prev => new Set(prev).add(idx));
    setProgress(prev => ({ ...prev, [idx]: 0 }));

    const tempId = generateId('aud');
    dispatch({
      type: 'UPDATE_AUDIO',
      projectId: project.id,
      payload: {
        id: tempId, projectId: project.id, segmentId: seg.id, segmentIndex: idx,
        voiceDesignId: selectedVoiceId || 'auto', status: 'running', progress: 0,
        audioUrl: null, duration: null, createdAt: new Date().toISOString(), runId,
      },
    });

    try {
      const audio = await mockApi.generateAudio(
        project.id, seg.id, idx, selectedVoiceId || null, runId,
        p => {
          setProgress(prev => ({ ...prev, [idx]: p }));
          dispatch({
            type: 'UPDATE_AUDIO', projectId: project.id,
            payload: { id: tempId, projectId: project.id, segmentId: seg.id, segmentIndex: idx,
              voiceDesignId: selectedVoiceId || 'auto', status: 'running', progress: p,
              audioUrl: null, duration: null, createdAt: new Date().toISOString(), runId },
          });
        }
      );
      const existing = safeAudios.find(a => (
        a.segmentIndex === idx && !isStaleOutputRecord(a, project.scriptContent)
      ));
      dispatch({
        type: 'UPDATE_AUDIO', projectId: project.id,
        payload: { ...audio, id: existing?.id || audio.id },
      });
    } catch {
      dispatch({
        type: 'UPDATE_AUDIO', projectId: project.id,
        payload: { id: tempId, projectId: project.id, segmentId: seg.id, segmentIndex: idx,
          voiceDesignId: selectedVoiceId || 'auto', status: 'failed', progress: 0,
          audioUrl: null, duration: null, createdAt: new Date().toISOString(), runId },
      });
    } finally {
      setRunning(prev => { const n = new Set(prev); n.delete(idx); return n; });
      setProgress(prev => { const n = { ...prev }; delete n[idx]; return n; });
    }
  };

  const handleGenerateAll = async () => {
    const runId = generateId('run');
    const run = mockApi.createRunJob(project.id, 'generate-voice', 'Generate all voice segments', segments.map(s => s.id));
    dispatch({ type: 'ADD_RUN', projectId: project.id, payload: run });
    dispatch({ type: 'UPDATE_PROJECT', payload: { ...project, status: 'running', updatedAt: new Date().toISOString() } });
    toast('Starting voice generation for all segments', 'info');
    for (const segment of segments) {
      await generateSegment(segment, runId);
    }
    dispatch({ type: 'UPDATE_RUN', projectId: project.id, payload: { ...run, status: 'success', completedAt: new Date().toISOString() } });
    try {
      const refreshedProject = await mockApi.getProject(project.id);
      dispatch({ type: 'UPDATE_PROJECT', payload: refreshedProject });
    } catch {
      dispatch({ type: 'UPDATE_PROJECT', payload: { ...project, status: 'success', updatedAt: new Date().toISOString() } });
    }
    toast('Voice generation complete', 'success');
  };

  const handleGenerateSelected = async () => {
    if (selected.size === 0) { toast('Select segments first', 'warning'); return; }
    const runId = generateId('run');
    const segs = segments.filter(s => selected.has(s.index));
    const run = mockApi.createRunJob(project.id, 'generate-voice', `Generate ${segs.length} voice segments`, segs.map(s => s.id));
    dispatch({ type: 'ADD_RUN', projectId: project.id, payload: run });
    for (const segment of segs) {
      await generateSegment(segment, runId);
    }
    dispatch({ type: 'UPDATE_RUN', projectId: project.id, payload: { ...run, status: 'success', completedAt: new Date().toISOString() } });
    toast(`Generated ${segs.length} audio segments`, 'success');
    setSelected(new Set());
  };

  const handleRetryFailed = async () => {
    const failed = segments.filter((segment) => {
      const { record, stale } = getAudioStateForSegment(segment.index);
      return !stale && record?.status === 'failed';
    });
    if (failed.length === 0) { toast('No failed segments to retry', 'info'); return; }
    const runId = generateId('run');
    const run = mockApi.createRunJob(project.id, 'generate-voice', `Retry ${failed.length} failed segments`, failed.map(s => s.id));
    dispatch({ type: 'ADD_RUN', projectId: project.id, payload: run });
    for (const segment of failed) {
      await generateSegment(segment, runId);
    }
    dispatch({ type: 'UPDATE_RUN', projectId: project.id, payload: { ...run, status: 'success', completedAt: new Date().toISOString() } });
    toast('Retry complete', 'success');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
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
  const anyRunning = running.size > 0;

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
          <Button size="small" variant="outlined" onClick={handleGenerateAll} disabled={anyRunning} startIcon={<GraphicEqIcon />}>
            All
          </Button>
          <Button size="small" variant="outlined" onClick={handleGenerateSelected} disabled={anyRunning || selected.size === 0}>
            Selected ({selected.size})
          </Button>
          {failedCount > 0 && (
            <Button size="small" variant="outlined" color="warning" onClick={handleRetryFailed} disabled={anyRunning}
              startIcon={<RefreshIcon />}>
              Retry Failed ({failedCount})
            </Button>
          )}
        </Stack>
      </Stack>

      {safeDesignedVoices.length === 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No reusable designed voices were found in <strong>outputs/audios/designed</strong>.
          Create one in the Voice Design tab before generating narration.
        </Alert>
      )}

      {staleAudios.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {staleAudios.length} generated audio asset{staleAudios.length > 1 ? 's are' : ' is'} from an older
          script/parser state and will not be reused until regenerated.
        </Alert>
      )}

      <Stack direction="row" spacing={2} alignItems="center" mb={3}>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel>Designed Voice</InputLabel>
          <Select value={selectedVoiceId} label="Designed Voice" onChange={e => setSelectedVoiceId(e.target.value)}>
            <MenuItem value="">Auto (latest global voice)</MenuItem>
            {safeDesignedVoices.map(voice => (
              <MenuItem key={voice.id} value={voice.id}>
                {voice.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Checkbox size="small" checked={selected.size === segments.length} indeterminate={selected.size > 0 && selected.size < segments.length} onChange={toggleAll} />
          <Typography variant="caption" color="text.secondary">Select all</Typography>
        </Stack>
      </Stack>

      <Stack spacing={1.5}>
        {segments.map(seg => {
          const { record: audio, stale } = getAudioStateForSegment(seg.index);
          const isRunning = running.has(seg.index);
          const prog = progress[seg.index] ?? (audio?.progress ?? 0);
          const status = isRunning ? 'running' : (audio?.status ?? 'idle');

          return (
            <Card key={seg.id} sx={{
              border: t => `1px solid ${alpha(t.palette.divider, 0.4)}`,
              borderRadius: 2,
              opacity: status === 'failed' ? 0.85 : 1,
            }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                  <Checkbox
                    size="small"
                    checked={selected.has(seg.index)}
                    onChange={() => toggleSelect(seg.index)}
                    disabled={isRunning}
                  />
                  <Box flexGrow={1} minWidth={0}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.75}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="caption" fontWeight={700} sx={{ color: 'primary.main' }}>#{seg.index + 1}</Typography>
                        {seg.heading && <Chip label={seg.heading} size="small" sx={{ height: 18, fontSize: '0.62rem', maxWidth: 150 }} />}
                        {stale && !isRunning && (
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
                              <IconButton size="small" sx={{ color: 'secondary.main' }}><PlayArrowIcon sx={{ fontSize: 16 }} /></IconButton>
                            </Tooltip>
                            <Tooltip title="Download">
                              <IconButton size="small"><DownloadIcon sx={{ fontSize: 16 }} /></IconButton>
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
                            <IconButton size="small" onClick={() => {
                              const runId = generateId('run');
                              generateSegment(seg, runId);
                            }} disabled={anyRunning} sx={{ color: 'text.secondary' }}>
                              <RefreshIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" fontSize="0.8rem" sx={{
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {seg.cleanText || <em style={{ opacity: 0.5 }}>No text content</em>}
                    </Typography>
                    {isRunning && (
                      <Box mt={1}>
                        <LinearProgress variant="determinate" value={prog} color="primary" />
                        <Typography variant="caption" color="text.secondary">{prog}%</Typography>
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
    </Box>
  );
}
