import { useRef, useEffect } from 'react';
import { Box, Card, CardHeader, CardContent, Typography, IconButton, Tooltip } from '@mui/material';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import type { ExecutionEvent } from './AgentTypes';

interface Props {
  events: ExecutionEvent[];
  onClear: () => void;
}

const EVENT_COLOR: Record<string, string> = {
  ExecuteTest:     '#4ade80',
  CancelExecution: '#f87171',
  StepCompleted:   '#60a5fa',
  StepFailed:      '#f87171',
  DriverEvent:     '#a78bfa',
};

export function ExecutionConsole({ events, onClear }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  return (
    <Card variant="outlined">
      <CardHeader
        title="Execution Console"
        titleTypographyProps={{ variant: 'subtitle2', fontWeight: 700 }}
        action={
          <Tooltip title="Clear console">
            <IconButton size="small" onClick={onClear}>
              <DeleteSweepIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        }
        sx={{ pb: 0 }}
      />
      <CardContent sx={{ p: 0 }}>
        <Box
          sx={{
            fontFamily: 'monospace',
            fontSize: 12,
            bgcolor: 'grey.950',
            backgroundColor: (theme) => theme.palette.mode === 'dark' ? '#0d1117' : '#1e1e1e',
            color: '#d4d4d4',
            p: 1.5,
            height: 240,
            overflowY: 'auto',
            borderRadius: '0 0 4px 4px',
          }}
        >
          {events.length === 0 ? (
            <Typography variant="caption" sx={{ color: '#6b7280', fontFamily: 'monospace' }}>
              No events yet. Use the Command Console to dispatch commands.
            </Typography>
          ) : (
            [...events].reverse().map(e => {
              const color = EVENT_COLOR[e.eventType] ?? '#d4d4d4';
              return (
                <Box key={e.id} sx={{ mb: 0.5, lineHeight: 1.6 }}>
                  <Box component="span" sx={{ color: '#6b7280', mr: 1 }}>
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </Box>
                  <Box component="span" sx={{ color, mr: 1, fontWeight: 700 }}>
                    [{e.eventType}]
                  </Box>
                  <Box component="span" sx={{ color: '#9ca3af' }}>
                    {JSON.stringify(e.payload)}
                  </Box>
                </Box>
              );
            })
          )}
          <div ref={bottomRef} />
        </Box>
      </CardContent>
    </Card>
  );
}
