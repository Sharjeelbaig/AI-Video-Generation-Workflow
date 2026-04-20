import Chip from '@mui/material/Chip';
import type { JobStatus, ProjectStatus } from '../../types';

const CONFIG = {
  idle: { label: 'Idle', color: 'default' as const },
  queued: { label: 'Queued', color: 'info' as const },
  running: { label: 'Running', color: 'warning' as const },
  success: { label: 'Done', color: 'success' as const },
  failed: { label: 'Failed', color: 'error' as const },
  archived: { label: 'Archived', color: 'default' as const },
};

interface Props {
  status: JobStatus | ProjectStatus;
  size?: 'small' | 'medium';
}

export default function StatusChip({ status, size = 'small' }: Props) {
  const cfg = CONFIG[status] ?? CONFIG.idle;
  return (
    <Chip
      label={cfg.label}
      color={cfg.color}
      size={size}
      variant={status === 'running' ? 'filled' : 'outlined'}
      sx={{ fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.05em' }}
    />
  );
}
