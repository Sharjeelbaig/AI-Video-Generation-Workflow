import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import { alpha } from '@mui/material/styles';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import RecordVoiceOverOutlinedIcon from '@mui/icons-material/RecordVoiceOverOutlined';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PendingOutlinedIcon from '@mui/icons-material/PendingOutlined';
import type { Project, GeneratedAudio, GeneratedImage, GeneratedVideo, VoiceDesign, RunJob } from '../../types';
import StatusChip from '../common/StatusChip';
import { parseScript } from '../../services/scriptParser';
import type { TabId } from '../workspace/WorkspaceLayout';

interface StatCardProps {
  icon: typeof ArticleOutlinedIcon;
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
}

function StatCard({ icon: Icon, label, value, color, onClick }: StatCardProps) {
  return (
    <Card
      onClick={onClick}
      sx={{
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? {
          transform: 'translateY(-1px)',
          boxShadow: t => `0 8px 24px ${alpha(t.palette.common.black, 0.3)}`,
        } : {},
        transition: 'all 0.18s ease',
      }}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="h4" fontWeight={800} sx={{ color, lineHeight: 1.2 }}>{value}</Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {label}
            </Typography>
          </Box>
          <Box sx={{
            width: 40, height: 40, borderRadius: 2,
            bgcolor: alpha(color, 0.12),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon sx={{ color, fontSize: 20 }} />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

interface Props {
  project: Project;
  voiceDesigns: VoiceDesign[];
  audios: GeneratedAudio[];
  images: GeneratedImage[];
  videos: GeneratedVideo[];
  runs: RunJob[];
  onNavigate: (tab: TabId) => void;
}

export default function OverviewTab({ project, voiceDesigns, audios, images, videos, runs, onNavigate }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const segments = parseScript(project.scriptContent, project.id);
  const recentRuns = [...runs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, 5);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  function timeAgo(iso: string): string {
    const diff = now - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function RunIcon({ status }: { status: string }) {
    if (status === 'success') return <CheckCircleOutlineIcon sx={{ fontSize: 16, color: 'success.main' }} />;
    if (status === 'failed') return <ErrorOutlineIcon sx={{ fontSize: 16, color: 'error.main' }} />;
    return <PendingOutlinedIcon sx={{ fontSize: 16, color: 'warning.main' }} />;
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={4}>
        <Box>
          <Typography variant="h5" fontWeight={800} mb={0.5}>{project.name}</Typography>
          {project.description && (
            <Typography variant="body2" color="text.secondary" maxWidth={600}>{project.description}</Typography>
          )}
        </Box>
        <StatusChip status={project.status} size="medium" />
      </Stack>

      <Grid container spacing={2} mb={4}>
        <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
          <StatCard icon={ArticleOutlinedIcon} label="Script segments" value={segments.length} color="#F59E0B" onClick={() => onNavigate('script')} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
          <StatCard icon={RecordVoiceOverOutlinedIcon} label="Voice designs" value={voiceDesigns.length} color="#06B6D4" onClick={() => onNavigate('voice-design')} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
          <StatCard icon={GraphicEqIcon} label="Audios" value={audios.filter(a => a.status === 'success').length} color="#10B981" onClick={() => onNavigate('generate-voice')} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
          <StatCard icon={ImageOutlinedIcon} label="Images" value={images.filter(i => i.status === 'success').length} color="#3B82F6" onClick={() => onNavigate('generate-images')} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
          <StatCard icon={MovieOutlinedIcon} label="Videos" value={videos.filter(v => v.status === 'success').length} color="#A855F7" onClick={() => onNavigate('generate-video')} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, lg: 2 }}>
          <StatCard icon={CheckCircleOutlineIcon} label="Total runs" value={runs.length} color="#F97316" />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>Quick Actions</Typography>
              <Stack spacing={1.5}>
                {[
                  { label: 'Edit Script', desc: 'Write or update your script content', tab: 'script' as TabId, icon: ArticleOutlinedIcon, color: '#F59E0B' },
                  { label: 'Design a Voice', desc: 'Create a custom AI voice style', tab: 'voice-design' as TabId, icon: RecordVoiceOverOutlinedIcon, color: '#06B6D4' },
                  { label: 'Generate Narration', desc: 'Produce audio for your script segments', tab: 'generate-voice' as TabId, icon: GraphicEqIcon, color: '#10B981' },
                  { label: 'Generate Images', desc: 'Create visuals for your scenes', tab: 'generate-images' as TabId, icon: ImageOutlinedIcon, color: '#3B82F6' },
                  { label: 'Produce Video', desc: 'Compile everything into a final video', tab: 'generate-video' as TabId, icon: MovieOutlinedIcon, color: '#A855F7' },
                ].map(action => (
                  <Box
                    key={action.tab}
                    onClick={() => onNavigate(action.tab)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 2,
                      p: 1.5, borderRadius: 2, cursor: 'pointer',
                      border: t => `1px solid ${alpha(t.palette.divider, 0.4)}`,
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        bgcolor: alpha(action.color, 0.06),
                        borderColor: alpha(action.color, 0.3),
                      },
                    }}
                  >
                    <Box sx={{
                      width: 36, height: 36, borderRadius: 1.5,
                      bgcolor: alpha(action.color, 0.12),
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <action.icon sx={{ fontSize: 18, color: action.color }} />
                    </Box>
                    <Box flexGrow={1}>
                      <Typography variant="body2" fontWeight={600}>{action.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{action.desc}</Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} mb={2}>Recent Activity</Typography>
              {recentRuns.length === 0 ? (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">No activity yet</Typography>
                </Box>
              ) : (
                <Stack spacing={0} divider={<Divider />}>
                  {recentRuns.map(run => (
                    <Stack key={run.id} direction="row" alignItems="center" spacing={1.5} py={1.5}>
                      <RunIcon status={run.status} />
                      <Box flexGrow={1}>
                        <Typography variant="body2" fontWeight={600} fontSize="0.8rem">{run.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{timeAgo(run.startedAt)}</Typography>
                      </Box>
                      <StatusChip status={run.status} />
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box mt={3}>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle1" fontWeight={700}>Project Details</Typography>
              <Button size="small" variant="outlined" onClick={() => onNavigate('script')}>
                Open Script
              </Button>
            </Stack>
            <Grid container spacing={2}>
              {[
                { label: 'Language', value: project.language === 'en' ? 'English' : project.language === 'ar' ? 'Arabic' : 'English + Arabic' },
                { label: 'Aspect Ratio', value: project.aspectRatio },
                { label: 'FPS', value: `${project.videoSettings.fps}fps` },
                { label: 'Resolution', value: `${project.videoSettings.width}×${project.videoSettings.height}` },
              ].map(detail => (
                <Grid key={detail.label} size={{ xs: 6, sm: 3 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} display="block"
                    sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.25 }}>
                    {detail.label}
                  </Typography>
                  <Typography variant="body2" fontWeight={700}>{detail.value}</Typography>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
