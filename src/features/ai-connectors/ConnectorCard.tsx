import { useState } from 'react';
import {
  Card, CardContent, Box, Typography, Chip, IconButton,
  Tooltip, Switch, Menu, MenuItem, ListItemIcon, Divider,
  CircularProgress, Collapse,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import BarChartIcon from '@mui/icons-material/BarChart';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import EditIcon from '@mui/icons-material/Edit';
import { ConnectionTestPanel } from './ConnectionTestPanel';
import type { PersistedConnector } from './aiConnectorStore';
import type { ConnectorTestResult } from './aiConnectorService';

const KIND_LABEL: Record<string, string> = {
  gemini:           'Gemini Flash',
  ollama:           'Ollama',
  openai_compatible:'OpenAI-Compatible',
  mcp:              'MCP Agent',
};

const KIND_COLOR: Record<string, string> = {
  gemini:           '#4285F4',
  ollama:           '#10B981',
  openai_compatible:'#6366F1',
  mcp:              '#F59E0B',
};

interface Props {
  connector: PersistedConnector;
  isDefault: boolean;
  hasApiKey: boolean;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
  onTestConnection: (id: string) => Promise<ConnectorTestResult>;
  onViewDiagnostics: (connector: PersistedConnector) => void;
}

export function ConnectorCard({
  connector, isDefault, hasApiKey,
  onToggleEnabled, onDelete, onSetDefault,
  onTestConnection, onViewDiagnostics,
}: Props) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [testing, setTesting]       = useState(false);
  const [testResult, setTestResult] = useState<ConnectorTestResult | null>(null);
  const color = KIND_COLOR[connector.kind] ?? '#9CA3AF';

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await onTestConnection(connector.id);
      setTestResult(r);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card
      variant="outlined"
      sx={{ borderLeft: `4px solid ${color}` }}
      data-testid={`connector-card-${connector.id}`}
    >
      <CardContent>
        {/* Header row */}
        <Box display="flex" alignItems="flex-start" gap={1}>
          <Box flex={1}>
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <Typography variant="subtitle1" fontWeight={700}>
                {connector.displayName}
              </Typography>
              {isDefault && (
                <Chip
                  label="Default"
                  size="small"
                  color="primary"
                  icon={<StarIcon sx={{ fontSize: 12 }} />}
                  data-testid={`default-badge-${connector.id}`}
                />
              )}
              <Chip
                label={KIND_LABEL[connector.kind] ?? connector.kind}
                size="small"
                sx={{ bgcolor: color + '18', color }}
              />
              <Chip
                label={connector.enabled ? 'Enabled' : 'Disabled'}
                size="small"
                color={connector.enabled ? 'success' : 'default'}
                variant="outlined"
                data-testid={`status-chip-${connector.id}`}
              />
            </Box>

            {/* Details */}
            <Box mt={0.5} display="flex" gap={2} flexWrap="wrap">
              {connector.model && (
                <Typography variant="caption" color="text.secondary">
                  Model: <strong>{connector.model}</strong>
                </Typography>
              )}
              {connector.endpoint && (
                <Typography variant="caption" color="text.secondary">
                  Endpoint: <strong>{connector.endpoint}</strong>
                </Typography>
              )}
              {connector.baseUrl && (
                <Typography variant="caption" color="text.secondary">
                  Base URL: <strong>{connector.baseUrl}</strong>
                </Typography>
              )}
              {connector.mcpTransport && (
                <Typography variant="caption" color="text.secondary">
                  Transport: <strong>{connector.mcpTransport}</strong>
                </Typography>
              )}
              {hasApiKey && (
                <Typography variant="caption" color="text.secondary">
                  API Key: <strong>••••••••</strong>
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                Priority: <strong>{connector.priority}</strong>
              </Typography>
            </Box>
          </Box>

          {/* Controls */}
          <Box display="flex" alignItems="center" gap={0.5}>
            <Tooltip title={connector.enabled ? 'Disable' : 'Enable'}>
              <Switch
                size="small"
                checked={connector.enabled}
                onChange={e => onToggleEnabled(connector.id, e.target.checked)}
                inputProps={{
                  'aria-label': `toggle ${connector.displayName}`,
                  // data-* attributes are valid HTML but not in MUI's narrow inputProps type
                  ...({ 'data-testid': `toggle-${connector.id}` } as object),
                }}
              />
            </Tooltip>

            <Tooltip title="Test Connection">
              <span>
                <IconButton
                  size="small"
                  onClick={handleTest}
                  disabled={testing}
                  data-testid={`test-btn-${connector.id}`}
                >
                  {testing ? <CircularProgress size={16} /> : <PlayArrowIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title="More actions">
              <IconButton
                size="small"
                onClick={e => setMenuAnchor(e.currentTarget)}
                data-testid={`menu-btn-${connector.id}`}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Test result */}
        <Collapse in={!!testResult}>
          {testResult && (
            <Box mt={1.5} pl={0.5}>
              <Divider sx={{ mb: 1.5 }} />
              <ConnectionTestPanel result={testResult} />
            </Box>
          )}
        </Collapse>
      </CardContent>

      {/* Actions menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            onSetDefault(connector.id);
            setMenuAnchor(null);
          }}
          data-testid={`set-default-${connector.id}`}
        >
          <ListItemIcon>
            {isDefault ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
          </ListItemIcon>
          {isDefault ? 'Remove as default' : 'Set as default'}
        </MenuItem>

        <MenuItem
          onClick={() => {
            onViewDiagnostics(connector);
            setMenuAnchor(null);
          }}
          data-testid={`diagnostics-btn-${connector.id}`}
        >
          <ListItemIcon><BarChartIcon fontSize="small" /></ListItemIcon>
          View diagnostics
        </MenuItem>

        <Divider />

        <MenuItem
          onClick={() => {
            onDelete(connector.id);
            setMenuAnchor(null);
          }}
          sx={{ color: 'error.main' }}
          data-testid={`delete-btn-${connector.id}`}
        >
          <ListItemIcon><DeleteIcon fontSize="small" sx={{ color: 'error.main' }} /></ListItemIcon>
          Delete
        </MenuItem>
      </Menu>
    </Card>
  );
}
