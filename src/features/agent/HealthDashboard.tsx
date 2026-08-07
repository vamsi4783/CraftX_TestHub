import { Card, CardHeader, CardContent, Box, Typography, Chip, Grid } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorIcon from '@mui/icons-material/Error';
import type { AgentHealthReport, HealthStatus } from './AgentTypes';

const STATUS_CONFIG: Record<HealthStatus, {
  color: 'success' | 'warning' | 'error';
  Icon: typeof CheckCircleIcon;
  label: string;
}> = {
  healthy:   { color: 'success', Icon: CheckCircleIcon,  label: 'Healthy' },
  degraded:  { color: 'warning', Icon: WarningAmberIcon, label: 'Degraded' },
  unhealthy: { color: 'error',   Icon: ErrorIcon,        label: 'Unhealthy' },
};

interface StatTileProps {
  label: string;
  value: string | number;
  sub?: string;
}

function StatTile({ label, value, sub }: StatTileProps) {
  return (
    <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6" fontWeight={700} lineHeight={1.2}>{value}</Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Box>
  );
}

interface Props {
  health: AgentHealthReport | null;
}

export function HealthDashboard({ health }: Props) {
  if (!health) {
    return (
      <Card variant="outlined">
        <CardHeader title="Health Dashboard" titleTypographyProps={{ variant: 'subtitle2', fontWeight: 700 }} sx={{ pb: 0 }} />
        <CardContent>
          <Typography variant="body2" color="text.secondary">No health data. Agent not connected.</Typography>
        </CardContent>
      </Card>
    );
  }

  const cfg = STATUS_CONFIG[health.status];
  const { Icon } = cfg;

  return (
    <Card variant="outlined">
      <CardHeader
        title="Health Dashboard"
        titleTypographyProps={{ variant: 'subtitle2', fontWeight: 700 }}
        action={
          <Chip
            icon={<Icon sx={{ fontSize: '16px !important' }} />}
            label={cfg.label}
            color={cfg.color}
            size="small"
          />
        }
        sx={{ pb: 1 }}
      />
      <CardContent sx={{ pt: 0 }}>
        <Grid container spacing={1.5}>
          <Grid item xs={6} sm={3}>
            <StatTile label="CPU" value={`${health.cpuPercent.toFixed(1)}%`} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatTile
              label="Memory"
              value={`${health.memoryUsedMb} MB`}
              sub={`of ${health.memoryTotalMb} MB`}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatTile label="Active Runs" value={health.activeExecutions} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatTile label="Queue Depth" value={health.queueDepth} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatTile label="Drivers" value={health.connectedDrivers} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatTile label="Devices" value={health.connectedDevices} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <StatTile
              label="Reported At"
              value={new Date(health.reportedAt).toLocaleTimeString()}
            />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
