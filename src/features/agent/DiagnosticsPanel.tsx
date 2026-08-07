import { Card, CardHeader, CardContent, Box, Typography, LinearProgress, Grid } from '@mui/material';
import type { AgentHealthReport, ConnectionDiagnostics } from './AgentTypes';

function MetricRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="caption" fontWeight={600}>{value}</Typography>
    </Box>
  );
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

interface Props {
  health: AgentHealthReport | null;
  diagnostics: ConnectionDiagnostics | null;
}

export function DiagnosticsPanel({ health, diagnostics }: Props) {
  const memPct = health
    ? Math.round((health.memoryUsedMb / health.memoryTotalMb) * 100)
    : 0;

  return (
    <Grid container spacing={2}>
      {/* Runtime metrics */}
      <Grid item xs={12} sm={6}>
        <Card variant="outlined" sx={{ height: '100%' }}>
          <CardHeader
            title="Runtime Metrics"
            titleTypographyProps={{ variant: 'subtitle2', fontWeight: 700 }}
            sx={{ pb: 0 }}
          />
          <CardContent>
            {!health ? (
              <Typography variant="body2" color="text.secondary">No health data yet.</Typography>
            ) : (
              <>
                <MetricRow label="Uptime"           value={formatMs(health.uptimeMs)} />
                <MetricRow label="Active Executions" value={health.activeExecutions} />
                <MetricRow label="Queue Depth"       value={health.queueDepth} />
                <MetricRow label="CPU"               value={`${health.cpuPercent.toFixed(1)}%`} />
                <Box sx={{ mt: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">Memory</Typography>
                    <Typography variant="caption" fontWeight={600}>
                      {health.memoryUsedMb} / {health.memoryTotalMb} MB ({memPct}%)
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={memPct}
                    color={memPct > 90 ? 'error' : memPct > 70 ? 'warning' : 'primary'}
                    sx={{ borderRadius: 1 }}
                  />
                </Box>
              </>
            )}
          </CardContent>
        </Card>
      </Grid>

      {/* Connection diagnostics */}
      <Grid item xs={12} sm={6}>
        <Card variant="outlined" sx={{ height: '100%' }}>
          <CardHeader
            title="Connection Diagnostics"
            titleTypographyProps={{ variant: 'subtitle2', fontWeight: 700 }}
            sx={{ pb: 0 }}
          />
          <CardContent>
            {!diagnostics ? (
              <Typography variant="body2" color="text.secondary">No diagnostics yet. Click Refresh Diagnostics.</Typography>
            ) : (
              <>
                <MetricRow label="Protocol"        value={diagnostics.protocolVersion} />
                <MetricRow label="Server"          value={diagnostics.serverUrl} />
                <MetricRow label="Reconnects"      value={diagnostics.reconnectCount} />
                <MetricRow label="Messages Sent"   value={diagnostics.messagesSent} />
                <MetricRow label="Messages Rcvd"   value={diagnostics.messagesReceived} />
                <MetricRow label="Last Heartbeat"  value={
                  diagnostics.lastHeartbeatAt
                    ? new Date(diagnostics.lastHeartbeatAt).toLocaleTimeString()
                    : '—'
                } />
              </>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
