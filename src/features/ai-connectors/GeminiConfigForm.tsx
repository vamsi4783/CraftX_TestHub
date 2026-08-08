import { useState, useEffect } from 'react';
import {
  Box, TextField, MenuItem, FormControlLabel, Switch,
  Typography, Alert, InputAdornment, IconButton,
} from '@mui/material';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import type { AddGeminiParams } from './aiConnectorService';

const MODELS = [
  { value: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash (recommended)' },
  { value: 'gemini-1.5-flash',      label: 'Gemini 1.5 Flash' },
  { value: 'gemini-1.5-pro',        label: 'Gemini 1.5 Pro' },
];

interface Props {
  initial?: Partial<AddGeminiParams>;
  hasExistingKey?: boolean;
  onChange: (params: AddGeminiParams, valid: boolean) => void;
}

export function GeminiConfigForm({ initial, hasExistingKey, onChange }: Props) {
  const [form, setForm] = useState<AddGeminiParams>({
    displayName: initial?.displayName ?? 'Gemini Flash',
    apiKey:      '',
    model:       initial?.model ?? 'gemini-2.0-flash',
    priority:    initial?.priority ?? 10,
    enabled:     initial?.enabled ?? true,
  });

  function validate(f: AddGeminiParams): boolean {
    return f.displayName.trim().length > 0
      && (f.apiKey.length > 0 || !!hasExistingKey)
      && f.priority >= 1;
  }

  // Notify parent of initial state so parent knows validity before any interaction
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onChange(form, validate(form)); }, []);

  function update(patch: Partial<AddGeminiParams>) {
    const next = { ...form, ...patch };
    setForm(next);
    onChange(next, validate(next));
  }

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Alert severity="info" sx={{ fontSize: 13 }}>
        Your API key is stored in your browser session only and never logged or
        sent to TestHub servers.
      </Alert>

      <TextField
        label="Display Name"
        value={form.displayName}
        onChange={e => update({ displayName: e.target.value })}
        required
        fullWidth
        inputProps={{ 'data-testid': 'gemini-display-name' }}
      />

      <TextField
        label={hasExistingKey ? 'API Key (leave blank to keep existing)' : 'API Key'}
        value={form.apiKey}
        onChange={e => update({ apiKey: e.target.value })}
        required={!hasExistingKey}
        fullWidth
        type="password"
        autoComplete="new-password"
        placeholder={hasExistingKey ? '••••••••' : 'AIza...'}
        helperText="Get your key at console.cloud.google.com. Never shared with TestHub."
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton disabled tabIndex={-1} aria-label="key hidden">
                <VisibilityOffIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ),
        }}
        inputProps={{ 'data-testid': 'gemini-api-key' }}
      />

      <TextField
        label="Model"
        value={form.model}
        onChange={e => update({ model: e.target.value })}
        select
        fullWidth
        inputProps={{ 'data-testid': 'gemini-model' }}
      >
        {MODELS.map(m => (
          <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
        ))}
      </TextField>

      <TextField
        label="Priority"
        type="number"
        value={form.priority}
        onChange={e => update({ priority: Number(e.target.value) })}
        fullWidth
        helperText="Lower number = higher priority. 1–49 is primary, 50–149 is standard."
        inputProps={{ min: 1, max: 999, 'data-testid': 'gemini-priority' }}
      />

      <FormControlLabel
        control={
          <Switch
            checked={form.enabled}
            onChange={e => update({ enabled: e.target.checked })}
            data-testid="gemini-enabled"
          />
        }
        label={
          <Box>
            <Typography variant="body2">Enabled</Typography>
            <Typography variant="caption" color="text.secondary">
              Disabled connectors are skipped by the orchestrator.
            </Typography>
          </Box>
        }
      />
    </Box>
  );
}
