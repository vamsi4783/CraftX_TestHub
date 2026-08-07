// ─── RecordActionDialog ───────────────────────────────────────────────────────
// Quick-log dialog shown during an active recording session.
// Lets the user describe the action they just performed on the device
// and adds it as a RecordedStep.

import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, ToggleButton, ToggleButtonGroup, TextField,
  Typography, Box, Stack, Divider, Alert,
} from '@mui/material';
import {
  ANDROID_ACTIONS,
  CHROME_ACTIONS,
  ACTION_UI_META,
} from './recorderTypes';
import type {
  RecordableDriver,
  RecordableAction,
  RecordedParams,
} from './recorderTypes';

// ─── Param input per action ───────────────────────────────────────────────────

function ParamFields({
  action,
  params,
  onChange,
}: {
  action: RecordableAction;
  params: RecordedParams;
  onChange: (p: RecordedParams) => void;
}) {
  const set = (patch: RecordedParams) => onChange({ ...params, ...patch });

  switch (action) {
    case 'tap':
    case 'click':
      return (
        <Stack direction="row" spacing={1}>
          <TextField label="X (px)" type="number" size="small" sx={{ width: 110 }}
            value={params.x ?? ''} onChange={e => set({ x: e.target.value ? Number(e.target.value) : undefined })} />
          <TextField label="Y (px)" type="number" size="small" sx={{ width: 110 }}
            value={params.y ?? ''} onChange={e => set({ y: e.target.value ? Number(e.target.value) : undefined })} />
        </Stack>
      );

    case 'swipe':
      return (
        <Stack spacing={1}>
          <Stack direction="row" spacing={1}>
            <TextField label="From X" type="number" size="small" sx={{ width: 110 }}
              value={params.x  ?? ''} onChange={e => set({ x:  e.target.value ? Number(e.target.value) : undefined })} />
            <TextField label="From Y" type="number" size="small" sx={{ width: 110 }}
              value={params.y  ?? ''} onChange={e => set({ y:  e.target.value ? Number(e.target.value) : undefined })} />
            <TextField label="To X"   type="number" size="small" sx={{ width: 110 }}
              value={params.x2 ?? ''} onChange={e => set({ x2: e.target.value ? Number(e.target.value) : undefined })} />
            <TextField label="To Y"   type="number" size="small" sx={{ width: 110 }}
              value={params.y2 ?? ''} onChange={e => set({ y2: e.target.value ? Number(e.target.value) : undefined })} />
          </Stack>
          <TextField label="Duration (ms)" type="number" size="small" sx={{ width: 140 }}
            value={params.duration_ms ?? 300}
            onChange={e => set({ duration_ms: Number(e.target.value) })} />
        </Stack>
      );

    case 'type_text':
    case 'press_key':
    case 'launch_app':
    case 'navigate':
      return (
        <TextField
          label={action === 'navigate' ? 'URL' : action === 'launch_app' ? 'Package name' : action === 'press_key' ? 'Key code' : 'Text'}
          size="small" fullWidth multiline={action === 'type_text'} rows={action === 'type_text' ? 2 : 1}
          value={params.value ?? ''}
          onChange={e => set({ value: e.target.value })}
          placeholder={
            action === 'navigate'   ? 'https://example.com' :
            action === 'launch_app' ? 'com.example.app' :
            action === 'press_key'  ? 'KEYCODE_HOME' : ''
          }
        />
      );

    case 'fill':
      return (
        <Stack spacing={1}>
          <TextField label="CSS selector" size="small" fullWidth
            value={params.selector ?? ''} onChange={e => set({ selector: e.target.value })}
            placeholder="#email-input" />
          <TextField label="Value" size="small" fullWidth
            value={params.value ?? ''} onChange={e => set({ value: e.target.value })} />
        </Stack>
      );

    case 'scroll':
      return (
        <Stack direction="row" spacing={1} alignItems="center">
          <ToggleButtonGroup exclusive size="small"
            value={params.direction ?? 'down'}
            onChange={(_, v) => v && set({ direction: v })}>
            {(['up','down','left','right'] as const).map(d => (
              <ToggleButton key={d} value={d} sx={{ fontSize: 11, py: 0.5, px: 1 }}>{d}</ToggleButton>
            ))}
          </ToggleButtonGroup>
          <TextField label="Amount (px)" type="number" size="small" sx={{ width: 120 }}
            value={params.amount ?? 300} onChange={e => set({ amount: Number(e.target.value) })} />
        </Stack>
      );

    case 'wait':
      return (
        <TextField label="Duration (ms)" type="number" size="small" sx={{ width: 160 }}
          value={params.duration_ms ?? 1000}
          onChange={e => set({ duration_ms: Number(e.target.value) })} />
      );

    case 'press_back':
    case 'screenshot':
    case 'assertion':
      return (
        <Alert severity="info" sx={{ py: 0.5 }}>No parameters required for this action.</Alert>
      );

    default:
      return null;
  }
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

interface RecordActionDialogProps {
  open:    boolean;
  onClose: () => void;
  onLog:   (driver: RecordableDriver, action: RecordableAction, params: RecordedParams) => void;
}

export function RecordActionDialog({ open, onClose, onLog }: RecordActionDialogProps) {
  const [driver, setDriver] = useState<RecordableDriver>('android');
  const [action, setAction] = useState<RecordableAction>('tap');
  const [params, setParams] = useState<RecordedParams>({});

  const availableActions = driver === 'android'
    ? (ANDROID_ACTIONS as readonly RecordableAction[])
    : (CHROME_ACTIONS  as readonly RecordableAction[]);

  const handleDriverChange = (d: RecordableDriver) => {
    setDriver(d);
    const first = d === 'android' ? ANDROID_ACTIONS[0] : CHROME_ACTIONS[0];
    setAction(first as RecordableAction);
    setParams({});
  };

  const handleActionChange = (a: RecordableAction) => {
    setAction(a);
    setParams({});
  };

  const handleLog = () => {
    onLog(driver, action, params);
    setParams({});
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>Log Action</Typography>
        <Typography variant="caption" color="text.secondary">
          Record the action you just performed on the device.
        </Typography>
      </DialogTitle>

      <DialogContent>
        {/* Driver toggle */}
        <Box mb={2}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={0.75}>
            TARGET DRIVER
          </Typography>
          <ToggleButtonGroup exclusive size="small"
            value={driver}
            onChange={(_, v) => v && handleDriverChange(v as RecordableDriver)}>
            <ToggleButton value="android">Android</ToggleButton>
            <ToggleButton value="browser">Browser</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Action picker */}
        <Box mb={2}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={0.75}>
            ACTION
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={0.75}>
            {availableActions.map(a => (
              <ToggleButton
                key={a}
                value={a}
                selected={action === a}
                onChange={() => handleActionChange(a)}
                size="small"
                sx={{
                  px: 1.5, py: 0.5, fontSize: 12,
                  '&.Mui-selected': { bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' } },
                }}
              >
                {ACTION_UI_META[a]?.label ?? a}
              </ToggleButton>
            ))}
          </Box>
          {ACTION_UI_META[action] && (
            <Typography variant="caption" color="text.disabled" mt={0.75} display="block">
              {ACTION_UI_META[action].description}
            </Typography>
          )}
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Params */}
        <Box>
          <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={1}>
            PARAMETERS
          </Typography>
          <ParamFields action={action} params={params} onChange={setParams} />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} size="small">Cancel</Button>
        <Button variant="contained" size="small" onClick={handleLog}>
          Log Action
        </Button>
      </DialogActions>
    </Dialog>
  );
}
