import { Box, Card, CardContent, Typography, Chip, Grid, Divider } from '@mui/material';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import type { AgentState, ConnectionState } from './AgentTypes';

const AGENT_STATE_COLOR: Record<AgentState, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  Created:  'default',
  Starting: 'info',
  Running:  'success',
  Stopping: 'warning',
  Stopped:  'default',
  Faulted:  'error',
};

interface Props {
  agentId:         string;
  agentVersion:    string;
  protocolVersion: string;
  agentState:      AgentState;
  connectionState: ConnectionState;
  heartbeatSeq:    number;
  lastHeartbeatAt: string | null;
}

export function AgentPanel({
  agentId,
  agentVersion,
  protocolVersion,
  agentState,
  connectionState,
  heartbeatSeq,
  lastHeartbeatAt,
}: Props) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
            Agent Panel
          </Typography>
          <ConnectionStatusBadge state={connectionState} />
          <Chip
            label={agentState}
            size="small"
            color={AGENT_STATE_COLOR[agentState]}
          />
        </Box>

        <Divider sx={{ mb: 2 }} />

        <Grid container spacing={1.5}>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" color="text.secondary" display="block">Agent ID</Typography>
            <Typography variant="body2" fontWeight={600} noWrap>{agentId}</Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" color="text.secondary" display="block">Version</Typography>
            <Typography variant="body2" fontWeight={600}>{agentVersion}</Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" color="text.secondary" display="block">Protocol</Typography>
            <Typography variant="body2" fontWeight={600}>{protocolVersion}</Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" color="text.secondary" display="block">Heartbeat #</Typography>
            <Typography variant="body2" fontWeight={600}>{heartbeatSeq}</Typography>
          </Grid>
          {lastHeartbeatAt && (
            <Grid item xs={12}>
              <Typography variant="caption" color="text.secondary">
                Last heartbeat: {new Date(lastHeartbeatAt).toLocaleTimeString()}
              </Typography>
            </Grid>
          )}
        </Grid>
      </CardContent>
    </Card>
  );
}
