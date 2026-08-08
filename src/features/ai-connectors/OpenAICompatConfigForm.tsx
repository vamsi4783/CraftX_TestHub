import { useState, useEffect } from 'react';
import {
  Box, TextField, FormControlLabel, Switch, Typography,
  Alert, InputAdornment, IconButton,
} from '@mui/material';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import type { AddOpenAICompatParams } from './aiConnectorService';

interface Props {
  initial?: Partial<AddOpenAICompatParams>;
  hasExistingKey?: boolean;
  onChange: (params: AddOpenAICompatParams, valid: boolean) => void;
}

export function OpenAICompatConfigForm({ initial, hasExistingKey, onChange }: Props) {
  const [form, setForm] = useState<AddOpenAICompatParams>({
    displayName: initial?.displayName ?? 'OpenAI-Compatible',
    baseUrl:     initial?.baseUrl     ?? '',
    apiKey:      '',
    model:       initial?.model       ?? '',
    priority:    initial?.priority    ?? 50,
    enabled:     initial?.enabled     ?? true,
  });

  function validate(f: AddOpenAICompatParams): boolean {
    return f.displayName.trim().length > 0
      && f.baseUrl.trim().length > 0
      && f.model.trim().length > 0
      && f.priority >= 1;
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onChange(form, validate(form)); }, []);

  function update(patch: Partial<AddOpenAICompatParams>) {
    const next = { ...form, ...patch };
    setForm(next);
    onChange(next, validate(next));
  }

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Alert severity="info" sx={{ fontSize: 13 }}>
        Connect any endpoint that follows the OpenAI chat completions API.
        Works with Groq, OpenRouter, vLLM, LM Studio, Together AI, and more.
      </Alert>

      <TextField
        label="Display Name"
        value={form.displayName}
        onChange={e => update({ displayName: e.target.value })}
        required
        fullWidth
        inputProps={{ 'data-testid': 'oai-display-name' }}
      />

      <TextField
        label="Base URL"
        value={form.baseUrl}
        onChange={e => update({ baseUrl: e.target.value })}
        required
        fullWidth
        placeholder="https://api.groq.com/openai/v1"
        helperText="The base URL of the OpenAI-compatible endpoint (without /chat/completions)."
        inputProps={{ 'data-testid': 'oai-base-url' }}
      />

      <TextField
        label={hasExistingKey ? 'API Key (leave blank to keep existing)' : 'API Key (optional for local endpoints)'}
        value={form.apiKey}
        onChange={e => update({ apiKey: e.target.value })}
        fullWidth
        type="password"
        autoComplete="new-password"
        placeholder={hasExistingKey ? '••••••••' : 'sk-...  (leave blank for local endpoints)'}
        helperText="Leave blank for endpoints that don't require authentication."
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton disabled tabIndex={-1} aria-label="key hidden">
                <VisibilityOffIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ),
        }}
        inputProps={{ 'data-testid': 'oai-api-key' }}
      />

      <TextField
        label="Model"
        value={form.model}
        onChange={e => update({ model: e.target.value })}
        required
        fullWidth
        placeholder="llama3-70b-8192 / mistral-7b / auto"
        helperText="The model name as accepted by the endpoint."
        inputProps={{ 'data-testid': 'oai-model' }}
      />

      <TextField
        label="Priority"
        type="number"
        value={form.priority}
        onChange={e => update({ priority: Number(e.target.value) })}
        fullWidth
        helperText="Lower number = higher priority."
        inputProps={{ min: 1, max: 999, 'data-testid': 'oai-priority' }}
      />

      <FormControlLabel
        control={
          <Switch
            checked={form.enabled}
            onChange={e => update({ enabled: e.target.checked })}
            data-testid="oai-enabled"
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
