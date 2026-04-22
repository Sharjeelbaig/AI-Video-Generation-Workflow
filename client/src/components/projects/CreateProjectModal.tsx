import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import type { AspectRatio, Language } from '../../types';
import { validateProjectInput } from '../../services/validation';

const ASPECT_RATIOS: { value: AspectRatio; label: string; desc: string }[] = [
  { value: '16:9', label: '16:9', desc: 'Landscape (YouTube)' },
  { value: '9:16', label: '9:16', desc: 'Portrait (Reels/Shorts)' },
  { value: '1:1', label: '1:1', desc: 'Square (Instagram)' },
  { value: '4:3', label: '4:3', desc: 'Classic' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description: string; language: Language; aspectRatio: AspectRatio }) => Promise<void>;
}

export default function CreateProjectModal({ open, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const validation = validateProjectInput({
      name,
      description,
      language,
      aspectRatio,
    });
    if (!validation.success) {
      setError(validation.message);
      return;
    }
    setLoading(true);
    try {
      await onSubmit(validation.data);
      handleClose();
    } catch {
      setError('Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName(''); setDescription(''); setLanguage('en'); setAspectRatio('16:9');
    setError(''); setLoading(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { borderRadius: 3, border: t => `1px solid ${alpha(t.palette.primary.main, 0.15)}` } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: '1.3rem', pb: 1 }}>
        Create New Project
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={3}>
          <TextField
            label="Project Name"
            fullWidth
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            error={!!error}
            helperText={error}
            autoFocus
            placeholder="My Amazing Video Project"
          />
          <TextField
            label="Description"
            fullWidth
            multiline
            rows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="A brief description of your project..."
          />
          <FormControl fullWidth>
            <InputLabel>Language</InputLabel>
            <Select value={language} label="Language" onChange={e => setLanguage(e.target.value as Language)}>
              <MenuItem value="en">English</MenuItem>
              <MenuItem value="ar">Arabic (عربي)</MenuItem>
              <MenuItem value="en-ar">English + Arabic</MenuItem>
            </Select>
          </FormControl>
          <Box>
            <Typography variant="body2" color="text.secondary" mb={1.5} fontWeight={600}>
              Aspect Ratio
            </Typography>
            <Grid container spacing={1.5}>
              {ASPECT_RATIOS.map(ar => (
                <Grid key={ar.value} size={6}>
                  <Box
                    onClick={() => setAspectRatio(ar.value)}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      border: t => `1.5px solid ${aspectRatio === ar.value
                        ? t.palette.primary.main
                        : alpha(t.palette.divider, 0.8)}`,
                      cursor: 'pointer',
                      bgcolor: t => aspectRatio === ar.value
                        ? alpha(t.palette.primary.main, 0.08) : 'transparent',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        borderColor: 'primary.main',
                        bgcolor: t => alpha(t.palette.primary.main, 0.05),
                      },
                    }}
                  >
                    <Typography variant="subtitle2" fontWeight={700} color={aspectRatio === ar.value ? 'primary' : 'text.primary'}>
                      {ar.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{ar.desc}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={handleClose} variant="outlined" color="inherit" disabled={loading}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading || !name.trim()}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {loading ? 'Creating...' : 'Create Project'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
