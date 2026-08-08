import { useState, useEffect } from 'react';
import {
  Box, TextField, FormControlLabel, Switch, Typography,
  Alert, Button, Autocomplete, CircularProgress,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { AddOllamaParams } from './aiConnectorService';

interface Props {
  initial?: Partial<AddOllamaParams>;
  onDiscoverModels: (endpoint: string) => Promise<string[]>;
  onChange: (params: AddOllamaParams, valid: boolean) => void;
}

export function OllamaConfigForm({ initial, onDiscoverModels, onChange }: Props) {
  const [form, setForm] = useState<AddOllamaParams>({
    displayName: initial?.displayName ?? 'Ollama',
    endpoint:    initial?.endpoint    ?? 'http://localhost:11434',
    model:       initial?.model       ?? 'llama3.2',
    priority:    initial?.priority    ?? 20,
    enabled:     initial?.enabled     ?? true,
  });
  const [discovering, setDiscovering] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [discoverError, setDiscoverError] = useState('');

  function validate(f: AddOllamaParams): boolean {
    return f.displayName.trim().length > 0
      && f.endpoint.trim().length > 0
      && f.model.trim().length > 0
      && f.priority >= 1;
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onChange(form, validate(form)); }, []);

  function update(patch: Partial<AddOllamaParams>) {
    const next = { ...form, ...patch };
    setForm(next);
    onChange(next, validate(next));
  }

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverError('');
    try {
      const models = await onDiscoverModels(form.endpoint);
      setDiscoveredModels(models);
      if (models.length === 0) setDiscoverError('No models found at this endpoint.');
    } catch {
      setDiscoverError('Could not reach Ollama. Make sure it is running.');
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Alert severity="info" sx={{ fontSize: 13 }}>
        Ollama runs locally on your computer — no cloud API key required.
        Install Ollama from <strong>ollama.com</strong> and pull a model first.
      </Alert>

      <TextField
        label="Display Name"
        value={form.displayName}
        onChange={e => update({ displayName: e.target.value })}
        required
        fullWidth
        inputProps={{ 'data-testid': 'ollama-display-name' }}
      />

      <TextField
        label="Endpoint"
        value={form.endpoint}
        onChange={e => update({ endpoint: e.target.value })}
        required
        fullWidth
        placeholder="http://localhost:11434"
        helperText="The base URL where Ollama is listening."
        inputProps={{ 'data-testid': 'ollama-endpoint' }}
      />

      <Box display="flex" gap={1} alignItems="flex-start">
        <Autocomplete
          freeSolo
          options={discoveredModels}
          value={form.model}
          onInputChange={(_, v) => update({ model: v })}
          fullWidth
          renderInput={params => (
            <TextField
              {...params}
              label="Model"
              required
              helperText={discoveredModels.length ? `${discoveredModels.length} model(s) discovered` : 'Type or discover models below'}
              inputProps={{ ...params.inputProps, 'data-testid': 'ollama-model' }}
            />
          )}
        />
        <Button
          variant="outlined"
          startIcon={discovering ? <CircularProgress size={14} /> : <RefreshIcon />}
          onClick={handleDiscover}
          disabled={discovering}
          sx={{ mt: 0.5, whiteSpace: 'nowrap', height: 40 }}
          data-testid="ollama-discover-btn"
        >
          Discover
        </Button>
      </Box>
      {discoverError && (
        <Alert severity="warning" sx={{ fontSize: 12 }}>{discoverError}</Alert>
      )}

      <TextField
        label="Priority"
        type="number"
        value={form.priority}
        onChange={e => update({ priority: Number(e.target.value) })}
        fullWidth
        helperText="Lower number = higher priority."
        inputProps={{ min: 1, max: 999, 'data-testid': 'ollama-priority' }}
      />

      <FormControlLabel
        control={
          <Switch
            checked={form.enabled}
            onChange={e => update({ enabled: e.target.checked })}
            data-testid="ollama-enabled"
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
