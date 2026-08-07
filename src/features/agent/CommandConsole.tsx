import { useState } from 'react';
import {
  Card, CardHeader, CardContent, Box, TextField, Button, Grid, Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import RefreshIcon from '@mui/icons-material/Refresh';
import DevicesIcon from '@mui/icons-material/Devices';

interface Props {
  onExecuteTest:        (sessionId: string, testCaseId: string) => void;
  onCancelExecution:    (sessionId: string) => void;
  onRefreshDiagnostics: () => void;
  onRefreshDevices:     () => void;
}

export function CommandConsole({
  onExecuteTest,
  onCancelExecution,
  onRefreshDiagnostics,
  onRefreshDevices,
}: Props) {
  const [sessionId,  setSessionId]  = useState('');
  const [testCaseId, setTestCaseId] = useState('');

  return (
    <Card variant="outlined">
      <CardHeader
        title="Command Console"
        titleTypographyProps={{ variant: 'subtitle2', fontWeight: 700 }}
        sx={{ pb: 0 }}
      />
      <CardContent>
        <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
          Dispatch commands to the agent runtime.
        </Typography>

        {/* Execute Test */}
        <Box sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
          <Typography variant="caption" fontWeight={600} display="block" mb={1}>Execute Test</Typography>
          <Grid container spacing={1} alignItems="center">
            <Grid item xs={12} sm={5}>
              <TextField
                label="Session ID"
                size="small"
                fullWidth
                value={sessionId}
                onChange={e => setSessionId(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField
                label="Test Case ID"
                size="small"
                fullWidth
                value={testCaseId}
                onChange={e => setTestCaseId(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={2}>
              <Button
                variant="contained"
                size="small"
                startIcon={<PlayArrowIcon />}
                fullWidth
                onClick={() => onExecuteTest(sessionId.trim(), testCaseId.trim())}
                disabled={!sessionId.trim() || !testCaseId.trim()}
              >
                Run
              </Button>
            </Grid>
          </Grid>
        </Box>

        {/* Cancel Execution */}
        <Box sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
          <Typography variant="caption" fontWeight={600} display="block" mb={1}>Cancel Execution</Typography>
          <Grid container spacing={1} alignItems="center">
            <Grid item xs={12} sm={10}>
              <TextField
                label="Session ID"
                size="small"
                fullWidth
                value={sessionId}
                onChange={e => setSessionId(e.target.value)}
                placeholder="same session ID"
              />
            </Grid>
            <Grid item xs={12} sm={2}>
              <Button
                variant="outlined"
                size="small"
                color="error"
                startIcon={<StopIcon />}
                fullWidth
                onClick={() => onCancelExecution(sessionId.trim())}
                disabled={!sessionId.trim()}
              >
                Cancel
              </Button>
            </Grid>
          </Grid>
        </Box>

        {/* Utility commands */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={onRefreshDiagnostics}
          >
            Refresh Diagnostics
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DevicesIcon />}
            onClick={onRefreshDevices}
          >
            Refresh Devices
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
