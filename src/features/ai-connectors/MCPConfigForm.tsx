import { useState, useEffect } from 'react';
import {
  Box, TextField, MenuItem, FormControlLabel, Switch,
  Typography, Alert,
} from '@mui/material';
import type { AddMCPParams } from './aiConnectorService';

interface Props {
  initial?: Partial<AddMCPParams>;
  onChange: (params: AddMCPParams, valid: boolean) => void;
}

export function MCPConfigForm({ initial, onChange }: Props) {
  const [form, setForm] = useState<AddMCPParams>({
    displayName:  initial?.displayName  ?? 'MCP Agent',
    mcpTransport: initial?.mcpTransport ?? 'stdio',
    mcpEndpoint:  initial?.mcpEndpoint  ?? '',
    mcpCommand:   initial?.mcpCommand   ?? '',
    authToken:    initial?.authToken    ?? undefined,
    priority:     initial?.priority     ?? 100,
    enabled:      initial?.enabled      ?? true,
  });

  function validate(f: AddMCPParams): boolean {
    const needsEndpoint = f.mcpTransport === 'sse' || f.mcpTransport === 'websocket';
    const needsCommand  = f.mcpTransport === 'stdio';
    return f.displayName.trim().length > 0
      && (!needsEndpoint || (f.mcpEndpoint ?? '').trim().length > 0)
      && (!needsCommand  || (f.mcpCommand  ?? '').trim().length > 0)
      && f.priority >= 1;
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onChange(form, validate(form)); }, []);

  function update(patch: Partial<AddMCPParams>) {
    const next = { ...form, ...patch };
    setForm(next);
    onChange(next, validate(next));
  }

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Alert severity="info" sx={{ fontSize: 13 }}>
        MCP (Model Context Protocol) lets TestHub connect to external AI agents and
        tool servers. Configure the transport and connection details below.
      </Alert>

      <TextField
        label="Display Name"
        value={form.displayName}
        onChange={e => update({ displayName: e.target.value })}
        required
        fullWidth
        inputProps={{ 'data-testid': 'mcp-display-name' }}
      />

      <TextField
        label="Transport"
        value={form.mcpTransport}
        onChange={e => update({ mcpTransport: e.target.value as AddMCPParams['mcpTransport'] })}
        select
        fullWidth
        helperText="How TestHub connects to the MCP server."
        inputProps={{ 'data-testid': 'mcp-transport' }}
      >
        <MenuItem value="stdio">stdio — subprocess on this machine</MenuItem>
        <MenuItem value="sse">SSE — HTTP server-sent events</MenuItem>
        <MenuItem value="websocket">WebSocket — ws:// connection</MenuItem>
      </TextField>

      {form.mcpTransport === 'stdio' && (
        <TextField
          label="Command"
          value={form.mcpCommand}
          onChange={e => update({ mcpCommand: e.target.value })}
          required
          fullWidth
          placeholder="npx @modelcontextprotocol/server-everything"
          helperText="Command to launch the MCP server subprocess."
          inputProps={{ 'data-testid': 'mcp-command' }}
        />
      )}

      {(form.mcpTransport === 'sse' || form.mcpTransport === 'websocket') && (
        <>
          <TextField
            label="Endpoint URL"
            value={form.mcpEndpoint}
            onChange={e => update({ mcpEndpoint: e.target.value })}
            required
            fullWidth
            placeholder={form.mcpTransport === 'sse' ? 'http://localhost:3000/sse' : 'ws://localhost:3000/ws'}
            helperText="URL of the MCP server endpoint."
            inputProps={{ 'data-testid': 'mcp-endpoint' }}
          />
          <TextField
            label="Auth Token (optional)"
            type="password"
            value={form.authToken ?? ''}
            onChange={e => update({ authToken: e.target.value || undefined })}
            fullWidth
            helperText="Bearer token for authenticated MCP servers. Leave blank for open servers."
            inputProps={{ 'data-testid': 'mcp-auth-token' }}
          />
        </>
      )}

      <TextField
        label="Priority"
        type="number"
        value={form.priority}
        onChange={e => update({ priority: Number(e.target.value) })}
        fullWidth
        helperText="Lower number = higher priority."
        inputProps={{ min: 1, max: 999, 'data-testid': 'mcp-priority' }}
      />

      <FormControlLabel
        control={
          <Switch
            checked={form.enabled}
            onChange={e => update({ enabled: e.target.checked })}
            data-testid="mcp-enabled"
          />
        }
        label={
          <Box>
            <Typography variant="body2">Enabled</Typography>
            <Typography variant="caption" color="text.secondary">
              MCP connectors require a running server — disable when the server is offline.
            </Typography>
          </Box>
        }
      />

      {form.mcpTransport === 'stdio' && (
        <Alert severity="warning" sx={{ fontSize: 12 }}>
          stdio transport runs a subprocess locally — connection testing is not available in the browser.
          Save the configuration and verify from the Agent Runtime panel.
        </Alert>
      )}
    </Box>
  );
}
