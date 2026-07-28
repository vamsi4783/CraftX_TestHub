import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

interface State { hasError: boolean; message: string }

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center"
        minHeight="60vh" gap={2} p={4} textAlign="center">
        <ErrorOutlineIcon sx={{ fontSize: 64, color: 'error.main', opacity: 0.6 }} />
        <Typography variant="h5" fontWeight={700}>Something went wrong</Typography>
        <Typography variant="body2" color="text.secondary" maxWidth={480}>{this.state.message}</Typography>
        <Button variant="contained" onClick={() => { this.setState({ hasError: false, message: '' }); window.location.reload(); }}>
          Reload Page
        </Button>
      </Box>
    );
  }
}
