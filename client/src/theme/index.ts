import { createTheme, alpha } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#F59E0B',
      light: '#FCD34D',
      dark: '#D97706',
      contrastText: '#0F0F0F',
    },
    secondary: {
      main: '#06B6D4',
      light: '#67E8F9',
      dark: '#0891B2',
      contrastText: '#0F0F0F',
    },
    error: {
      main: '#EF4444',
      light: '#FCA5A5',
      dark: '#DC2626',
    },
    warning: {
      main: '#F97316',
      light: '#FDBA74',
      dark: '#EA580C',
    },
    success: {
      main: '#10B981',
      light: '#6EE7B7',
      dark: '#059669',
    },
    info: {
      main: '#3B82F6',
      light: '#93C5FD',
      dark: '#2563EB',
    },
    background: {
      default: '#080C14',
      paper: '#0E1420',
    },
    text: {
      primary: '#F1F5F9',
      secondary: '#94A3B8',
      disabled: '#475569',
    },
    divider: alpha('#94A3B8', 0.12),
  },
  typography: {
    fontFamily: '"Space Grotesk", "DM Sans", system-ui, sans-serif',
    h1: { fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1 },
    h2: { fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 },
    h3: { fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.3 },
    h4: { fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.4 },
    h5: { fontWeight: 600, letterSpacing: '-0.01em' },
    h6: { fontWeight: 600, letterSpacing: '-0.005em' },
    subtitle1: { fontWeight: 500, letterSpacing: '0.01em' },
    subtitle2: { fontWeight: 500, letterSpacing: '0.01em' },
    body1: { letterSpacing: '0.01em', lineHeight: 1.7 },
    body2: { letterSpacing: '0.01em', lineHeight: 1.6 },
    button: { fontWeight: 600, letterSpacing: '0.02em', textTransform: 'none' },
    caption: { letterSpacing: '0.04em' },
    overline: { fontWeight: 600, letterSpacing: '0.12em' },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: `
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.2); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.35); }
        ::selection { background: rgba(245,158,11,0.3); }
      `,
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 600,
          padding: '8px 20px',
          transition: 'all 0.18s ease',
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)',
            transform: 'translateY(-1px)',
            boxShadow: '0 8px 24px rgba(245,158,11,0.35)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${alpha('#94A3B8', 0.1)}`,
          transition: 'all 0.2s ease',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, fontSize: '0.72rem', letterSpacing: '0.03em' },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '& fieldset': { borderColor: alpha('#94A3B8', 0.2) },
            '&:hover fieldset': { borderColor: alpha('#94A3B8', 0.4) },
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#1E293B',
          fontSize: '0.75rem',
          fontWeight: 500,
          border: `1px solid ${alpha('#94A3B8', 0.15)}`,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 4, height: 4 },
      },
    },
  },
});

export default theme;
