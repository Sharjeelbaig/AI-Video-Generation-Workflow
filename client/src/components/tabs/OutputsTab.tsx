import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import RecordVoiceOverOutlinedIcon from '@mui/icons-material/RecordVoiceOverOutlined';
import type { Project, VoiceDesign, GeneratedAudio, GeneratedImage, GeneratedVideo } from '../../types';
import StatusChip from '../common/StatusChip';
import EmptyState from '../common/EmptyState';
import ConfirmDialog from '../common/ConfirmDialog';
import MediaPreviewDialog, { type MediaPreviewTarget } from '../common/MediaPreviewDialog';
import { useApp } from '../../store/AppContext';
import { mockApi } from '../../services/mockApi';
import {
  formatOptionalRoundedSeconds,
  formatOptionalSeconds,
  isStaleOutputRecord,
} from '../../utils/outputStability';

interface Props {
  project: Project;
  voiceDesigns: VoiceDesign[];
  audios: GeneratedAudio[];
  images: GeneratedImage[];
  videos: GeneratedVideo[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function OutputsTab({ project, voiceDesigns, audios, images, videos }: Props) {
  const { dispatch, toast } = useApp();
  const safeVoiceDesigns = Array.isArray(voiceDesigns) ? voiceDesigns : [];
  const safeAudios = Array.isArray(audios) ? audios : [];
  const safeImages = Array.isArray(images) ? images : [];
  const safeVideos = Array.isArray(videos) ? videos : [];
  const [tabIdx, setTabIdx] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; label: string } | null>(null);
  const [previewTarget, setPreviewTarget] = useState<MediaPreviewTarget | null>(null);

  const tabData = [
    { label: 'Voice Designs', icon: RecordVoiceOverOutlinedIcon, count: safeVoiceDesigns.length },
    { label: 'Audios', icon: GraphicEqIcon, count: safeAudios.length },
    { label: 'Images', icon: ImageOutlinedIcon, count: safeImages.length },
    { label: 'Videos', icon: MovieOutlinedIcon, count: safeVideos.length },
  ];

  const filteredVoices = useMemo(() => safeVoiceDesigns.filter(v =>
    (!search || v.name.toLowerCase().includes(search.toLowerCase())) &&
    (statusFilter === 'all' || v.status === statusFilter)
  ), [safeVoiceDesigns, search, statusFilter]);

  const filteredAudios = useMemo(() => safeAudios.filter(a =>
    (!search || String(a.segmentIndex + 1).includes(search)) &&
    (statusFilter === 'all' || a.status === statusFilter)
  ), [safeAudios, search, statusFilter]);

  const filteredImages = useMemo(() => safeImages.filter(i =>
    (!search || i.prompt.toLowerCase().includes(search.toLowerCase()) || String(i.segmentIndex + 1).includes(search)) &&
    (statusFilter === 'all' || i.status === statusFilter)
  ), [safeImages, search, statusFilter]);

  const filteredVideos = useMemo(() => safeVideos.filter(v =>
    (!search || v.filename.toLowerCase().includes(search.toLowerCase())) &&
    (statusFilter === 'all' || v.status === statusFilter)
  ), [safeVideos, search, statusFilter]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { type, id, label } = deleteTarget;
    try {
      if (type === 'voice') {
        await mockApi.deleteVoiceDesign(project.id, id);
        dispatch({ type: 'DELETE_VOICE_DESIGN', projectId: project.id, id });
      } else if (type === 'audio') {
        await mockApi.deleteAudio(project.id, id);
        dispatch({ type: 'DELETE_AUDIO', projectId: project.id, id });
      } else if (type === 'image') {
        await mockApi.deleteImage(project.id, id);
        dispatch({ type: 'DELETE_IMAGE', projectId: project.id, id });
      } else if (type === 'video') {
        await mockApi.deleteVideo(project.id, id);
        dispatch({ type: 'DELETE_VIDEO', projectId: project.id, id });
      }
      toast(`Deleted ${label}`, 'info');
      setDeleteTarget(null);
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const handleBulkDelete = async () => {
    try {
      if (tabIdx === 0) {
        await Promise.all(Array.from(selected).map(id => mockApi.deleteVoiceDesign(project.id, id)));
        selected.forEach(id => dispatch({ type: 'DELETE_VOICE_DESIGN', projectId: project.id, id }));
      } else if (tabIdx === 1) {
        await Promise.all(Array.from(selected).map(id => mockApi.deleteAudio(project.id, id)));
        selected.forEach(id => dispatch({ type: 'DELETE_AUDIO', projectId: project.id, id }));
      } else if (tabIdx === 2) {
        await Promise.all(Array.from(selected).map(id => mockApi.deleteImage(project.id, id)));
        selected.forEach(id => dispatch({ type: 'DELETE_IMAGE', projectId: project.id, id }));
      } else if (tabIdx === 3) {
        await Promise.all(Array.from(selected).map(id => mockApi.deleteVideo(project.id, id)));
        selected.forEach(id => dispatch({ type: 'DELETE_VIDEO', projectId: project.id, id }));
      }
      toast(`Deleted ${selected.size} items`, 'success');
      setSelected(new Set());
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, height: '100%', overflow: 'auto' }}>
      <Typography variant="h6" fontWeight={700} mb={3}>Outputs</Typography>

      <Tabs value={tabIdx} onChange={(_, v) => { setTabIdx(v); setSelected(new Set()); }}
        sx={{ mb: 3, borderBottom: t => `1px solid ${alpha(t.palette.divider, 0.4)}` }}
        variant="scrollable" scrollButtons="auto">
        {tabData.map((tab, i) => (
          <Tab
            key={i}
            icon={<tab.icon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label={`${tab.label} (${tab.count})`}
            sx={{ minHeight: 48, fontSize: '0.82rem', fontWeight: 600, textTransform: 'none' }}
          />
        ))}
      </Tabs>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3} alignItems={{ sm: 'center' }}>
        <TextField
          placeholder="Search..."
          size="small"
          value={search}
          onChange={e => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16 }} /></InputAdornment> }}
          sx={{ maxWidth: 260 }}
        />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => setStatusFilter(e.target.value)}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="success">Done</MenuItem>
            <MenuItem value="failed">Failed</MenuItem>
            <MenuItem value="running">Running</MenuItem>
          </Select>
        </FormControl>
        {selected.size > 0 && (
          <Button size="small" variant="outlined" color="error" onClick={handleBulkDelete}
            startIcon={<DeleteOutlineIcon />}>
            Delete ({selected.size})
          </Button>
        )}
      </Stack>

      {tabIdx === 0 && (
        filteredVoices.length === 0
          ? <EmptyState icon={RecordVoiceOverOutlinedIcon} title="No voice designs" />
          : (
            <Stack spacing={1.5}>
              {filteredVoices.map(vd => (
                <Card key={vd.id} sx={{ border: t => `1px solid ${alpha(t.palette.divider, 0.4)}`, borderRadius: 2 }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                      <Checkbox size="small" checked={selected.has(vd.id)} onChange={() => toggleSelect(vd.id)} />
                      <Box flexGrow={1} minWidth={0}>
                        <Stack direction="row" alignItems="center" spacing={1} mb={0.25}>
                          <Typography variant="body2" fontWeight={700}>{vd.name}</Typography>
                          <StatusChip status={vd.status} />
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {vd.tonePreset} · {vd.narrationMood} · {formatOptionalSeconds(vd.duration)} · {timeAgo(vd.createdAt)}
                        </Typography>
                      </Box>
                      <Stack direction="row">
                        <Tooltip title={vd.audioUrl ? 'Preview' : 'Preview unavailable'}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => vd.audioUrl && setPreviewTarget({
                                title: vd.name,
                                kind: 'audio',
                                src: vd.audioUrl,
                              })}
                              disabled={!vd.audioUrl}
                            >
                              <PlayArrowIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => setDeleteTarget({ type: 'voice', id: vd.id, label: vd.name })} sx={{ color: 'error.main' }}>
                            <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )
      )}

      {tabIdx === 1 && (
        filteredAudios.length === 0
          ? <EmptyState icon={GraphicEqIcon} title="No generated audios" />
          : (
            <Stack spacing={1.5}>
              {filteredAudios.map(a => (
                <Card key={a.id} sx={{ border: t => `1px solid ${alpha(t.palette.divider, 0.4)}`, borderRadius: 2 }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                      <Checkbox size="small" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} />
                      <Box flexGrow={1}>
                        <Stack direction="row" alignItems="center" spacing={1} mb={0.25}>
                          <Typography variant="body2" fontWeight={700}>Segment #{a.segmentIndex + 1}</Typography>
                          <StatusChip status={a.status} />
                          {isStaleOutputRecord(a, project.scriptContent) && (
                            <Chip label="Stale" size="small" color="warning" sx={{ height: 18, fontSize: '0.62rem' }} />
                          )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {formatOptionalSeconds(a.duration)} · {timeAgo(a.createdAt)} · Run: {a.runId.slice(-6)}
                        </Typography>
                      </Box>
                      <Stack direction="row">
                        {a.status === 'success' && (
                          <>
                            <Tooltip title="Play">
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={() => a.audioUrl && setPreviewTarget({
                                    title: `Segment #${a.segmentIndex + 1}`,
                                    kind: 'audio',
                                    src: a.audioUrl,
                                  })}
                                  disabled={!a.audioUrl}
                                >
                                  <PlayArrowIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Download"><IconButton size="small"><DownloadIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                          </>
                        )}
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => setDeleteTarget({ type: 'audio', id: a.id, label: `Seg #${a.segmentIndex + 1} audio` })} sx={{ color: 'error.main' }}>
                            <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )
      )}

      {tabIdx === 2 && (
        filteredImages.length === 0
          ? <EmptyState icon={ImageOutlinedIcon} title="No generated images" />
          : (
            <Grid container spacing={2}>
              {filteredImages.map(img => (
                <Grid key={img.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <Card sx={{ border: t => `1px solid ${alpha(t.palette.divider, 0.4)}`, borderRadius: 2, overflow: 'hidden' }}>
                    <Box sx={{ position: 'relative' }}>
                      {img.thumbnailUrl
                        ? <CardMedia component="img" image={img.thumbnailUrl} sx={{ height: 120, objectFit: 'cover' }} />
                        : <Box sx={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: t => alpha(t.palette.primary.main, 0.05) }}>
                            <ImageOutlinedIcon sx={{ opacity: 0.2 }} />
                          </Box>
                      }
                      <Box sx={{ position: 'absolute', top: 6, left: 6 }}>
                        <Checkbox size="small" checked={selected.has(img.id)} onChange={() => toggleSelect(img.id)}
                          sx={{ bgcolor: t => alpha(t.palette.background.paper, 0.8), borderRadius: 1, p: 0.25 }} />
                      </Box>
                      <Box sx={{ position: 'absolute', top: 6, right: 6 }}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          {isStaleOutputRecord(img, project.scriptContent) && (
                            <Chip label="Stale" size="small" color="warning" sx={{ height: 18, fontSize: '0.62rem' }} />
                          )}
                          <StatusChip status={img.status} />
                        </Stack>
                      </Box>
                    </Box>
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="caption" fontWeight={700} color="primary.main">Seg #{img.segmentIndex + 1}</Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{
                        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', fontSize: '0.68rem',
                      }}>
                        {img.prompt}
                      </Typography>
                      <Stack direction="row" spacing={0.25} mt={0.75}>
                        {img.thumbnailUrl && <Tooltip title="Download"><IconButton size="small"><DownloadIcon sx={{ fontSize: 12 }} /></IconButton></Tooltip>}
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => setDeleteTarget({ type: 'image', id: img.id, label: `Seg #${img.segmentIndex + 1} image` })} sx={{ color: 'error.main' }}>
                            <DeleteOutlineIcon sx={{ fontSize: 12 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )
      )}

      {tabIdx === 3 && (
        filteredVideos.length === 0
          ? <EmptyState icon={MovieOutlinedIcon} title="No generated videos" />
          : (
            <Grid container spacing={2}>
              {filteredVideos.map(v => (
                <Grid key={v.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Card sx={{ border: t => `1px solid ${alpha(t.palette.divider, 0.4)}`, borderRadius: 2, overflow: 'hidden' }}>
                    {v.thumbnailUrl
                      ? <CardMedia component="img" image={v.thumbnailUrl} sx={{ height: 140, objectFit: 'cover' }} />
                      : <Box sx={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: t => alpha(t.palette.primary.main, 0.05) }}>
                          <MovieOutlinedIcon sx={{ opacity: 0.2, fontSize: 48 }} />
                        </Box>
                    }
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={0.5}>
                        <Box>
                          <Typography variant="body2" fontWeight={700}>{v.filename}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatOptionalRoundedSeconds(v.duration)} · {timeAgo(v.createdAt)}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          {isStaleOutputRecord(v, project.scriptContent) && (
                            <Chip label="Stale" size="small" color="warning" sx={{ height: 18, fontSize: '0.62rem' }} />
                          )}
                          <StatusChip status={v.status} />
                        </Stack>
                      </Stack>
                      <Stack direction="row" spacing={0.5}>
                        <Checkbox size="small" checked={selected.has(v.id)} onChange={() => toggleSelect(v.id)} />
                        <Tooltip title="Play">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => v.videoUrl && setPreviewTarget({
                                title: v.filename,
                                kind: 'video',
                                src: v.videoUrl,
                              })}
                              disabled={!v.videoUrl}
                            >
                              <PlayArrowIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Download"><IconButton size="small"><DownloadIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => setDeleteTarget({ type: 'video', id: v.id, label: v.filename })} sx={{ color: 'error.main' }}>
                            <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Item?"
        message={`Delete "${deleteTarget?.label}"? This cannot be undone.`}
        confirmLabel="Delete"
        dangerous
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <MediaPreviewDialog media={previewTarget} onClose={() => setPreviewTarget(null)} />
    </Box>
  );
}
