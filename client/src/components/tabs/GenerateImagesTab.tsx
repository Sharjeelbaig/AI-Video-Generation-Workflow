import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Checkbox from '@mui/material/Checkbox';
import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import ImageNotSupportedIcon from '@mui/icons-material/ImageNotSupported';
import type { Project, GeneratedImage, ScriptSegment } from '../../types';
import StatusChip from '../common/StatusChip';
import ConfirmDialog from '../common/ConfirmDialog';
import { mockApi, generateId } from '../../services/mockApi';
import { useApp } from '../../store/AppContext';
import { parseScript } from '../../services/scriptParser';
import {
  getPreferredOutputForSegment,
  isStaleOutputRecord,
  partitionFreshOutputs,
} from '../../utils/outputStability';

interface Props {
  project: Project;
  images: GeneratedImage[];
}

export default function GenerateImagesTab({ project, images }: Props) {
  const { dispatch, toast } = useApp();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [running, setRunning] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<Record<number, number>>({});
  const [deleteTarget, setDeleteTarget] = useState<GeneratedImage | null>(null);

  const segments = parseScript(project.scriptContent, project.id);
  const segmentsWithPrompts = segments.filter(s => s.imagePrompt);
  const segmentsWithoutPrompts = segments.filter(s => !s.imagePrompt);
  const { stale: staleImages } = partitionFreshOutputs(images, project.scriptContent);

  const getImageStateForSegment = useCallback((idx: number) => (
    getPreferredOutputForSegment(images, idx, project.scriptContent)
  ), [images, project.scriptContent]);

  const toggleSelect = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const generateSegment = async (seg: ScriptSegment, runId: string) => {
    if (!seg.imagePrompt) return;
    const idx = seg.index;
    setRunning(prev => new Set(prev).add(idx));
    setProgress(prev => ({ ...prev, [idx]: 0 }));

    const tempId = generateId('img');
    dispatch({
      type: 'UPDATE_IMAGE',
      projectId: project.id,
      payload: {
        id: tempId, projectId: project.id, segmentId: seg.id, segmentIndex: idx,
        prompt: seg.imagePrompt!, status: 'running', progress: 0,
        thumbnailUrl: null, width: 1920, height: 1080,
        createdAt: new Date().toISOString(), runId,
      },
    });

    try {
      const img = await mockApi.generateImage(
        project.id, seg.id, idx, seg.imagePrompt!, runId,
        p => {
          setProgress(prev => ({ ...prev, [idx]: p }));
          dispatch({
            type: 'UPDATE_IMAGE', projectId: project.id,
            payload: { id: tempId, projectId: project.id, segmentId: seg.id, segmentIndex: idx,
              prompt: seg.imagePrompt!, status: 'running', progress: p,
              thumbnailUrl: null, width: 1920, height: 1080, createdAt: new Date().toISOString(), runId },
          });
        }
      );
      const existing = images.find(image => (
        image.segmentIndex === idx && !isStaleOutputRecord(image, project.scriptContent)
      ));
      dispatch({ type: 'UPDATE_IMAGE', projectId: project.id, payload: { ...img, id: existing?.id || img.id } });
    } catch {
      dispatch({
        type: 'UPDATE_IMAGE', projectId: project.id,
        payload: { id: tempId, projectId: project.id, segmentId: seg.id, segmentIndex: idx,
          prompt: seg.imagePrompt!, status: 'failed', progress: 0,
          thumbnailUrl: null, width: 1920, height: 1080, createdAt: new Date().toISOString(), runId },
      });
    } finally {
      setRunning(prev => { const n = new Set(prev); n.delete(idx); return n; });
      setProgress(prev => { const n = { ...prev }; delete n[idx]; return n; });
    }
  };

  const handleGenerateAll = async () => {
    const runId = generateId('run');
    const run = mockApi.createRunJob(project.id, 'generate-images', `Generate all ${segmentsWithPrompts.length} images`, segmentsWithPrompts.map(s => s.id));
    dispatch({ type: 'ADD_RUN', projectId: project.id, payload: run });
    toast(`Generating ${segmentsWithPrompts.length} images`, 'info');
    for (const segment of segmentsWithPrompts) {
      await generateSegment(segment, runId);
    }
    dispatch({ type: 'UPDATE_RUN', projectId: project.id, payload: { ...run, status: 'success', completedAt: new Date().toISOString() } });
    toast('Image generation complete', 'success');
  };

  const handleGenerateSelected = async () => {
    if (selected.size === 0) { toast('Select segments first', 'warning'); return; }
    const segs = segmentsWithPrompts.filter(s => selected.has(s.index));
    const runId = generateId('run');
    const run = mockApi.createRunJob(project.id, 'generate-images', `Generate ${segs.length} images`, segs.map(s => s.id));
    dispatch({ type: 'ADD_RUN', projectId: project.id, payload: run });
    for (const segment of segs) {
      await generateSegment(segment, runId);
    }
    dispatch({ type: 'UPDATE_RUN', projectId: project.id, payload: { ...run, status: 'success', completedAt: new Date().toISOString() } });
    toast(`Generated ${segs.length} images`, 'success');
    setSelected(new Set());
  };

  const handleRetryFailed = async () => {
    const failed = segmentsWithPrompts.filter((segment) => {
      const { record, stale } = getImageStateForSegment(segment.index);
      return !stale && record?.status === 'failed';
    });
    if (failed.length === 0) { toast('No failed images to retry', 'info'); return; }
    const runId = generateId('run');
    const run = mockApi.createRunJob(project.id, 'generate-images', `Retry ${failed.length} images`, failed.map(s => s.id));
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
      await mockApi.deleteImage(project.id, deleteTarget.id);
      dispatch({ type: 'DELETE_IMAGE', projectId: project.id, id: deleteTarget.id });
      toast('Image deleted', 'info');
      setDeleteTarget(null);
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const failedCount = segmentsWithPrompts.filter((segment) => {
    const { record, stale } = getImageStateForSegment(segment.index);
    return !stale && record?.status === 'failed';
  }).length;
  const anyRunning = running.size > 0;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, height: '100%', overflow: 'auto' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} mb={3} spacing={2}>
        <Box>
          <Typography variant="h6" fontWeight={700}>Generate Images</Typography>
          <Typography variant="caption" color="text.secondary">
            {segmentsWithPrompts.length} of {segments.length} segments have image prompts
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button size="small" variant="outlined" onClick={handleGenerateAll} disabled={anyRunning} startIcon={<ImageOutlinedIcon />}>
            All
          </Button>
          <Button size="small" variant="outlined" onClick={handleGenerateSelected} disabled={anyRunning || selected.size === 0}>
            Selected ({selected.size})
          </Button>
          {failedCount > 0 && (
            <Button size="small" variant="outlined" color="warning" onClick={handleRetryFailed} disabled={anyRunning}
              startIcon={<RefreshIcon />}>
              Retry ({failedCount})
            </Button>
          )}
        </Stack>
      </Stack>

      {segmentsWithoutPrompts.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }} icon={<ImageNotSupportedIcon />}>
          {segmentsWithoutPrompts.length} segment{segmentsWithoutPrompts.length > 1 ? 's' : ''} missing image prompts.
          Add <code>&lt;image&gt;...&lt;/image&gt;</code> tags in the Script tab.
        </Alert>
      )}

      {staleImages.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {staleImages.length} generated image{staleImages.length > 1 ? 's are' : ' is'} tied to an older
          script/parser state and will not be reused until regenerated.
        </Alert>
      )}

      <Stack direction="row" alignItems="center" spacing={0.5} mb={2}>
        <Checkbox
          size="small"
          checked={selected.size === segmentsWithPrompts.length && segmentsWithPrompts.length > 0}
          indeterminate={selected.size > 0 && selected.size < segmentsWithPrompts.length}
          onChange={() => {
            if (selected.size === segmentsWithPrompts.length) setSelected(new Set());
            else setSelected(new Set(segmentsWithPrompts.map(s => s.index)));
          }}
        />
        <Typography variant="caption" color="text.secondary">Select all with prompts</Typography>
      </Stack>

      <Grid container spacing={2}>
        {segmentsWithPrompts.map(seg => {
          const { record: img, stale } = getImageStateForSegment(seg.index);
          const isRunning = running.has(seg.index);
          const prog = progress[seg.index] ?? (img?.progress ?? 0);
          const status = isRunning ? 'running' : (img?.status ?? 'idle');

          return (
            <Grid key={seg.id} size={{ xs: 12, sm: 6, lg: 4 }}>
              <Card sx={{ border: t => `1px solid ${alpha(t.palette.divider, 0.4)}`, borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ position: 'relative' }}>
                  {img?.thumbnailUrl ? (
                    <CardMedia
                      component="img"
                      image={img.thumbnailUrl}
                      alt={seg.imagePrompt ?? ''}
                      sx={{ height: 140, objectFit: 'cover' }}
                    />
                  ) : (
                    <Box sx={{
                      height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: t => alpha(t.palette.primary.main, 0.05),
                      border: t => `1px dashed ${alpha(t.palette.primary.main, 0.2)}`,
                    }}>
                      <ImageOutlinedIcon sx={{ fontSize: 40, color: 'text.secondary', opacity: 0.3 }} />
                    </Box>
                  )}
                  {isRunning && (
                    <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
                      <LinearProgress variant="determinate" value={prog} sx={{ height: 3 }} />
                    </Box>
                  )}
                  <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
                    <Checkbox
                      size="small"
                      checked={selected.has(seg.index)}
                      onChange={() => toggleSelect(seg.index)}
                      disabled={isRunning}
                      sx={{ bgcolor: t => alpha(t.palette.background.paper, 0.8), borderRadius: 1, p: 0.25 }}
                    />
                  </Box>
                    <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {stale && !isRunning && <Chip label="Stale" size="small" color="warning" sx={{ height: 20, fontSize: '0.62rem' }} />}
                      <StatusChip status={status} />
                    </Stack>
                  </Box>
                </Box>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box flexGrow={1} minWidth={0} mr={1}>
                      <Typography variant="caption" fontWeight={700} color="primary.main" display="block">Seg #{seg.index + 1}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '0.72rem',
                      }}>
                        {seg.imagePrompt}
                      </Typography>
                      {img && (
                        <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                          {img.width}×{img.height}
                        </Typography>
                      )}
                    </Box>
                    <Stack direction="row" spacing={0.25}>
                      {img?.thumbnailUrl && (
                        <Tooltip title="Download">
                          <IconButton size="small"><DownloadIcon sx={{ fontSize: 14 }} /></IconButton>
                        </Tooltip>
                      )}
                      {img && (
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => setDeleteTarget(img)} sx={{ color: 'error.main' }}>
                            <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title={img ? 'Regenerate' : 'Generate'}>
                        <IconButton size="small" disabled={anyRunning} onClick={() => generateSegment(seg, generateId('run'))}>
                          <RefreshIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {segmentsWithPrompts.length === 0 && (
        <Box sx={{
          textAlign: 'center', py: 8,
          border: t => `2px dashed ${alpha(t.palette.divider, 0.4)}`,
          borderRadius: 3, mt: 3,
        }}>
          <ImageNotSupportedIcon sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.3, mb: 1 }} />
          <Typography variant="body1" color="text.secondary" fontWeight={600}>No image prompts found</Typography>
          <Typography variant="body2" color="text.secondary">
            Add <code>&lt;image&gt;your prompt&lt;/image&gt;</code> tags to your script segments
          </Typography>
        </Box>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Image?"
        message="Delete this generated image? This cannot be undone."
        confirmLabel="Delete"
        dangerous
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}
