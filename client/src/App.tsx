import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import { AppProvider } from './store/AppContext';
import ProjectsPage from './pages/ProjectsPage';
import WorkspacePage from './pages/WorkspacePage';
import ToastProvider from './components/common/ToastProvider';
import ErrorBoundary from './components/common/ErrorBoundary';

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary title="Application unavailable">
        <AppProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<ProjectsPage />} />
              <Route path="/project/:projectId" element={<WorkspacePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <ToastProvider />
          </BrowserRouter>
        </AppProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
