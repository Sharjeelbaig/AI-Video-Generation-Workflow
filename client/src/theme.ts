import { createTheme, alpha } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#F4B75E',
      light: '#FAD089',
      dark: '#C88A2F',
      contrastText: '#16110A',
    },
    secondary: {
      main: '#6CC8C3',
      light: '#9EE7E3',
      dark: '#2F918C',
      contrastText: '#081311',
    },
    error: { main: '#EF4444', light: '#FCA5A5', dark: '#DC2626' },
    warning: { main: '#F97316', light: '#FDBA74', dark: '#EA580C' },
    success: { main: '#10B981', light: '#6EE7B7', dark: '#059669' },
    info: { main: '#3B82F6', light: '#93C5FD', dark: '#2563EB' },
    background: { default: '#09111B', paper: '#0F1824' },
    text: { primary: '#F7F5F0', secondary: '#AAB4C3', disabled: '#5D6775' },
    divider: alpha('#AAB4C3', 0.14),
  },
  typography: {
    fontFamily: '"Space Grotesk", "DM Sans", system-ui, sans-serif',
    h1: { fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.05 },
    h2: { fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.12 },
    h3: { fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.18 },
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
  shape: { borderRadius: 10 },
  components: {
    MuiCssBaseline: {
      styleOverrides: `
        * { box-sizing: border-box; }
        :root {
          --sn-surface: #0F1824;
          --sn-surface-elevated: #132133;
          --sn-glow-primary: rgba(244, 183, 94, 0.2);
          --sn-glow-secondary: rgba(108, 200, 195, 0.16);
        }
        body {
          background:
            radial-gradient(circle at top left, rgba(244, 183, 94, 0.08), transparent 28%),
            radial-gradient(circle at bottom right, rgba(108, 200, 195, 0.08), transparent 26%),
            #09111B;
        }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(170,180,195,0.2); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(170,180,195,0.35); }
        ::selection { background: rgba(244,183,94,0.28); }
      `,
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          fontWeight: 600,
          padding: '8px 20px',
          transition: 'all 0.18s ease',
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #F4B75E 0%, #C88A2F 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #FAD089 0%, #F4B75E 100%)',
            transform: 'translateY(-1px)',
            boxShadow: '0 10px 28px rgba(244,183,94,0.32)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#0F1824',
          border: `1px solid ${alpha('#AAB4C3', 0.1)}`,
          transition: 'all 0.2s ease',
        },
      },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' } },
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
            backgroundColor: alpha('#0F1824', 0.72),
            '& fieldset': { borderColor: alpha('#AAB4C3', 0.2) },
            '&:hover fieldset': { borderColor: alpha('#AAB4C3', 0.4) },
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#162232',
          fontSize: '0.75rem',
          fontWeight: 500,
          border: `1px solid ${alpha('#AAB4C3', 0.15)}`,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: { root: { borderRadius: 4, height: 4 } },
    },
  },
});

export default theme;
