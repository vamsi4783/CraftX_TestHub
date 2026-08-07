import {
  Card, CardHeader, CardContent, Grid, TextField, MenuItem, Select,
  FormControl, InputLabel, Typography, Button, Box,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { useState } from 'react';
import type { AgentConnectionSettings, DiagnosticsLevel, LogLevel } from './AgentTypes';

interface Props {
  settings: AgentConnectionSettings;
  onSave: (patch: Partial<AgentConnectionSettings>) => void;
}

export function ConnectionSettings({ settings, onSave }: Props) {
  const [local, setLocal] = useState<AgentConnectionSettings>(settings);

  function patch<K extends keyof AgentConnectionSettings>(
    key: K,
    value: AgentConnectionSettings[K],
  ) {
    setLocal(prev => ({ ...prev, [key]: value }));
  }

  function patchPolicy(key: keyof AgentConnectionSettings['reconnectPolicy'], value: number) {
    setLocal(prev => ({
      ...prev,
      reconnectPolicy: { ...prev.reconnectPolicy, [key]: value },
    }));
  }

  return (
    <Card variant="outlined">
      <CardHeader
        title="Connection Settings"
        titleTypographyProps={{ variant: 'subtitle2', fontWeight: 700 }}
        sx={{ pb: 0 }}
      />
      <CardContent>
        <Typography variant="caption" color="text.secondary" display="block" mb={2}>
          Changes take effect on the next connection. No direct runtime mutation.
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              label="Server URL"
              size="small"
              fullWidth
              value={local.serverUrl}
              onChange={e => patch('serverUrl', e.target.value)}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              label="Heartbeat Interval (ms)"
              size="small"
              fullWidth
              type="number"
              value={local.heartbeatIntervalMs}
              onChange={e => patch('heartbeatIntervalMs', Number(e.target.value))}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl size="small" fullWidth>
              <InputLabel>Diagnostics Level</InputLabel>
              <Select
                label="Diagnostics Level"
                value={local.diagnosticsLevel}
                onChange={e => patch('diagnosticsLevel', e.target.value as DiagnosticsLevel)}
              >
                <MenuItem value="none">None</MenuItem>
                <MenuItem value="basic">Basic</MenuItem>
                <MenuItem value="verbose">Verbose</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl size="small" fullWidth>
              <InputLabel>Log Level</InputLabel>
              <Select
                label="Log Level"
                value={local.logLevel}
                onChange={e => patch('logLevel', e.target.value as LogLevel)}
              >
                <MenuItem value="debug">Debug</MenuItem>
                <MenuItem value="info">Info</MenuItem>
                <MenuItem value="warn">Warn</MenuItem>
                <MenuItem value="error">Error</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Reconnect policy */}
          <Grid item xs={12}>
            <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={1}>
              Reconnect Policy
            </Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={6} sm={3}>
                <TextField
                  label="Max Attempts"
                  size="small"
                  fullWidth
                  type="number"
                  value={local.reconnectPolicy.maxAttempts}
                  onChange={e => patchPolicy('maxAttempts', Number(e.target.value))}
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField
                  label="Initial Delay (ms)"
                  size="small"
                  fullWidth
                  type="number"
                  value={local.reconnectPolicy.initialDelayMs}
                  onChange={e => patchPolicy('initialDelayMs', Number(e.target.value))}
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField
                  label="Backoff Multiplier"
                  size="small"
                  fullWidth
                  type="number"
                  value={local.reconnectPolicy.backoffMultiplier}
                  onChange={e => patchPolicy('backoffMultiplier', Number(e.target.value))}
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField
                  label="Max Delay (ms)"
                  size="small"
                  fullWidth
                  type="number"
                  value={local.reconnectPolicy.maxDelayMs}
                  onChange={e => patchPolicy('maxDelayMs', Number(e.target.value))}
                />
              </Grid>
            </Grid>
          </Grid>
        </Grid>

        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<SaveIcon />}
            onClick={() => onSave(local)}
          >
            Save Settings
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
