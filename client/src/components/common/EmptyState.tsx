import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SvgIconComponent } from '@mui/icons-material';
import type { ReactNode } from 'react';
import { alpha } from '@mui/material/styles';

interface Props {
  icon: SvgIconComponent;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 10,
        px: 3,
        textAlign: 'center',
        gap: 2,
      }}
    >
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: t => alpha(t.palette.primary.main, 0.14),
          border: t => `1px solid ${alpha(t.palette.primary.main, 0.26)}`,
        }}
      >
        <Icon sx={{ fontSize: 32, color: 'primary.main', opacity: 1 }} />
      </Box>
      <Typography variant="h6" fontWeight={700} color="text.primary">{title}</Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" maxWidth={400}>{description}</Typography>
      )}
      {action && <Box mt={1}>{action}</Box>}
    </Box>
  );
}
