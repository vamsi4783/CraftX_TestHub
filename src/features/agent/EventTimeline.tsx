import {
  Card, CardHeader, CardContent, Box, Typography, Chip,
} from '@mui/material';
import type { ExecutionEvent } from './AgentTypes';

const EVENT_CHIP_COLOR: Record<string, 'success' | 'error' | 'info' | 'warning' | 'default'> = {
  ExecuteTest:     'info',
  CancelExecution: 'warning',
  StepCompleted:   'success',
  StepFailed:      'error',
  DriverEvent:     'default',
};

interface Props {
  events: ExecutionEvent[];
}

export function EventTimeline({ events }: Props) {
  const visible = events.slice(0, 50);

  return (
    <Card variant="outlined">
      <CardHeader
        title="Live Event Timeline"
        titleTypographyProps={{ variant: 'subtitle2', fontWeight: 700 }}
        action={
          <Chip label={String(events.length)} size="small" />
        }
        sx={{ pb: 0 }}
      />
      <CardContent sx={{ maxHeight: 300, overflowY: 'auto', pt: 1 }}>
        {visible.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No events recorded.</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {visible.map(e => (
              <Box
                key={e.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  py: 0.5,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, minWidth: 80 }}>
                  {new Date(e.timestamp).toLocaleTimeString()}
                </Typography>
                <Chip
                  label={e.eventType}
                  size="small"
                  color={EVENT_CHIP_COLOR[e.eventType] ?? 'default'}
                  sx={{ flexShrink: 0 }}
                />
                {e.correlationId && (
                  <Typography variant="caption" color="text.secondary" noWrap>
                    corr: {e.correlationId}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
