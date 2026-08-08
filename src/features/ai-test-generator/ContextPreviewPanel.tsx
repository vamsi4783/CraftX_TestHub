// ─── M11: ContextPreviewPanel ─────────────────────────────────────────────────
// Shown in step 1 when using Project Intelligence mode.
// Summarizes the project context that will be sent to the AI.

import {
  Box, Typography, Chip, Stack, Paper, Alert, LinearProgress, Divider,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { projectContextBuilder } from '@/services/projectIngestion/ProjectContextBuilder';
import { GENERATION_MODE_LABELS, GENERATION_MODE_CATEGORIES } from '@/services/aiTestGenerator';
import type { ContextGenerationOptions } from '@/services/aiTestGenerator';
import type { ProjectKnowledge }         from '@/services/projectIngestion';
import type { RuntimeStatus }            from '@/features/ai-connectors/aiOrchestrationService';

interface Props {
  knowledge:       ProjectKnowledge;
  options:         ContextGenerationOptions;
  connectorStatus: RuntimeStatus;
  existingCount:   number;  // how many test cases are already in the DB for this project
}

export function ContextPreviewPanel({ knowledge, options, connectorStatus, existingCount }: Props) {
  // Build context to show token estimate
  const ctx = projectContextBuilder.build(knowledge, {
    projectId: knowledge.projectId,
    moduleIds: options.moduleIds,
    feature:   options.feature,
    maxTokens: 24_000,
    includeTests: true,
  });

  const scopeLabel =
    options.scope === 'full'    ? 'Entire project' :
    options.scope === 'module'  ? `Module: ${options.moduleIds?.map(id => knowledge.codeModules.find(m => m.id === id)?.name ?? id).join(', ')}` :
    options.scope === 'feature' ? `Feature: "${options.feature}"` :
    options.scope;

  const uncoveredInScope = options.scope === 'module' && options.moduleIds
    ? options.moduleIds.filter(id => knowledge.uncoveredModules.includes(id))
    : knowledge.uncoveredModules;

  return (
    <Box display="flex" flexDirection="column" gap={2}>

      {/* Project header */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" mb={1}>
          <AccountTreeIcon color="primary" />
          <Typography variant="h6">{knowledge.name}</Typography>
          <Chip label={knowledge.frameworks.join(' / ') || knowledge.languages.join(', ')} size="small" />
          {knowledge.architectureStyle && (
            <Chip label={knowledge.architectureStyle} size="small" variant="outlined" />
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary">{knowledge.description}</Typography>
      </Paper>

      {/* Context summary */}
      <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap={1.5}>
        <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
          <Typography variant="h5" fontWeight={700}>{ctx.relevantModules.length}</Typography>
          <Typography variant="caption" color="text.secondary">Modules in context</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
          <Typography variant="h5" fontWeight={700}>{ctx.relevantFiles.length}</Typography>
          <Typography variant="caption" color="text.secondary">Files summarized</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
          <Typography variant="h5" fontWeight={700}>~{Math.round(ctx.tokenEstimate / 1000)}k</Typography>
          <Typography variant="caption" color="text.secondary">Tokens (estimated)</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
          <Typography variant="h5" fontWeight={700}>{existingCount}</Typography>
          <Typography variant="caption" color="text.secondary">Existing test cases</Typography>
        </Paper>
      </Box>

      {/* Generation config */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" mb={1}>Generation configuration</Typography>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 110 }}>Scope:</Typography>
            <Chip label={scopeLabel} size="small" color="primary" />
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 110 }}>Mode:</Typography>
            <Chip label={GENERATION_MODE_LABELS[options.mode]} size="small" color="primary" />
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 110 }}>Categories:</Typography>
            {GENERATION_MODE_CATEGORIES[options.mode].map(cat => (
              <Chip key={cat} label={cat.replace('_', ' ')} size="small" variant="outlined" />
            ))}
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 110 }}>Max suggestions:</Typography>
            <Typography variant="body2">{options.maxSuggestions ?? 20}</Typography>
          </Stack>
        </Stack>
      </Paper>

      {/* Coverage context */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" mb={1}>Coverage context</Typography>

        <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
          <Typography variant="caption" color="text.secondary">Overall module coverage:</Typography>
          <Typography variant="caption" fontWeight={600}>{Math.round(knowledge.coverageScore * 100)}%</Typography>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={knowledge.coverageScore * 100}
          sx={{ mb: 1.5, height: 6, borderRadius: 3 }}
          color={knowledge.coverageScore > 0.6 ? 'success' : knowledge.coverageScore > 0.3 ? 'warning' : 'error'}
        />

        {uncoveredInScope.length > 0 ? (
          <Stack direction="row" spacing={0.5} alignItems="flex-start" flexWrap="wrap">
            <WarningAmberIcon color="warning" fontSize="small" sx={{ mt: 0.2 }} />
            <Typography variant="caption" color="text.secondary">
              Uncovered in scope ({uncoveredInScope.length} modules — AI will focus here):
            </Typography>
            {uncoveredInScope.slice(0, 8).map(id => {
              const mod = knowledge.codeModules.find(m => m.id === id);
              return <Chip key={id} label={mod?.name ?? id} size="small" color="warning" variant="outlined" />;
            })}
          </Stack>
        ) : (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <CheckCircleIcon color="success" fontSize="small" />
            <Typography variant="caption" color="success.main">
              All modules in scope have some test coverage. AI will look for gaps.
            </Typography>
          </Stack>
        )}
      </Paper>

      {existingCount > 0 && (
        <Alert severity="info" sx={{ fontSize: 13 }}>
          {existingCount} existing test case{existingCount !== 1 ? 's' : ''} will be passed to the AI to
          avoid duplicates and identify missing coverage.
        </Alert>
      )}

      <Divider />

      {/* AI connector status */}
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <AutoAwesomeIcon
            fontSize="small"
            color={connectorStatus.hasUsableConnectors ? 'primary' : 'disabled'}
          />
          {connectorStatus.hasUsableConnectors ? (
            <Typography variant="caption">
              Will use: <strong>{connectorStatus.activeConnectorName ?? 'configured connector'}</strong>
              {connectorStatus.activeConnectorModel ? ` (${connectorStatus.activeConnectorModel})` : ''}
            </Typography>
          ) : (
            <Typography variant="caption" color="error">
              No AI connectors configured — cannot generate.
            </Typography>
          )}
          <Chip
            label={connectorStatus.edgeFunctionEnabled ? 'Edge fallback: ON' : 'Edge fallback: OFF'}
            size="small"
            color={connectorStatus.edgeFunctionEnabled ? 'info' : 'default'}
            variant="outlined"
          />
        </Stack>

        {!connectorStatus.hasUsableConnectors && !connectorStatus.edgeFunctionEnabled && (
          <Alert severity="error" sx={{ mt: 1, fontSize: 13 }}>
            No AI connector available. Configure one in <strong>AI Connectors</strong> or enable
            the edge function fallback.
          </Alert>
        )}
      </Paper>
    </Box>
  );
}
