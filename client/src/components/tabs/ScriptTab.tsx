import { useState, useMemo, useCallback, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ImageSearchIcon from '@mui/icons-material/ImageSearch';
import TitleIcon from '@mui/icons-material/Title';
import SubtitlesOutlinedIcon from '@mui/icons-material/SubtitlesOutlined';
import type { Project } from '../../types';
import { parseScript, isRTL } from '../../services/scriptParser';
import { useApp } from '../../store/AppContext';
import { mockApi } from '../../services/mockApi';
import { validateScriptContent } from '../../services/validation';

interface Props {
  project: Project;
}

export default function ScriptTab({ project }: Props) {
  const { dispatch, toast } = useApp();
  const [content, setContent] = useState(project.scriptContent);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setContent(project.scriptContent);
    setDirty(false);
  }, [project.id, project.scriptContent]);

  const segments = useMemo(() => parseScript(content, project.id), [content, project.id]);

  const handleChange = useCallback((val: string) => {
    setContent(val);
    setDirty(val !== project.scriptContent);
  }, [project.scriptContent]);

  const handleSave = async () => {
    const validation = validateScriptContent(content);
    if (!validation.success) {
      toast(validation.message, 'warning');
      return;
    }

    setSaving(true);
    try {
      const response = await mockApi.saveScript(project.id, validation.data);
      dispatch({ type: 'UPDATE_PROJECT', payload: response.project });
      setContent(response.content);
      setDirty(false);
      toast('Script saved', 'success');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const warnings = segments.flatMap(s => s.warnings.map(w => ({ segment: s.index + 1, message: w })));

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden', flexDirection: { xs: 'column', md: 'row' } }}>
      <Box
        sx={{
          flex: '0 0 50%',
          display: 'flex',
          flexDirection: 'column',
          borderRight: t => ({ md: `1px solid ${alpha(t.palette.divider, 0.6)}` }),
          height: '100%',
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{
            px: 3, py: 2,
            borderBottom: t => `1px solid ${alpha(t.palette.divider, 0.4)}`,
            flexShrink: 0,
          }}
        >
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Script Editor</Typography>
            <Typography variant="caption" color="text.secondary">
              Split segments with <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: 3 }}>---</code>
            </Typography>
          </Box>
          <Button
            variant={dirty ? 'contained' : 'outlined'}
            size="small"
            startIcon={<SaveOutlinedIcon />}
            onClick={handleSave}
            disabled={!dirty || saving}
            color={dirty ? 'primary' : 'inherit'}
          >
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </Button>
        </Stack>

        <Box sx={{ flexGrow: 1, p: 2, overflow: 'auto' }}>
          {warnings.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2, fontSize: '0.78rem' }} icon={<WarningAmberIcon />}>
              {warnings.length} validation warning{warnings.length > 1 ? 's' : ''}:{' '}
              {warnings.map(w => `Seg ${w.segment}: ${w.message}`).join(' · ')}
            </Alert>
          )}
          <TextField
            multiline
            fullWidth
            value={content}
            onChange={e => handleChange(e.target.value)}
            variant="outlined"
            placeholder={`<Heading>Your Title Here</Heading>\nYour first segment text goes here.\n<image>An image prompt for this scene</image>\n---\n<SubHeading>A sub section</SubHeading>\nMore content for the second segment.`}
            InputProps={{
              sx: {
                fontFamily: '"Fira Code", "Cascadia Code", "Consolas", monospace',
                fontSize: '0.82rem',
                lineHeight: 1.8,
                alignItems: 'flex-start',
                minHeight: 400,
              },
            }}
            sx={{ '& .MuiOutlinedInput-root': { height: 'auto' } }}
          />
          <Box mt={1.5}>
            <Typography variant="caption" color="text.secondary">
              Supports:{' '}
              <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3 }}>&lt;Heading&gt;...&lt;/Heading&gt;</code>{' '}
              <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3 }}>&lt;SubHeading&gt;...&lt;/SubHeading&gt;</code>{' '}
              <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3 }}>&lt;image&gt;...&lt;/image&gt;</code>
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="subtitle1" fontWeight={700}>
            Segments <Chip label={segments.length} size="small" sx={{ ml: 1, height: 20, fontSize: '0.72rem' }} />
          </Typography>
          <Typography variant="caption" color="text.secondary">Live preview</Typography>
        </Stack>

        {segments.length === 0 ? (
          <Box sx={{
            textAlign: 'center', py: 8,
            border: t => `2px dashed ${alpha(t.palette.divider, 0.4)}`,
            borderRadius: 3,
          }}>
            <Typography color="text.secondary" variant="body2">
              Start typing in the editor to see segment previews
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {segments.map(seg => (
              <Card
                key={seg.id}
                sx={{
                  border: t => seg.warnings.length > 0
                    ? `1px solid ${alpha(t.palette.warning.main, 0.4)}`
                    : seg.isEmpty
                      ? `1px solid ${alpha(t.palette.error.main, 0.3)}`
                      : `1px solid ${alpha(t.palette.divider, 0.4)}`,
                  borderRadius: 2,
                  transition: 'all 0.15s ease',
                  '&:hover': { borderColor: 'primary.main' },
                }}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1}>
                    <Typography
                      variant="caption"
                      sx={{
                        px: 1, py: 0.25, borderRadius: 1,
                        bgcolor: t => alpha(t.palette.primary.main, 0.12),
                        color: 'primary.main',
                        fontWeight: 700, fontSize: '0.65rem',
                      }}
                    >
                      #{seg.index + 1}
                    </Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                      {seg.heading && (
                        <Tooltip title={seg.heading}>
                          <Chip icon={<TitleIcon sx={{ fontSize: '14px !important' }} />} label="Heading" size="small"
                            sx={{ height: 18, fontSize: '0.62rem', bgcolor: t => alpha(t.palette.warning.main, 0.12), color: 'warning.main' }} />
                        </Tooltip>
                      )}
                      {seg.subHeading && (
                        <Tooltip title={seg.subHeading}>
                          <Chip icon={<SubtitlesOutlinedIcon sx={{ fontSize: '14px !important' }} />} label="SubHeading" size="small"
                            sx={{ height: 18, fontSize: '0.62rem', bgcolor: t => alpha(t.palette.info.main, 0.12), color: 'info.main' }} />
                        </Tooltip>
                      )}
                      {seg.imagePrompt && (
                        <Tooltip title={seg.imagePrompt}>
                          <Chip icon={<ImageSearchIcon sx={{ fontSize: '14px !important' }} />} label="Image" size="small"
                            sx={{ height: 18, fontSize: '0.62rem', bgcolor: t => alpha(t.palette.success.main, 0.12), color: 'success.main' }} />
                        </Tooltip>
                      )}
                    </Stack>
                  </Stack>

                  {seg.heading && (
                    <Typography variant="caption" fontWeight={700} color="warning.main" display="block" mb={0.5}>
                      {seg.heading}
                    </Typography>
                  )}
                  {seg.subHeading && (
                    <Typography variant="caption" fontWeight={600} color="info.main" display="block" mb={0.5}>
                      {seg.subHeading}
                    </Typography>
                  )}

                  {seg.cleanText ? (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        fontSize: '0.78rem',
                        lineHeight: 1.6,
                        direction: isRTL(seg.cleanText) ? 'rtl' : 'ltr',
                        textAlign: isRTL(seg.cleanText) ? 'right' : 'left',
                        fontFamily: isRTL(seg.cleanText) ? '"Cairo", "Amiri", sans-serif' : 'inherit',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {seg.cleanText}
                    </Typography>
                  ) : !seg.heading && !seg.subHeading ? (
                    <Typography variant="caption" color="error.main">Empty segment</Typography>
                  ) : null}

                  {seg.warnings.length > 0 && (
                    <Stack direction="row" spacing={0.5} mt={1} flexWrap="wrap">
                      {seg.warnings.map((w, i) => (
                        <Chip key={i} icon={<WarningAmberIcon sx={{ fontSize: '12px !important' }} />}
                          label={w} size="small" color="warning" variant="outlined"
                          sx={{ height: 18, fontSize: '0.62rem' }} />
                      ))}
                    </Stack>
                  )}
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
