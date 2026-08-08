/**
 * AIRuntimeStatusPanel — shows the current AI runtime configuration.
 *
 * Displays:
 *   - Active connector (highest-priority enabled)
 *   - Full fallback chain with cost category
 *   - "TestHub API key required: NO" — always
 *   - "Test AI" button sending a tiny deterministic JSON echo request
 *
 * Never displays API key values.
 */

import { useState } from 'react';
import {
  Box, Typography, Chip, Button, Paper, Divider,
  Table, TableBody, TableRow, TableCell, CircularProgress,
  Alert, Tooltip,
} from '@mui/material';
import CheckCircleIcon     from '@mui/icons-material/CheckCircle';
import CancelIcon          from '@mui/icons-material/Cancel';
import WifiOffIcon         from '@mui/icons-material/WifiOff';
import LaptopIcon          from '@mui/icons-material/Laptop';
import CloudIcon           from '@mui/icons-material/Cloud';
import BoltIcon            from '@mui/icons-material/Bolt';
import ExtensionIcon       from '@mui/icons-material/Extension';
import PlayArrowIcon       from '@mui/icons-material/PlayArrow';
import { aiOrchestrationService, type RuntimeStatus, type TestAIResult, type CostCategory } from './aiOrchestrationService';

// ─── Cost category labels & icons ────────────────────────────────────────────

const COST_LABEL: Record<CostCategory, string> = {
  local:    'Local / Free',
  free_tier:'Free Tier',
  user_api: 'User API Key',
  mcp:      'External Agent',
};

const COST_COLOR: Record<CostCategory, 'success' | 'info' | 'warning' | 'default'> = {
  local:    'success',
  free_tier:'info',
  user_api: 'warning',
  mcp:      'default',
};

function CostIcon({ cat }: { cat: CostCategory }) {
  switch (cat) {
    case 'local':    return <LaptopIcon    sx={{ fontSize: 14 }} />;
    case 'free_tier':return <BoltIcon      sx={{ fontSize: 14 }} />;
    case 'user_api': return <CloudIcon     sx={{ fontSize: 14 }} />;
    case 'mcp':      return <ExtensionIcon sx={{ fontSize: 14 }} />;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  /** Re-read status on each render when this key changes (pass `connectors.length` or a tick). */
  refreshKey?: number;
}

export function AIRuntimeStatusPanel({ refreshKey: _ }: Props) {
  const status: RuntimeStatus = aiOrchestrationService.getStatus();

  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState<TestAIResult | null>(null);

  async function handleTestAI() {
    setTesting(true);
    setTestResult(null);
    const r = await aiOrchestrationService.executeTestPrompt();
    setTestResult(r);
    setTesting(false);
  }

  return (
    <Paper variant="outlined" sx={{ p: 2.5, mt: 3 }}>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>
        AI Runtime Status
      </Typography>

      {/* Key facts row */}
      <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
        <Tooltip title="TestHub never uses its own Anthropic/OpenAI API key for normal operation.">
          <Chip
            icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
            label="TestHub API key: NOT required"
            color="success"
            size="small"
            variant="outlined"
            data-testid="no-testhub-key-chip"
          />
        </Tooltip>

        {status.userApiKeyConfigured && (
          <Chip
            icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
            label="User API key: configured"
            color="info"
            size="small"
            variant="outlined"
            data-testid="user-key-chip"
          />
        )}

        {status.localModelAvailable && (
          <Chip
            icon={<LaptopIcon sx={{ fontSize: 14 }} />}
            label="Local model: available"
            color="success"
            size="small"
            variant="outlined"
            data-testid="local-model-chip"
          />
        )}

        {!status.hasUsableConnectors && (
          <Chip
            icon={<WifiOffIcon sx={{ fontSize: 14 }} />}
            label="No connectors — using edge function fallback"
            color="warning"
            size="small"
            variant="outlined"
            data-testid="no-connectors-chip"
          />
        )}
      </Box>

      {status.hasUsableConnectors ? (
        <>
          {/* Active connector */}
          <Box mb={1.5}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
              Active Connector
            </Typography>
            <Box display="flex" alignItems="center" gap={1} mt={0.5}>
              <Typography variant="body2" fontWeight={600} data-testid="active-connector-name">
                {status.activeConnectorName ?? '—'}
              </Typography>
              {status.activeConnectorModel && (
                <Chip label={status.activeConnectorModel} size="small" variant="outlined" />
              )}
            </Box>
          </Box>

          <Divider sx={{ mb: 1.5 }} />

          {/* Fallback chain */}
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
            Fallback Chain
          </Typography>
          <Table size="small" sx={{ mt: 0.5, mb: 2 }}>
            <TableBody>
              {status.fallbackChain.map((entry, idx) => (
                <TableRow key={entry.id} data-testid={`chain-entry-${entry.id}`}>
                  <TableCell sx={{ pl: 0, py: 0.5, width: 32, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                    {idx + 1}
                  </TableCell>
                  <TableCell sx={{ py: 0.5, fontWeight: 600 }}>{entry.displayName}</TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    {entry.model && <Typography variant="caption" color="text.secondary">{entry.model}</Typography>}
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    <Chip
                      icon={<CostIcon cat={entry.costCategory} />}
                      label={COST_LABEL[entry.costCategory]}
                      size="small"
                      color={COST_COLOR[entry.costCategory]}
                      variant="outlined"
                      sx={{ fontSize: 11 }}
                    />
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    {entry.kind === 'mcp' && !entry.mcpUsable && (
                      <Chip label="stdio — bridge required" size="small" variant="outlined" color="warning" sx={{ fontSize: 10 }} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Test AI button */}
          <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
            <Button
              variant="outlined"
              size="small"
              startIcon={testing ? <CircularProgress size={14} /> : <PlayArrowIcon />}
              onClick={handleTestAI}
              disabled={testing}
              data-testid="test-ai-btn"
            >
              Test AI
            </Button>

            {testResult && (
              <Box data-testid={testResult.success ? 'test-ai-success' : 'test-ai-failure'}>
                {testResult.success ? (
                  <Alert severity="success" icon={<CheckCircleIcon />} sx={{ py: 0.25, px: 1, fontSize: 12 }}>
                    Connected via <strong>{testResult.connectorUsed}</strong> · model <strong>{testResult.modelUsed}</strong> · {testResult.latencyMs}ms
                  </Alert>
                ) : (
                  <Alert severity="error" icon={<CancelIcon />} sx={{ py: 0.25, px: 1, fontSize: 12 }}>
                    {testResult.error}
                  </Alert>
                )}
              </Box>
            )}
          </Box>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No connectors configured. Add a connector above to use AI features with your own API key or local model.
          When no connector is active, AI features fall back to the TestHub Supabase edge function.
        </Typography>
      )}
    </Paper>
  );
}
