import { useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Slider from '@mui/material/Slider';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MicOutlinedIcon from '@mui/icons-material/MicOutlined';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import type { Project, VoiceDesign, TonePreset, NarrationMood } from '../../types';
import StatusChip from '../common/StatusChip';
import EmptyState from '../common/EmptyState';
import ConfirmDialog from '../common/ConfirmDialog';
import { mockApi, generateId } from '../../services/mockApi';
import { useApp } from '../../store/AppContext';

interface Props {
  project: Project;
  voiceDesigns: VoiceDesign[];
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

export default function VoiceDesignTab({ project, voiceDesigns }: Props) {
  const { dispatch, toast } = useApp();
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [refText, setRefText] = useState('');
  const [speed, setSpeed] = useState(1.0);
  const [tone, setTone] = useState<TonePreset>('neutral');
  const [mood, setMood] = useState<NarrationMood>('documentary');
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VoiceDesign | null>(null);

  const handleDesign = async () => {
    if (!name.trim() || !prompt.trim()) {
      toast('Please fill in name and voice prompt', 'warning');
      return;
    }
    setLoading(true);
    const runId = generateId('run');
    const run = mockApi.createRunJob(project.id, 'voice-design', `Design voice: ${name}`, []);
    dispatch({ type: 'ADD_RUN', projectId: project.id, payload: { ...run, id: runId } });

    try {
      const vd = await mockApi.designVoice(project.id, {
        name: name.trim(), promptInstruction: prompt, referenceText: refText,
        speed, tonePreset: tone, narrationMood: mood,
      });
      dispatch({ type: 'ADD_VOICE_DESIGN', projectId: project.id, payload: vd });
      const designedVoices = await mockApi.listDesignedVoices();
      dispatch({ type: 'SET_DESIGNED_VOICES', payload: designedVoices });
      dispatch({
        type: 'UPDATE_RUN',
        projectId: project.id,
        payload: { ...run, id: runId, status: 'success', completedAt: new Date().toISOString() },
      });
      const refreshedProject = await mockApi.getProject(project.id);
      dispatch({ type: 'UPDATE_PROJECT', payload: refreshedProject });
      toast(`Voice "${name}" designed successfully`, 'success');
      setName(''); setPrompt(''); setRefText('');
    } catch (e) {
      dispatch({
        type: 'UPDATE_RUN',
        projectId: project.id,
        payload: { ...run, id: runId, status: 'failed', completedAt: new Date().toISOString() },
      });
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (vd: VoiceDesign) => {
    try {
      const response = await mockApi.setDefaultVoice(project.id, vd.id);
      dispatch({ type: 'UPDATE_PROJECT', payload: response.project });
      voiceDesigns.forEach((voiceDesign) => {
        const isDefault = voiceDesign.id === vd.id;
        if (voiceDesign.isDefault !== isDefault) {
          dispatch({
            type: 'UPDATE_VOICE_DESIGN',
            projectId: project.id,
            payload: { ...voiceDesign, isDefault },
          });
        }
      });
      dispatch({ type: 'UPDATE_VOICE_DESIGN', projectId: project.id, payload: response.voiceDesign });
      toast(`"${vd.name}" set as default voice`, 'success');
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await mockApi.deleteVoiceDesign(project.id, deleteTarget.id);
      dispatch({ type: 'DELETE_VOICE_DESIGN', projectId: project.id, id: deleteTarget.id });
      const designedVoices = await mockApi.listDesignedVoices();
      dispatch({ type: 'SET_DESIGNED_VOICES', payload: designedVoices });
      if (project.defaultVoiceDesignId === deleteTarget.id) {
        const refreshedProject = await mockApi.getProject(project.id);
        dispatch({ type: 'UPDATE_PROJECT', payload: refreshedProject });
      }
      toast(`Deleted voice "${deleteTarget.name}"`, 'info');
      setDeleteTarget(null);
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, height: '100%', overflow: 'auto' }}>
      <Grid container spacing={4}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Typography variant="h6" fontWeight={700} mb={3}>Design New Voice</Typography>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Stack spacing={2.5}>
                <TextField
                  label="Voice Name"
                  fullWidth
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Professional Narrator"
                  size="small"
                />
                <TextField
                  label="Voice Style Prompt"
                  fullWidth multiline rows={3}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Describe the voice style: tone, pace, character, emotion..."
                  size="small"
                />
                <TextField
                  label="Reference Text (optional)"
                  fullWidth multiline rows={2}
                  value={refText}
                  onChange={e => setRefText(e.target.value)}
                  placeholder="Sample text to demonstrate the voice..."
                  size="small"
                />
                <Box>
                  <Typography variant="body2" color="text.secondary" mb={1} fontWeight={600}>
                    Speed: {speed.toFixed(2)}x
                  </Typography>
                  <Slider
                    value={speed} min={0.5} max={2.0} step={0.05}
                    onChange={(_, v) => setSpeed(v as number)}
                    marks={[{ value: 0.5, label: '0.5x' }, { value: 1, label: '1x' }, { value: 2, label: '2x' }]}
                    sx={{ color: 'primary.main' }}
                  />
                </Box>
                <Grid container spacing={2}>
                  <Grid size={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Tone</InputLabel>
                      <Select value={tone} label="Tone" onChange={e => setTone(e.target.value as TonePreset)}>
                        <MenuItem value="neutral">Neutral</MenuItem>
                        <MenuItem value="warm">Warm</MenuItem>
                        <MenuItem value="formal">Formal</MenuItem>
                        <MenuItem value="energetic">Energetic</MenuItem>
                        <MenuItem value="calm">Calm</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Mood</InputLabel>
                      <Select value={mood} label="Mood" onChange={e => setMood(e.target.value as NarrationMood)}>
                        <MenuItem value="documentary">Documentary</MenuItem>
                        <MenuItem value="conversational">Conversational</MenuItem>
                        <MenuItem value="dramatic">Dramatic</MenuItem>
                        <MenuItem value="educational">Educational</MenuItem>
                        <MenuItem value="inspirational">Inspirational</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
                <Button
                  variant="contained"
                  fullWidth
                  onClick={handleDesign}
                  disabled={loading || !name.trim() || !prompt.trim()}
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <MicOutlinedIcon />}
                  sx={{ mt: 1 }}
                >
                  {loading ? 'Designing Voice...' : 'Design Voice'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h6" fontWeight={700}>
              Voice Library
              <Chip label={voiceDesigns.length} size="small" sx={{ ml: 1, height: 20, fontSize: '0.72rem' }} />
            </Typography>
          </Stack>

          {voiceDesigns.length === 0 ? (
            <EmptyState
              icon={RecordVoiceOverIcon}
              title="No voice designs yet"
              description="Design your first AI voice to get started."
            />
          ) : (
            <Stack spacing={2}>
              {voiceDesigns.map(vd => (
                <Card
                  key={vd.id}
                  sx={{
                    border: t => vd.isDefault
                      ? `1.5px solid ${alpha(t.palette.primary.main, 0.5)}`
                      : `1px solid ${alpha(t.palette.divider, 0.4)}`,
                    bgcolor: t => vd.isDefault ? alpha(t.palette.primary.main, 0.04) : 'background.paper',
                  }}
                >
                  <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Box flexGrow={1} minWidth={0}>
                        <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                          <Typography variant="subtitle2" fontWeight={700}>{vd.name}</Typography>
                          {vd.isDefault && (
                            <Chip label="Default" size="small" color="primary"
                              sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700 }} />
                          )}
                          <StatusChip status={vd.status} />
                        </Stack>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{
                          overflow: 'hidden', display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          {vd.promptInstruction}
                        </Typography>
                        <Stack direction="row" spacing={1.5} mt={1} flexWrap="wrap">
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <AccessTimeIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                              {vd.duration.toFixed(1)}s
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {vd.speed}x · {vd.tonePreset} · {vd.narrationMood}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">{timeAgo(vd.createdAt)}</Typography>
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Preview (mock)">
                          <IconButton size="small" sx={{ color: 'secondary.main' }}>
                            <PlayArrowIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={vd.isDefault ? 'Current default' : 'Set as default'}>
                          <IconButton size="small" onClick={() => handleSetDefault(vd)}
                            sx={{ color: vd.isDefault ? 'primary.main' : 'text.secondary' }}>
                            {vd.isDefault ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => setDeleteTarget(vd)}
                            sx={{ color: 'error.main' }}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </Grid>
      </Grid>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Voice Design?"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        dangerous
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}
