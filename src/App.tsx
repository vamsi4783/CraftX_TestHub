import { useMemo } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { AuthProvider } from '@/hooks/useAuth';
import { useThemeMode } from '@/hooks/useThemeMode';
import { buildTheme } from '@/theme';
import { queryClient } from '@/lib/queryClient';
import { router } from '@/routes';
import { ToastProvider } from '@/components/common/ToastProvider';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useRealtimeSync }         from '@/hooks/useRealtimeSync';
import { RecorderProvider, FloatingRecorderToolbar } from '@/features/recorder';

function RealtimeSync() {
  useRealtimeSync();
  return null;
}

function ThemedApp() {
  const { mode } = useThemeMode();
  const theme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <AuthProvider>
          <RecorderProvider>
            <RealtimeSync />
            <RouterProvider router={router} />
            <FloatingRecorderToolbar />
            <ToastProvider />
          </RecorderProvider>
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemedApp />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
