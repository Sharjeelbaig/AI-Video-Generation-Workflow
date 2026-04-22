import { useCallback, useState } from 'react';
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
import type { GeneratedImage, Project } from '../../types';
import StatusChip from '../common/StatusChip';
import ConfirmDialog from '../common/ConfirmDialog';
import { mockApi } from '../../services/mockApi';
import { useApp } from '../../store/AppContext';
import { parseScript } from '../../services/scriptParser';
import { exportAsset, filenameFromAssetUrl } from '../../services/fileExport';
import {
  getPreferredOutputForSegment,
  partitionFreshOutputs,
} from '../../utils/outputStability';

interface Props {
  project: Project;
  images: GeneratedImage[];
}

export default function GenerateImagesTab({ project, images }: Props) {
  const { dispatch, toast, trackRun } = useApp();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<GeneratedImage | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const segments = parseScript(project.scriptContent, project.id);
  const segmentsWithPrompts = segments.filter((segment) => segment.imagePrompt);
  const segmentsWithoutPrompts = segments.filter((segment) => !segment.imagePrompt);
  const { stale: staleImages } = partitionFreshOutputs(images, project.scriptContent);
  const anyRunning = images.some((image) => image.status === 'running');

  const getImageStateForSegment = useCallback((segmentIndex: number) => (
    getPreferredOutputForSegment(images, segmentIndex, project.scriptContent)
  ), [images, project.scriptContent]);

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

  const startGeneration = async (
    segmentIndices: number[],
    label: string,
    successMessage: string,
  ) => {
    if (segmentIndices.length === 0) {
      toast('Select at least one prompt-backed segment', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const response = await mockApi.requestImageGeneration(project.id, {
        segmentIndices,
        width: project.videoSettings.width,
        height: project.videoSettings.height,
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
    const failedSegments = segmentsWithPrompts
      .filter((segment) => {
        const { record, stale } = getImageStateForSegment(segment.index);
        return !stale && record?.status === 'failed';
      })
      .map((segment) => segment.index);

    if (failedSegments.length === 0) {
      toast('No failed images to retry', 'info');
      return;
    }

    await startGeneration(
      failedSegments,
      `Retry ${failedSegments.length} failed image${failedSegments.length === 1 ? '' : 's'}`,
      'Image retry completed',
    );
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
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
          <Button
            size="small"
            variant="outlined"
            onClick={() => void startGeneration(
              segmentsWithPrompts.map((segment) => segment.index),
              `Generate ${segmentsWithPrompts.length} scene image${segmentsWithPrompts.length === 1 ? '' : 's'}`,
              'Image generation complete',
            )}
            disabled={submitting || anyRunning || segmentsWithPrompts.length === 0}
            startIcon={<ImageOutlinedIcon />}
          >
            All
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => void startGeneration(
              Array.from(selected),
              `Generate ${selected.size} selected image${selected.size === 1 ? '' : 's'}`,
              `Generated ${selected.size} image${selected.size === 1 ? '' : 's'}`,
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
          {staleImages.length} generated image{staleImages.length > 1 ? 's are' : ' is'} tied to an older script/parser state and should be regenerated before render.
        </Alert>
      )}

      <Stack direction="row" alignItems="center" spacing={0.5} mb={2}>
        <Checkbox
          size="small"
          checked={selected.size === segmentsWithPrompts.length && segmentsWithPrompts.length > 0}
          indeterminate={selected.size > 0 && selected.size < segmentsWithPrompts.length}
          onChange={() => {
            if (selected.size === segmentsWithPrompts.length) {
              setSelected(new Set());
            } else {
              setSelected(new Set(segmentsWithPrompts.map((segment) => segment.index)));
            }
          }}
        />
        <Typography variant="caption" color="text.secondary">Select all with prompts</Typography>
      </Stack>

      <Grid container spacing={2}>
        {segmentsWithPrompts.map((segment) => {
          const { record: image, stale } = getImageStateForSegment(segment.index);
          const status = image?.status ?? 'idle';

          return (
            <Grid key={segment.id} size={{ xs: 12, sm: 6, lg: 4 }}>
              <Card sx={{ border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.4)}`, borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ position: 'relative' }}>
                  {image?.thumbnailUrl ? (
                    <CardMedia
                      component="img"
                      image={image.thumbnailUrl}
                      alt={segment.imagePrompt ?? ''}
                      sx={{ height: 140, objectFit: 'cover' }}
                    />
                  ) : (
                    <Box sx={{
                      height: 140,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05),
                      border: (theme) => `1px dashed ${alpha(theme.palette.primary.main, 0.2)}`,
                    }}>
                      <ImageOutlinedIcon sx={{ fontSize: 40, color: 'text.secondary', opacity: 0.6 }} />
                    </Box>
                  )}
                  {status === 'running' && (
                    <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
                      <LinearProgress variant="indeterminate" sx={{ height: 3 }} />
                    </Box>
                  )}
                  <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
                    <Checkbox
                      size="small"
                      checked={selected.has(segment.index)}
                      onChange={() => toggleSelect(segment.index)}
                      disabled={status === 'running'}
                      sx={{ bgcolor: (theme) => alpha(theme.palette.background.paper, 0.8), borderRadius: 1, p: 0.25 }}
                    />
                  </Box>
                  <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {stale && status !== 'running' && (
                        <Chip label="Stale" size="small" color="warning" sx={{ height: 20, fontSize: '0.62rem' }} />
                      )}
                      <StatusChip status={status} />
                    </Stack>
                  </Box>
                </Box>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box flexGrow={1} minWidth={0} mr={1}>
                      <Typography variant="caption" fontWeight={700} color="primary.main" display="block">Seg #{segment.index + 1}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        fontSize: '0.72rem',
                      }}>
                        {segment.imagePrompt}
                      </Typography>
                      {image && (
                        <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                          {image.width}×{image.height}
                        </Typography>
                      )}
                    </Box>
                    <Stack direction="row" spacing={0.25}>
                      {image?.thumbnailUrl && (
                        <Tooltip title="Export">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => image.thumbnailUrl && exportAsset(
                                image.thumbnailUrl,
                                filenameFromAssetUrl(image.thumbnailUrl, `segment-${segment.index + 1}.png`),
                              ).catch((error: Error) => toast(error.message, 'error'))}
                              disabled={!image.thumbnailUrl}
                            >
                              <DownloadIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                      {image && (
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => setDeleteTarget(image)} sx={{ color: 'error.main' }}>
                            <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title={image ? 'Regenerate' : 'Generate'}>
                        <IconButton
                          size="small"
                          disabled={submitting || anyRunning}
                          onClick={() => void startGeneration(
                            [segment.index],
                            `${image ? 'Regenerate' : 'Generate'} image for segment ${segment.index + 1}`,
                            `Image for segment ${segment.index + 1} is ready`,
                          )}
                        >
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
          textAlign: 'center',
          py: 8,
          border: (theme) => `2px dashed ${alpha(theme.palette.divider, 0.4)}`,
          borderRadius: 3,
          mt: 3,
        }}>
          <ImageNotSupportedIcon sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.65, mb: 1 }} />
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
