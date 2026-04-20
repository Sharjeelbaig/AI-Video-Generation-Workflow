import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Skeleton from '@mui/material/Skeleton';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import CreateProjectModal from '../components/projects/CreateProjectModal';
import ProjectCard from '../components/projects/ProjectCard';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useApp } from '../store/AppContext';
import { mockApi } from '../services/mockApi';
import type { Project, AspectRatio, Language } from '../types';

type SortOption = 'updatedAt' | 'createdAt' | 'name';
type FilterOption = 'all' | 'idle' | 'running' | 'success' | 'failed';

export default function ProjectsPage() {
  const { state, dispatch, toast } = useApp();
  const navigate = useNavigate();

  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('updatedAt');
  const [filter, setFilter] = useState<FilterOption>('all');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const activeProjects = useMemo(() => {
    let list = state.projects.filter(p => !p.archived);
    if (search) list = list.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase())
    );
    if (filter !== 'all') list = list.filter(p => p.status === filter);
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      return new Date(b[sort]).getTime() - new Date(a[sort]).getTime();
    });
    return list;
  }, [state.projects, search, sort, filter]);

  const handleCreate = async (data: { name: string; description: string; language: Language; aspectRatio: AspectRatio }) => {
    try {
      const project = await mockApi.createProject(data);
      dispatch({ type: 'ADD_PROJECT', payload: project });
      toast(`Project "${project.name}" created`, 'success');
      navigate(`/project/${project.id}`);
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const handleDuplicate = async (project: Project) => {
    try {
      const copy = await mockApi.duplicateProject(project.id);
      dispatch({ type: 'ADD_PROJECT', payload: copy });
      toast(`Duplicated "${project.name}"`, 'success');
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const handleRenameOpen = (project: Project) => {
    setRenameTarget(project);
    setRenameName(project.name);
    setRenameOpen(true);
  };

  const handleRenameSubmit = async () => {
    if (!renameTarget || !renameName.trim()) return;
    try {
      const updated = await mockApi.updateProject(renameTarget.id, { name: renameName.trim() });
      dispatch({ type: 'UPDATE_PROJECT', payload: updated });
      toast('Project renamed', 'success');
      setRenameOpen(false);
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const handleArchive = async (project: Project) => {
    try {
      const updated = await mockApi.updateProject(project.id, { archived: true, status: 'archived' });
      dispatch({ type: 'UPDATE_PROJECT', payload: updated });
      toast(`Archived "${project.name}"`, 'info');
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await mockApi.deleteProject(deleteTarget.id);
      dispatch({ type: 'DELETE_PROJECT', payload: deleteTarget.id });
      toast(`Deleted "${deleteTarget.name}"`, 'info');
      setDeleteTarget(null);
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  if (!state.initialized) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pt: 8 }}>
        <Container maxWidth="xl">
          <Grid container spacing={3}>
            {[1, 2, 3].map(i => (
              <Grid key={i} size={{ xs: 12, sm: 6, lg: 4 }}>
                <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 3 }} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'fixed', inset: 0,
          background: `radial-gradient(ellipse 60% 40% at 20% 10%, rgba(245,158,11,0.06) 0%, transparent 60%),
                       radial-gradient(ellipse 50% 40% at 80% 90%, rgba(6,182,212,0.05) 0%, transparent 60%)`,
          pointerEvents: 'none', zIndex: 0,
        },
      }}
    >
      <Box
        component="header"
        sx={{
          position: 'sticky', top: 0, zIndex: 100,
          bgcolor: t => alpha(t.palette.background.default, 0.85),
          backdropFilter: 'blur(20px)',
          borderBottom: t => `1px solid ${alpha(t.palette.divider, 0.6)}`,
        }}
      >
        <Container maxWidth="xl">
          <Stack direction="row" justifyContent="space-between" alignItems="center" py={2}>
            <Stack direction="row" alignItems="center" spacing={2}>
              <Box
                sx={{
                  width: 36, height: 36,
                  borderRadius: 2,
                  background: t => `linear-gradient(135deg, ${t.palette.primary.main}, ${t.palette.primary.dark})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: t => `0 4px 12px ${alpha(t.palette.primary.main, 0.4)}`,
                }}
              >
                <MovieOutlinedIcon sx={{ fontSize: 18, color: '#0F0F0F' }} />
              </Box>
              <Typography variant="h6" fontWeight={800} letterSpacing="-0.03em">
                Media<Box component="span" sx={{ color: 'primary.main' }}>Studio</Box>
              </Typography>
            </Stack>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
            >
              New Project
            </Button>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ py: 5, position: 'relative', zIndex: 1 }}>
        <Box mb={5}>
          <Typography
            variant="h3"
            fontWeight={800}
            letterSpacing="-0.03em"
            sx={{ mb: 1 }}
          >
            Your Projects
          </Typography>
          <Typography color="text.secondary">
            {state.projects.filter(p => !p.archived).length} active{' '}
            {state.projects.filter(p => !p.archived).length === 1 ? 'project' : 'projects'}
          </Typography>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={4} alignItems={{ sm: 'center' }}>
          <TextField
            placeholder="Search projects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'text.secondary', fontSize: 18 }} />
                </InputAdornment>
              ),
            }}
            sx={{ flexGrow: 1, maxWidth: { sm: 320 } }}
            size="small"
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Sort by</InputLabel>
            <Select value={sort} label="Sort by" onChange={e => setSort(e.target.value as SortOption)}>
              <MenuItem value="updatedAt">Last updated</MenuItem>
              <MenuItem value="createdAt">Created</MenuItem>
              <MenuItem value="name">Name</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Status</InputLabel>
            <Select value={filter} label="Status" onChange={e => setFilter(e.target.value as FilterOption)}>
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="idle">Idle</MenuItem>
              <MenuItem value="running">Running</MenuItem>
              <MenuItem value="success">Done</MenuItem>
              <MenuItem value="failed">Failed</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {activeProjects.length === 0 ? (
          <EmptyState
            icon={FolderOpenIcon}
            title={search ? 'No projects found' : 'No projects yet'}
            description={
              search
                ? 'Try a different search term or clear filters.'
                : 'Create your first project to start producing AI-powered media.'
            }
            action={
              !search ? (
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
                  Create Your First Project
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Grid container spacing={3}>
            {activeProjects.map((project, i) => (
              <Grid
                key={project.id}
                size={{ xs: 12, sm: 6, lg: 4 }}
                sx={{
                  animation: 'fadeSlideIn 0.4s ease forwards',
                  animationDelay: `${i * 0.06}s`,
                  opacity: 0,
                  '@keyframes fadeSlideIn': {
                    from: { opacity: 0, transform: 'translateY(16px)' },
                    to: { opacity: 1, transform: 'translateY(0)' },
                  },
                }}
              >
                <ProjectCard
                  project={project}
                  voiceDesignCount={(state.voiceDesigns[project.id] || []).length}
                  audioCount={(state.audios[project.id] || []).length}
                  imageCount={(state.images[project.id] || []).length}
                  videoCount={(state.videos[project.id] || []).length}
                  onOpen={() => navigate(`/project/${project.id}`)}
                  onDuplicate={() => handleDuplicate(project)}
                  onRename={() => handleRenameOpen(project)}
                  onArchive={() => handleArchive(project)}
                  onDelete={() => setDeleteTarget(project)}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Container>

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} onSubmit={handleCreate} />

      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Rename Project</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth autoFocus label="Project name"
            value={renameName} onChange={e => setRenameName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRenameSubmit()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRenameOpen(false)} variant="outlined" color="inherit">Cancel</Button>
          <Button onClick={handleRenameSubmit} variant="contained" disabled={!renameName.trim()}>Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Project?"
        message={`Are you sure you want to permanently delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        dangerous
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}
