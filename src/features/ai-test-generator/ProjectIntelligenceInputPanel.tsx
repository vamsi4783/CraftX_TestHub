// ─── M11: Project Intelligence Input Panel ────────────────────────────────────
// Replaces manual file paste with M10 ProjectKnowledge as AI context.
// Users select an ingested source, choose scope, and pick a generation mode.

import {
  Box, Button, FormControl, InputLabel, Select, MenuItem,
  Typography, Alert, Chip, Stack, TextField, LinearProgress,
  Paper, Divider, Tooltip,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useState, useEffect, useMemo } from 'react';

import { useProjectIngestionStore } from '@/features/project-ingestion/projectIngestionStore';
import { aiOrchestrationService }   from '@/features/ai-connectors/aiOrchestrationService';
import {
  GENERATION_MODE_LABELS,
  GENERATION_MODE_DESCRIPTIONS,
  GENERATION_MODE_CATEGORIES,
} from '@/services/aiTestGenerator';
import type {
  GenerationMode,
  GenerationScope,
  ContextGenerationOptions,
} from '@/services/aiTestGenerator';
import type { ProjectKnowledge, ProjectSourceRecord } from '@/services/projectIngestion';

const ALL_MODES: GenerationMode[] = [
  'full_suite', 'functional', 'ui', 'regression', 'negative_edge', 'security', 'module_specific',
];

interface Props {
  onConfigure: (
    knowledge:  ProjectKnowledge,
    options:    ContextGenerationOptions,
    projectId:  string,
  ) => void;
  isAnalyzing: boolean;
}

export function ProjectIntelligenceInputPanel({ onConfigure, isAnalyzing }: Props) {
  const { sources: sourcesByProject, knowledge } = useProjectIngestionStore();

  // Flatten all sources across all projects and keep only ready ones
  const readySources = useMemo<ProjectSourceRecord[]>(() =>
    Object.values(sourcesByProject)
      .flat()
      .filter(s => s.status === 'ready'),
    [sourcesByProject],
  );

  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [mode,             setMode]             = useState<GenerationMode>('full_suite');
  const [scope,            setScope]            = useState<GenerationScope>('full');
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [featureText,       setFeatureText]       = useState('');
  const [maxSuggestions,    setMaxSuggestions]    = useState(20);

  // Auto-select first ready source
  useEffect(() => {
    if (!selectedSourceId && readySources.length > 0) {
      setSelectedSourceId(readySources[0].id);
    }
  }, [readySources, selectedSourceId]);

  // Reset scope-specific selection when source or scope changes
  useEffect(() => { setSelectedModuleIds([]); }, [selectedSourceId]);
  useEffect(() => {
    if (scope !== 'module')  setSelectedModuleIds([]);
    if (scope !== 'feature') setFeatureText('');
  }, [scope]);

  const selectedSource    = readySources.find(s => s.id === selectedSourceId);
  const activeKnowledge   = selectedSource ? knowledge[selectedSource.project_id] : undefined;
  const status            = aiOrchestrationService.getStatus();

  const canProceed =
    !!activeKnowledge &&
    !isAnalyzing &&
    (scope !== 'module'  || selectedModuleIds.length > 0) &&
    (scope !== 'feature' || featureText.trim().length > 0);

  const handleConfigure = () => {
    if (!activeKnowledge || !selectedSource) return;

    const options: ContextGenerationOptions = {
      mode,
      scope,
      moduleIds:      scope === 'module'  ? selectedModuleIds : undefined,
      feature:        scope === 'feature' ? featureText.trim() : undefined,
      maxSuggestions,
    };

    onConfigure(activeKnowledge, options, selectedSource.project_id);
  };

  const toggleModule = (id: string) =>
    setSelectedModuleIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <Box display="flex" flexDirection="column" gap={2.5}>

      {/* Source selector */}
      {readySources.length === 0 ? (
        <Alert severity="warning" icon={<AccountTreeIcon />}>
          No ingested projects found. Go to <strong>Project Intelligence</strong> to connect and
          analyze a project first, then return here.
        </Alert>
      ) : (
        <FormControl size="small" fullWidth>
          <InputLabel>Ingested project source</InputLabel>
          <Select
            label="Ingested project source"
            value={selectedSourceId}
            onChange={e => setSelectedSourceId(e.target.value)}
          >
            {readySources.map(s => (
              <MenuItem key={s.id} value={s.id}>
                {s.display_name} — {s.kind}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Project knowledge summary */}
      {activeKnowledge && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={1}>
            <AccountTreeIcon color="primary" fontSize="small" />
            <Typography variant="subtitle2">{activeKnowledge.name}</Typography>
            <Chip label={`${activeKnowledge.indexedFiles} files`}   size="small" variant="outlined" />
            <Chip label={`${activeKnowledge.codeModules.length} modules`} size="small" variant="outlined" />
            <Chip label={`${activeKnowledge.existingTestPaths.length} test files`} size="small" variant="outlined" />
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {activeKnowledge.description}
          </Typography>

          {/* Coverage bar */}
          <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
            <Typography variant="caption" color="text.secondary">Module coverage:</Typography>
            <Typography variant="caption" fontWeight={600}>
              {Math.round(activeKnowledge.coverageScore * 100)}%
            </Typography>
            <Typography variant="caption" color="text.secondary">
              ({activeKnowledge.coveredModules.length}/{activeKnowledge.codeModules.length} modules have tests)
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={activeKnowledge.coverageScore * 100}
            sx={{ mb: 1.5, height: 6, borderRadius: 3 }}
            color={
              activeKnowledge.coverageScore > 0.6 ? 'success' :
              activeKnowledge.coverageScore > 0.3 ? 'warning' : 'error'
            }
          />

          {/* Uncovered modules */}
          {activeKnowledge.uncoveredModules.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Uncovered modules (AI will prioritize these):
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={0.5} mt={0.5}>
                {activeKnowledge.uncoveredModules.slice(0, 8).map(id => {
                  const mod = activeKnowledge.codeModules.find(m => m.id === id);
                  return (
                    <Chip key={id} label={mod?.name ?? id} size="small" color="warning" variant="outlined" />
                  );
                })}
                {activeKnowledge.uncoveredModules.length > 8 && (
                  <Chip
                    label={`+${activeKnowledge.uncoveredModules.length - 8} more`}
                    size="small"
                    variant="outlined"
                  />
                )}
              </Stack>
            </Box>
          )}
        </Paper>
      )}

      <Divider />

      {/* Scope selector */}
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" mb={1}>
          <Typography variant="subtitle2">Generation scope</Typography>
          <Tooltip title="Choose what portion of the project to generate tests for.">
            <InfoOutlinedIcon fontSize="small" sx={{ color: 'text.secondary', cursor: 'help' }} />
          </Tooltip>
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {(['full', 'module', 'feature'] as GenerationScope[]).map(s => (
            <Chip
              key={s}
              label={s === 'full' ? 'Entire project' : s === 'module' ? 'Specific module(s)' : 'Feature area'}
              onClick={() => setScope(s)}
              color={scope === s ? 'primary' : 'default'}
              variant={scope === s ? 'filled' : 'outlined'}
              size="small"
              clickable
            />
          ))}
        </Stack>
      </Box>

      {/* Module picker (scope === 'module') */}
      {scope === 'module' && activeKnowledge && (
        <Box>
          <Typography variant="caption" color="text.secondary" mb={0.5} display="block">
            Select modules to test:
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.5}>
            {activeKnowledge.codeModules.map(mod => (
              <Chip
                key={mod.id}
                label={`${mod.name} (${mod.fileCount} files)`}
                onClick={() => toggleModule(mod.id)}
                color={selectedModuleIds.includes(mod.id) ? 'primary' : 'default'}
                variant={selectedModuleIds.includes(mod.id) ? 'filled' : 'outlined'}
                size="small"
                clickable
              />
            ))}
          </Stack>
          {selectedModuleIds.length === 0 && (
            <Typography variant="caption" color="error" mt={0.5} display="block">
              Select at least one module.
            </Typography>
          )}
        </Box>
      )}

      {/* Feature text (scope === 'feature') */}
      {scope === 'feature' && (
        <TextField
          label="Feature area"
          size="small"
          value={featureText}
          onChange={e => setFeatureText(e.target.value)}
          placeholder="e.g. payment, login, notifications"
          helperText="Files and modules related to this feature will be prioritized in the AI context."
          fullWidth
        />
      )}

      <Divider />

      {/* Generation mode */}
      <Box>
        <Typography variant="subtitle2" mb={1}>Generation mode</Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.5} mb={0.5}>
          {ALL_MODES.map(m => (
            <Tooltip key={m} title={GENERATION_MODE_DESCRIPTIONS[m]}>
              <Chip
                label={GENERATION_MODE_LABELS[m]}
                onClick={() => setMode(m)}
                color={mode === m ? 'primary' : 'default'}
                variant={mode === m ? 'filled' : 'outlined'}
                size="small"
                clickable
              />
            </Tooltip>
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {GENERATION_MODE_DESCRIPTIONS[mode]}
          {' '}Generates: <em>{GENERATION_MODE_CATEGORIES[mode].join(', ')}</em> categories.
        </Typography>
      </Box>

      {/* Max suggestions */}
      <Stack direction="row" spacing={2} alignItems="center">
        <TextField
          label="Max suggestions"
          type="number"
          size="small"
          value={maxSuggestions}
          onChange={e => setMaxSuggestions(Math.max(1, Math.min(50, Number(e.target.value))))}
          inputProps={{ min: 1, max: 50 }}
          sx={{ width: 160 }}
        />
        <Typography variant="caption" color="text.secondary">
          AI may return fewer if existing tests already cover the selected scope.
        </Typography>
      </Stack>

      {/* AI connector status */}
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <AutoAwesomeIcon
            fontSize="small"
            color={status.hasUsableConnectors ? 'primary' : 'disabled'}
          />
          {status.hasUsableConnectors ? (
            <Typography variant="caption">
              Will use: <strong>{status.activeConnectorName ?? 'configured connector'}</strong>
              {status.activeConnectorModel ? ` (${status.activeConnectorModel})` : ''}
            </Typography>
          ) : (
            <Typography variant="caption" color="error">
              No AI connectors configured.
            </Typography>
          )}
          {status.fallbackChain.length > 1 && (
            <Chip
              label={`${status.fallbackChain.length} in fallback chain`}
              size="small"
              variant="outlined"
            />
          )}
          <Chip
            label={status.edgeFunctionEnabled ? 'Edge fallback: ON' : 'Edge fallback: OFF'}
            size="small"
            color={status.edgeFunctionEnabled ? 'info' : 'default'}
            variant="outlined"
          />
        </Stack>
        {!status.hasUsableConnectors && !status.edgeFunctionEnabled && (
          <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
            Configure a connector in <strong>AI Connectors</strong> or enable the edge fallback.
          </Typography>
        )}
      </Paper>

      {isAnalyzing && <LinearProgress />}

      <Box display="flex" justifyContent="flex-end">
        <Button
          variant="contained"
          startIcon={<AutoAwesomeIcon />}
          onClick={handleConfigure}
          disabled={!canProceed || readySources.length === 0}
          size="large"
        >
          {isAnalyzing ? 'Loading context…' : 'Continue →'}
        </Button>
      </Box>
    </Box>
  );
}
