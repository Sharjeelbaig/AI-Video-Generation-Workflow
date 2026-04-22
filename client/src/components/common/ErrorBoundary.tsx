import { Component, type ErrorInfo, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';

type Props = {
  children: ReactNode;
  title?: string;
  description?: string;
};

type State = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
          bgcolor: 'background.default',
        }}
      >
        <Stack spacing={2} alignItems="center" maxWidth={420} textAlign="center">
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: 3,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.24)',
            }}
          >
            <WarningAmberRoundedIcon sx={{ color: 'warning.main', fontSize: 34 }} />
          </Box>
          <Typography variant="h5" fontWeight={700}>
            {this.props.title || 'Something went wrong'}
          </Typography>
          <Typography color="text.secondary">
            {this.props.description || 'The interface hit an unexpected error. Reload to restore a clean state.'}
          </Typography>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Reload Application
          </Button>
        </Stack>
      </Box>
    );
  }
}
