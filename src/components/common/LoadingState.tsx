import { Box, CircularProgress, Typography } from '@mui/material';

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={10} gap={2}>
      <CircularProgress size={36} />
      <Typography variant="body2" color="text.secondary">{message}</Typography>
    </Box>
  );
}
