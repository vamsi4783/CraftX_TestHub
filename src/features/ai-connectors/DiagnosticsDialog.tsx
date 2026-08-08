import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Chip, Divider, CircularProgress,
  Table, TableBody, TableRow, TableCell,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { ConnectorDiagnosticReport } from '@/ai';
import type { PersistedConnector } from './aiConnectorStore';

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  connected:    'success',
  degraded:     'warning',
  error:        'error',
  disconnected: 'default',
};

interface Props {
  open: boolean;
  connector: PersistedConnector | null;
  onClose: () => void;
  onRunDiagnostics: (id: string) => Promise<ConnectorDiagnosticReport | null>;
}

export function DiagnosticsDialog({ open, connector, onClose, onRunDiagnostics }: Props) {
  const [report, setReport] = useState<ConnectorDiagnosticReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && connector) runDiagnostics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connector?.id]);

  async function runDiagnostics() {
    if (!connector) return;
    setLoading(true);
    setError('');
    try {
      const r = await onRunDiagnostics(connector.id);
      setReport(r);
      if (!r) setError('Diagnostics not available for this connector type.');
    } catch {
      setError('Failed to run diagnostics.');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setReport(null);
    setError('');
    onClose();
  }

  const caps = report?.capabilities;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Diagnostics — {connector?.displayName ?? ''}
      </DialogTitle>

      <DialogContent>
        {loading && (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        )}
        {!loading && error && (
          <Typography color="text.secondary">{error}</Typography>
        )}
        {!loading && report && (
          <Box>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <Chip
                label={report.health.status}
                color={STATUS_COLOR[report.health.status] ?? 'default'}
                size="small"
                data-testid="diag-health-status"
              />
              {report.latencyMs !== undefined && (
                <Typography variant="body2" color="text.secondary">
                  {report.latencyMs}ms
                </Typography>
              )}
            </Box>

            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell><Typography variant="caption" color="text.secondary">Connector ID</Typography></TableCell>
                  <TableCell><Typography variant="body2">{report.connectorId}</Typography></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell><Typography variant="caption" color="text.secondary">Type</Typography></TableCell>
                  <TableCell><Typography variant="body2">{report.type}</Typography></TableCell>
                </TableRow>
                {report.model && (
                  <TableRow>
                    <TableCell><Typography variant="caption" color="text.secondary">Model</Typography></TableCell>
                    <TableCell><Typography variant="body2">{report.model}</Typography></TableCell>
                  </TableRow>
                )}
                {report.endpoint && (
                  <TableRow>
                    <TableCell><Typography variant="caption" color="text.secondary">Endpoint</Typography></TableCell>
                    <TableCell><Typography variant="body2">{report.endpoint}</Typography></TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell><Typography variant="caption" color="text.secondary">Version</Typography></TableCell>
                  <TableCell><Typography variant="body2">{report.version}</Typography></TableCell>
                </TableRow>
                {report.stats && (
                  <>
                    <TableRow>
                      <TableCell><Typography variant="caption" color="text.secondary">Requests</Typography></TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {report.stats.requestCount} ({Math.round(report.stats.availability * 100)}% success)
                        </Typography>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Typography variant="caption" color="text.secondary">Avg Latency</Typography></TableCell>
                      <TableCell><Typography variant="body2">{report.stats.latencyMsAvg}ms</Typography></TableCell>
                    </TableRow>
                    {report.stats.lastSuccessAt && (
                      <TableRow>
                        <TableCell><Typography variant="caption" color="text.secondary">Last Success</Typography></TableCell>
                        <TableCell><Typography variant="body2">{new Date(report.stats.lastSuccessAt).toLocaleString()}</Typography></TableCell>
                      </TableRow>
                    )}
                    {report.stats.lastFailureAt && (
                      <TableRow>
                        <TableCell><Typography variant="caption" color="text.secondary">Last Failure</Typography></TableCell>
                        <TableCell><Typography variant="body2">{new Date(report.stats.lastFailureAt).toLocaleString()}</Typography></TableCell>
                      </TableRow>
                    )}
                  </>
                )}
              </TableBody>
            </Table>

            {caps && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  Capabilities
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={0.5}>
                  {caps.supportsStreaming    && <Chip label="Streaming"    size="small" />}
                  {caps.supportsVision       && <Chip label="Vision"       size="small" />}
                  {caps.supportsJSON         && <Chip label="JSON Mode"    size="small" />}
                  {caps.supportsTools        && <Chip label="Tool Use"     size="small" />}
                  {caps.supportsReasoning    && <Chip label="Reasoning"    size="small" />}
                  {caps.supportsLongContext  && <Chip label="Long Context" size="small" />}
                  {caps.maxContextTokens     && (
                    <Chip label={`${(caps.maxContextTokens / 1000).toFixed(0)}k ctx`} size="small" />
                  )}
                </Box>
              </>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button
          startIcon={<RefreshIcon />}
          onClick={runDiagnostics}
          disabled={loading}
          data-testid="run-diagnostics-btn"
        >
          Run Again
        </Button>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
