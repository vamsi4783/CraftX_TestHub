import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Box, Alert, CircularProgress, Divider,
} from '@mui/material';
import VideoCallIcon    from '@mui/icons-material/VideoCall';
import FolderOpenIcon   from '@mui/icons-material/FolderOpen';
import { useRecorderContext } from './RecorderContext';
import type { RecordingConfig } from './types';

interface Props {
  open:          boolean;
  onClose:       () => void;
  testSessionId?: string;
  releaseId?:    string;
  buildVersion?: string;
}

const DEFAULT_FORM: RecordingConfig = {
  deviceName:   '',
  deviceOs:     'Android',
  buildVersion: '',
};

export function RecorderInitDialog({ open, onClose, testSessionId, releaseId, buildVersion }: Props) {
  const { initialize } = useRecorderContext();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [form, setForm] = useState<RecordingConfig>({
    ...DEFAULT_FORM,
    buildVersion: buildVersion ?? '',
    testSessionId,
    releaseId,
  });

  const set = (field: keyof RecordingConfig, value: string) =>
    setForm(f => ({ ...f, [field]: value }));

  const handleConfirm = async () => {
    if (!form.deviceName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await initialize({ ...form });
      onClose();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message :
        (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) :
        'Failed to initialize recorder';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <VideoCallIcon color="error" />
        Initialize Execution Recorder
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 0.5 }}>
        <Alert severity="info" sx={{ py: 0.5 }}>
          The recording toolbar appears after initialization. Nothing is recorded until
          you press <strong>● Record</strong>.
        </Alert>

        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          label="Device Name *"
          value={form.deviceName}
          onChange={e => set('deviceName', e.target.value)}
          placeholder="Samsung Galaxy S24, Pixel 8 Pro…"
          fullWidth size="small" autoFocus
        />
        <Box display="flex" gap={2}>
          <TextField
            label="OS / Version"
            value={form.deviceOs}
            onChange={e => set('deviceOs', e.target.value)}
            placeholder="Android 14"
            fullWidth size="small"
          />
          <TextField
            label="Build / App Version"
            value={form.buildVersion}
            onChange={e => set('buildVersion', e.target.value)}
            placeholder="v2.4.1 (build 221)"
            fullWidth size="small"
          />
        </Box>

        <Divider />

        {/* Local storage preview */}
        <Box>
          <Box display="flex" alignItems="center" gap={0.75} mb={0.75}>
            <FolderOpenIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Local storage path (on Automation Runner)
            </Typography>
          </Box>
          <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover' }}>
            <Typography
              variant="caption"
              fontFamily="'Roboto Mono', monospace"
              color="text.secondary"
              sx={{ whiteSpace: 'pre', lineHeight: 1.8, display: 'block' }}
            >
              {`TestHub/Executions/<execution-id>/\n├── Video/\n│   └── execution.mp4\n├── Screenshots/\n├── Logs/\n│   └── logcat.txt\n├── Timeline.json\n└── Metadata.json`}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
            Binary files (video, logs, screenshots) are never uploaded to Supabase.
            Only metadata paths and durations are stored.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} color="inherit" disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          disabled={!form.deviceName.trim() || loading}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <VideoCallIcon />}
          onClick={handleConfirm}
        >
          {loading ? 'Connecting to Runner…' : 'Initialize Recorder'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
