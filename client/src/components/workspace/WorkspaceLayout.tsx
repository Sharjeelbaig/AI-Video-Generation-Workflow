import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import { alpha } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import RecordVoiceOverOutlinedIcon from '@mui/icons-material/RecordVoiceOverOutlined';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import type { Project } from '../../types';
import StatusChip from '../common/StatusChip';

export type TabId = 'overview' | 'script' | 'voice-design' | 'generate-voice' | 'generate-images' | 'generate-video' | 'outputs';

const TABS: { id: TabId; label: string; icon: typeof DashboardOutlinedIcon }[] = [
  { id: 'overview', label: 'Overview', icon: DashboardOutlinedIcon },
  { id: 'script', label: 'Script', icon: ArticleOutlinedIcon },
  { id: 'voice-design', label: 'Voice Design', icon: RecordVoiceOverOutlinedIcon },
  { id: 'generate-voice', label: 'Generate Voice', icon: GraphicEqIcon },
  { id: 'generate-images', label: 'Generate Images', icon: ImageOutlinedIcon },
  { id: 'generate-video', label: 'Generate Video', icon: MovieOutlinedIcon },
  { id: 'outputs', label: 'Outputs', icon: FolderOutlinedIcon },
];

const SIDEBAR_WIDTH = 220;

interface Props {
  project: Project;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  children: React.ReactNode;
}

export default function WorkspaceLayout({ project, activeTab, onTabChange, children }: Props) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', py: 1 }}>
      <Box sx={{ px: 2, py: 1.5, mb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} mb={2}>
          <Box
            sx={{
              width: 30,
              height: 30,
              borderRadius: 2,
              display: 'grid',
              placeItems: 'center',
              bgcolor: t => alpha(t.palette.primary.main, 0.14),
              border: t => `1px solid ${alpha(t.palette.primary.main, 0.24)}`,
            }}
          >
            <MovieOutlinedIcon sx={{ fontSize: 16, color: 'primary.main' }} />
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={700} letterSpacing="0.08em">
              SEALED NECTOR
            </Typography>
            <Typography variant="caption" color="text.disabled" display="block">
              Production Suite
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1} mb={2}>
          <Tooltip title="Back to projects">
            <IconButton size="small" onClick={() => navigate('/')} sx={{ color: 'text.secondary' }}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing="0.06em" sx={{ textTransform: 'uppercase' }}>
            Projects
          </Typography>
        </Stack>
        <Typography
          variant="subtitle2"
          fontWeight={700}
          sx={{
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: 1.4,
            mb: 1,
          }}
        >
          {project.name}
        </Typography>
        <Stack direction="row" spacing={0.75} flexWrap="wrap">
          <Chip
            label={project.aspectRatio}
            size="small"
            sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, bgcolor: t => alpha(t.palette.secondary.main, 0.1), color: 'secondary.light' }}
          />
          <StatusChip status={project.status} size="small" />
        </Stack>
      </Box>

      <Divider sx={{ mb: 1 }} />

      <List dense sx={{ px: 1, flexGrow: 1 }}>
        {TABS.map(tab => {
          const active = tab.id === activeTab;
          return (
            <ListItemButton
              key={tab.id}
              selected={active}
              onClick={() => { onTabChange(tab.id); setMobileOpen(false); }}
              sx={{
                borderRadius: 2,
                mb: 0.25,
                py: 1,
                '&.Mui-selected': {
                  bgcolor: t => alpha(t.palette.primary.main, 0.12),
                  color: 'primary.main',
                  '&:hover': { bgcolor: t => alpha(t.palette.primary.main, 0.16) },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 34 }}>
                <tab.icon sx={{ fontSize: 18, color: active ? 'primary.main' : 'text.secondary' }} />
              </ListItemIcon>
              <ListItemText
                primary={tab.label}
                primaryTypographyProps={{
                  fontSize: '0.82rem',
                  fontWeight: active ? 700 : 500,
                  color: active ? 'primary.main' : 'text.secondary',
                }}
              />
            </ListItemButton>
          );
        })}
      </List>

      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.5 }}>
          {project.language.toUpperCase()} · {project.aspectRatio}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Box
        component="nav"
        sx={{ width: { md: SIDEBAR_WIDTH }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              width: SIDEBAR_WIDTH,
              bgcolor: 'background.paper',
              borderRight: t => `1px solid ${alpha(t.palette.divider, 0.6)}`,
            },
          }}
        >
          {sidebarContent}
        </Drawer>

        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              width: SIDEBAR_WIDTH,
              bgcolor: 'background.paper',
              borderRight: t => `1px solid ${alpha(t.palette.divider, 0.6)}`,
              boxSizing: 'border-box',
            },
          }}
          open
        >
          {sidebarContent}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${SIDEBAR_WIDTH}px)` },
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            display: { xs: 'flex', md: 'none' },
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.5,
            borderBottom: t => `1px solid ${alpha(t.palette.divider, 0.6)}`,
            bgcolor: 'background.paper',
          }}
        >
          <IconButton size="small" onClick={() => setMobileOpen(true)}>
            <MenuIcon />
          </IconButton>
          <Typography variant="subtitle2" fontWeight={700}>{project.name}</Typography>
        </Box>

        <Box sx={{ flexGrow: 1, overflow: 'auto', position: 'relative' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
