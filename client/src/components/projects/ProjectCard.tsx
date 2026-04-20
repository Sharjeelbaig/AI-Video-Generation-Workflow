import { useState } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import ArchiveIcon from '@mui/icons-material/Archive';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import RecordVoiceOverOutlinedIcon from '@mui/icons-material/RecordVoiceOverOutlined';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import type { Project } from '../../types';
import StatusChip from '../common/StatusChip';
import { parseScript } from '../../services/scriptParser';

interface Props {
  project: Project;
  voiceDesignCount: number;
  audioCount: number;
  imageCount: number;
  videoCount: number;
  onOpen: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function AspectBadge({ ratio }: { ratio: string }) {
  return (
    <Chip
      label={ratio}
      size="small"
      sx={{
        height: 20,
        fontSize: '0.65rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        bgcolor: t => alpha(t.palette.secondary.main, 0.12),
        color: 'secondary.light',
        border: t => `1px solid ${alpha(t.palette.secondary.main, 0.25)}`,
      }}
    />
  );
}

function StatBadge({ icon: Icon, value, label }: { icon: typeof ArticleOutlinedIcon; value: number; label: string }) {
  return (
    <Tooltip title={label}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
        <Icon sx={{ fontSize: 13, color: 'text.secondary' }} />
        <Typography variant="caption" color="text.secondary" fontWeight={600}>{value}</Typography>
      </Box>
    </Tooltip>
  );
}

export default function ProjectCard({
  project, voiceDesignCount, audioCount, imageCount, videoCount,
  onOpen, onDuplicate, onRename, onArchive, onDelete
}: Props) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const segments = parseScript(project.scriptContent, project.id);
  const langLabel = project.language === 'en' ? 'EN' : project.language === 'ar' ? 'AR' : 'EN+AR';

  return (
    <Card
      sx={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderRadius: 3,
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: t => `0 12px 40px ${alpha(t.palette.common.black, 0.4)}, 0 0 0 1px ${alpha(t.palette.primary.main, 0.2)}`,
          '& .card-glow': { opacity: 1 },
        },
      }}
    >
      <Box
        className="card-glow"
        sx={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: t => `linear-gradient(90deg, ${t.palette.primary.main}, ${t.palette.secondary.main})`,
          opacity: 0, transition: 'opacity 0.2s ease',
        }}
      />

      <CardActionArea onClick={onOpen} sx={{ flexGrow: 1, alignItems: 'flex-start' }}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <AspectBadge ratio={project.aspectRatio} />
              <Chip
                label={langLabel}
                size="small"
                sx={{
                  height: 20, fontSize: '0.65rem', fontWeight: 700,
                  bgcolor: t => alpha(t.palette.info.main, 0.12),
                  color: 'info.light',
                  border: t => `1px solid ${alpha(t.palette.info.main, 0.25)}`,
                }}
              />
            </Stack>
            <StatusChip status={project.status} />
          </Stack>

          <Typography
            variant="h6"
            fontWeight={700}
            fontSize="1rem"
            sx={{
              mb: 0.75,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {project.name}
          </Typography>

          {project.description && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mb: 2,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                lineHeight: 1.5,
                fontSize: '0.8rem',
              }}
            >
              {project.description}
            </Typography>
          )}

          <Stack
            direction="row"
            spacing={2}
            sx={{
              pt: 1.5,
              borderTop: t => `1px solid ${alpha(t.palette.divider, 0.6)}`,
              flexWrap: 'wrap',
              gap: 1,
            }}
          >
            <StatBadge icon={ArticleOutlinedIcon} value={segments.length} label="Script segments" />
            <StatBadge icon={RecordVoiceOverOutlinedIcon} value={voiceDesignCount} label="Voice designs" />
            <StatBadge icon={GraphicEqIcon} value={audioCount} label="Generated audios" />
            <StatBadge icon={ImageOutlinedIcon} value={imageCount} label="Generated images" />
            <StatBadge icon={MovieOutlinedIcon} value={videoCount} label="Videos" />
          </Stack>
        </CardContent>
      </CardActionArea>

      <Box
        sx={{
          px: 2.5, py: 1.5,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderTop: t => `1px solid ${alpha(t.palette.divider, 0.4)}`,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Updated {timeAgo(project.updatedAt)}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title="Open project">
            <IconButton size="small" onClick={onOpen} sx={{ color: 'primary.main' }}>
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton
            size="small"
            onClick={e => { e.stopPropagation(); setMenuAnchor(e.currentTarget); }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        PaperProps={{ sx: { minWidth: 180, borderRadius: 2 } }}
      >
        <MenuItem onClick={() => { setMenuAnchor(null); onOpen(); }}>
          <OpenInNewIcon fontSize="small" sx={{ mr: 1.5 }} />Open
        </MenuItem>
        <MenuItem onClick={() => { setMenuAnchor(null); onDuplicate(); }}>
          <ContentCopyIcon fontSize="small" sx={{ mr: 1.5 }} />Duplicate
        </MenuItem>
        <MenuItem onClick={() => { setMenuAnchor(null); onRename(); }}>
          <DriveFileRenameOutlineIcon fontSize="small" sx={{ mr: 1.5 }} />Rename
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { setMenuAnchor(null); onArchive(); }}>
          <ArchiveIcon fontSize="small" sx={{ mr: 1.5 }} />Archive
        </MenuItem>
        <MenuItem onClick={() => { setMenuAnchor(null); onDelete(); }} sx={{ color: 'error.main' }}>
          <DeleteOutlineIcon fontSize="small" sx={{ mr: 1.5 }} />Delete
        </MenuItem>
      </Menu>
    </Card>
  );
}
