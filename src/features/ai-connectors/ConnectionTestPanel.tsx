import { Box, Typography, Chip, Divider, Alert } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import type { ConnectorTestResult } from './aiConnectorService';

interface Props {
  result: ConnectorTestResult;
}

export function ConnectionTestPanel({ result }: Props) {
  if (result.success) {
    return (
      <Box data-testid="test-result-success">
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <CheckCircleIcon color="success" />
          <Typography variant="subtitle2" color="success.main" fontWeight={700}>
            Connected
          </Typography>
        </Box>
        {result.health && (
          <Box display="flex" flexDirection="column" gap={0.5} ml={4}>
            {result.health.latencyMs !== undefined && (
              <Typography variant="body2" color="text.secondary">
                Latency: <strong>{result.health.latencyMs}ms</strong>
              </Typography>
            )}
            {result.health.message && (
              <Typography variant="body2" color="text.secondary">
                {result.health.message}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box data-testid="test-result-failure">
      <Box display="flex" alignItems="center" gap={1} mb={1}>
        <ErrorIcon color="error" />
        <Typography variant="subtitle2" color="error.main" fontWeight={700}>
          Connection failed
        </Typography>
      </Box>
      {result.errorMessage && (
        <Alert severity="error" sx={{ mt: 1, fontSize: 13 }} data-testid="test-error-message">
          {result.errorMessage}
        </Alert>
      )}
      {result.suggestedFix && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography variant="caption" color="text.secondary">
            Suggested fix: {result.suggestedFix}
          </Typography>
        </>
      )}
    </Box>
  );
}
