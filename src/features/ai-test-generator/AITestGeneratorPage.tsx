// ─── AI Test Generator Page (M6 + M11 extension) ──────────────────────────────
// Two input modes:
//   Manual: paste source files → ProjectAnalyzer → ProjectModel → AI
//   Project Intelligence: M10 ProjectKnowledge → ProjectContextBuilder → AI
//
// Both modes produce TestSuggestion[] and flow through the same
// SuggestionList → BulkImportDialog → importAccepted() → canonical TestCase path.

import {
  Box, Container, Typography, Paper, Button, Step, Stepper, StepLabel,
  FormGroup, FormControlLabel, Checkbox, TextField, Alert, LinearProgress,
  Divider, Snackbar, Stack, Chip, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import AutoAwesomeIcon  from '@mui/icons-material/AutoAwesome';
import DownloadIcon     from '@mui/icons-material/Download';
import EditNoteIcon     from '@mui/icons-material/EditNote';
import AccountTreeIcon  from '@mui/icons-material/AccountTree';
import { useState } from 'react';

import type {
  TestSuggestion, TestCategory, GenerationOptions,
  ContextGenerationOptions,
} from '@/services/aiTestGenerator';
import type { SourceFile }  from '@/services/aiTestGenerator';
import { aiTestGenerationEngine } from '@/services/aiTestGenerator';
import type { ProjectModel }      from '@/services/aiTestGenerator';
import { aiOrchestrationService } from '@/features/ai-connectors/aiOrchestrationService';
import type { ProjectKnowledge }  from '@/services/projectIngestion';
import { testCaseService }         from '@/services/testCaseService';

import { ProjectInputPanel }             from './ProjectInputPanel';
import { ProjectModelPreview }           from './ProjectModelPreview';
import { ProjectIntelligenceInputPanel } from './ProjectIntelligenceInputPanel';
import { ContextPreviewPanel }           from './ContextPreviewPanel';
import { SuggestionList }                from './SuggestionList';
import { BulkImportDialog }              from './BulkImportDialog';

// ─── Types ────────────────────────────────────────────────────────────────────

type InputMode = 'manual' | 'intelligence';
type WizardStep = 'input' | 'preview' | 'generate' | 'review';

const ALL_CATEGORIES: TestCategory[] = [
  'smoke', 'happy_path', 'validation', 'boundary',
  'negative', 'permission', 'navigation', 'regression',
];

const CATEGORY_LABELS: Record<TestCategory, string> = {
  smoke:       'Smoke',
  happy_path:  'Happy Path',
  validation:  'Validation',
  boundary:    'Boundary',
  negative:    'Negative',
  permission:  'Permission',
  navigation:  'Navigation',
  regression:  'Regression',
};

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'input',    label: 'Analyze Project' },
  { key: 'preview',  label: 'Preview Analysis' },
  { key: 'generate', label: 'Configure & Generate' },
  { key: 'review',   label: 'Review & Import' },
];

const STEP_INDEX: Record<WizardStep, number> = { input: 0, preview: 1, generate: 2, review: 3 };

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AITestGeneratorPage() {
  // ── Mode ──────────────────────────────────────────────────────────────────────
  const [inputMode, setInputMode] = useState<InputMode>('manual');

  // ── Wizard state ─────────────────────────────────────────────────────────────
  const [currentStep,   setCurrentStep]   = useState<WizardStep>('input');
  const [isAnalyzing,   setIsAnalyzing]   = useState(false);
  const [isGenerating,  setIsGenerating]  = useState(false);
  const [analyzeError,  setAnalyzeError]  = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // ── Manual mode state ─────────────────────────────────────────────────────────
  const [projectModel, setProjectModel] = useState<ProjectModel | null>(null);

  // ── Intelligence mode state ───────────────────────────────────────────────────
  const [piKnowledge,   setPiKnowledge]   = useState<ProjectKnowledge | null>(null);
  const [piOptions,     setPiOptions]     = useState<ContextGenerationOptions | null>(null);
  const [piProjectId,   setPiProjectId]   = useState<string>('');
  // existing test count loaded when PI configure runs
  const [existingCount, setExistingCount] = useState(0);

  // ── Manual generation options ─────────────────────────────────────────────────
  const [selectedCategories, setSelectedCategories] = useState<TestCategory[]>([
    'smoke', 'happy_path', 'validation',
  ]);
  const [maxSuggestions, setMaxSuggestions] = useState(20);

  // ── Suggestions ───────────────────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<TestSuggestion[]>([]);

  // ── Import dialog ─────────────────────────────────────────────────────────────
  const [importOpen, setImportOpen] = useState(false);
  const [snackbar,   setSnackbar]   = useState<string | null>(null);

  const connectorStatus = aiOrchestrationService.getStatus();

  // ── Mode switch: reset wizard ─────────────────────────────────────────────────
  const switchMode = (_: React.MouseEvent<HTMLElement>, next: InputMode | null) => {
    if (!next || next === inputMode) return;
    setInputMode(next);
    setCurrentStep('input');
    setProjectModel(null);
    setPiKnowledge(null);
    setPiOptions(null);
    setSuggestions([]);
    setAnalyzeError(null);
    setGenerateError(null);
  };

  // ── Manual mode handlers ──────────────────────────────────────────────────────
  const handleManualAnalyze = async (
    files:       SourceFile[],
    type:        import('@/services/aiTestGenerator').ProjectType,
    projectName: string,
  ) => {
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      const { model } = aiTestGenerationEngine.analyzeOnly(files, type, projectName || undefined);
      setProjectModel(model);
      setCurrentStep('preview');
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleManualGenerate = async () => {
    if (!projectModel) return;
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const options: GenerationOptions = { categories: selectedCategories, maxSuggestions };
      const result = await aiTestGenerationEngine.generate(
        [],
        projectModel.projectType,
        options,
        [],
        projectModel.projectName,
      );
      setSuggestions(result.suggestions);
      setCurrentStep('review');
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Intelligence mode handlers ────────────────────────────────────────────────
  const handlePIConfigure = async (
    knowledge:  ProjectKnowledge,
    options:    ContextGenerationOptions,
    projectId:  string,
  ) => {
    setPiKnowledge(knowledge);
    setPiOptions(options);
    setPiProjectId(projectId);

    // Pre-load existing test count for the preview panel
    try {
      const existing = await testCaseService.list(projectId);
      setExistingCount(existing.length);
    } catch {
      setExistingCount(0);
    }

    setCurrentStep('preview');
  };

  const handlePIGenerate = async () => {
    if (!piKnowledge || !piOptions) return;
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const result = await aiTestGenerationEngine.generateFromContext(
        piKnowledge,
        piOptions,
        piProjectId,
      );
      setSuggestions(result.suggestions);
      setCurrentStep('review');
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Shared suggestion handlers ────────────────────────────────────────────────
  const handleAccept    = (id: string) =>
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: 'accepted' } : s));
  const handleReject    = (id: string) =>
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: 'rejected' } : s));
  const handleAcceptAll = () =>
    setSuggestions(prev => prev.map(s => s.status === 'pending' ? { ...s, status: 'accepted' } : s));
  const handleRejectAll = () =>
    setSuggestions(prev => prev.map(s => s.status === 'pending' ? { ...s, status: 'rejected' } : s));
  const handleImported  = (count: number) => {
    setImportOpen(false);
    setSnackbar(`${count} test case${count !== 1 ? 's' : ''} imported successfully.`);
  };

  const toggleCategory = (cat: TestCategory) =>
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);

  const acceptedCount = suggestions.filter(s => s.status === 'accepted').length;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Header */}
      <Stack direction="row" spacing={1.5} alignItems="center" mb={3}>
        <AutoAwesomeIcon color="primary" />
        <Typography variant="h5" fontWeight={600}>AI Test Generator</Typography>
        <Chip label="Beta" size="small" color="warning" />
      </Stack>

      {/* Stepper */}
      <Stepper activeStep={STEP_INDEX[currentStep]} sx={{ mb: 3 }}>
        {STEPS.map(s => (
          <Step key={s.key}>
            <StepLabel>{s.label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* ── Step 0: Input ── */}
      {currentStep === 'input' && (
        <Paper sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" mb={2.5}>
            <Typography variant="h6">Analyze Project</Typography>
            <Box flex={1} />
            {/* Mode toggle */}
            <ToggleButtonGroup
              value={inputMode}
              exclusive
              onChange={switchMode}
              size="small"
            >
              <ToggleButton value="manual">
                <EditNoteIcon fontSize="small" sx={{ mr: 0.75 }} />
                Manual Source Files
              </ToggleButton>
              <ToggleButton value="intelligence">
                <AccountTreeIcon fontSize="small" sx={{ mr: 0.75 }} />
                Project Intelligence
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {analyzeError && <Alert severity="error" sx={{ mb: 2 }}>{analyzeError}</Alert>}

          {inputMode === 'manual' ? (
            <>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Paste source code files so the analyzer can extract screens, forms, APIs, and
                navigation flows. No code is sent to a server during analysis — it runs locally.
              </Typography>
              <ProjectInputPanel onAnalyze={handleManualAnalyze} isAnalyzing={isAnalyzing} />
            </>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Use an ingested project from <strong>Project Intelligence</strong> as AI context.
                No raw source files are sent to the AI — only compact summaries and symbols.
              </Typography>
              <ProjectIntelligenceInputPanel
                onConfigure={handlePIConfigure}
                isAnalyzing={isAnalyzing}
              />
            </>
          )}
        </Paper>
      )}

      {/* ── Step 1: Preview ── */}
      {currentStep === 'preview' && (
        <Paper sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <Typography variant="h6">
              {inputMode === 'manual' ? 'Analysis Preview' : 'Project Context Preview'}
            </Typography>
            <Box flex={1} />
            <Button size="small" onClick={() => setCurrentStep('input')}>← Back</Button>
            {inputMode === 'manual' ? (
              <Button variant="contained" onClick={() => setCurrentStep('generate')}>
                Continue to Generate →
              </Button>
            ) : (
              <Button
                variant="contained"
                startIcon={<AutoAwesomeIcon />}
                onClick={() => setCurrentStep('generate')}
                disabled={!connectorStatus.hasUsableConnectors && !connectorStatus.edgeFunctionEnabled}
              >
                Continue to Generate →
              </Button>
            )}
          </Stack>

          {inputMode === 'manual' && projectModel ? (
            <>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Review what was detected. Low confidence means less detailed output — add more files.
              </Typography>
              <ProjectModelPreview model={projectModel} />
            </>
          ) : inputMode === 'intelligence' && piKnowledge && piOptions ? (
            <ContextPreviewPanel
              knowledge={piKnowledge}
              options={piOptions}
              connectorStatus={connectorStatus}
              existingCount={existingCount}
            />
          ) : null}
        </Paper>
      )}

      {/* ── Step 2: Configure & Generate ── */}
      {currentStep === 'generate' && (
        <Paper sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <Typography variant="h6">Configure Generation</Typography>
            <Box flex={1} />
            <Button size="small" onClick={() => setCurrentStep('preview')}>← Back</Button>
          </Stack>

          {inputMode === 'manual' ? (
            <>
              <Typography variant="subtitle2" gutterBottom>Test categories to generate</Typography>
              <FormGroup row sx={{ mb: 2 }}>
                {ALL_CATEGORIES.map(cat => (
                  <FormControlLabel
                    key={cat}
                    control={
                      <Checkbox
                        checked={selectedCategories.includes(cat)}
                        onChange={() => toggleCategory(cat)}
                        size="small"
                      />
                    }
                    label={CATEGORY_LABELS[cat]}
                  />
                ))}
              </FormGroup>

              <Stack direction="row" spacing={2} alignItems="center" mb={2}>
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
                  Between 1 and 50.
                </Typography>
              </Stack>
            </>
          ) : (
            /* PI mode: config was already captured in input step; show summary */
            piOptions && piKnowledge && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Generating <strong>{piOptions.maxSuggestions ?? 20}</strong> test suggestions
                for <strong>{piKnowledge.name}</strong> using{' '}
                <strong>{piOptions.mode.replace('_', ' ')}</strong> mode.
                Existing tests will be loaded from the database to avoid duplicates.
              </Alert>
            )
          )}

          {generateError && <Alert severity="error" sx={{ mb: 2 }}>{generateError}</Alert>}
          {isGenerating && <LinearProgress sx={{ mb: 2 }} />}

          <Alert severity="info" sx={{ mb: 2, fontSize: 13 }}>
            Generated tests are presented as suggestions — no data is saved until you accept and
            import them.
          </Alert>

          {/* Connector status for PI mode */}
          {inputMode === 'intelligence' && (
            <Stack direction="row" spacing={1} alignItems="center" mb={2}>
              <AutoAwesomeIcon fontSize="small" color={connectorStatus.hasUsableConnectors ? 'primary' : 'disabled'} />
              {connectorStatus.hasUsableConnectors ? (
                <Typography variant="caption">
                  Using: <strong>{connectorStatus.activeConnectorName}</strong>
                  {connectorStatus.activeConnectorModel ? ` (${connectorStatus.activeConnectorModel})` : ''}
                </Typography>
              ) : (
                <Typography variant="caption" color="error">No connector available.</Typography>
              )}
              <Chip
                label={connectorStatus.edgeFunctionEnabled ? 'Edge: ON' : 'Edge: OFF'}
                size="small"
                variant="outlined"
                color={connectorStatus.edgeFunctionEnabled ? 'info' : 'default'}
              />
            </Stack>
          )}

          <Button
            variant="contained"
            startIcon={<AutoAwesomeIcon />}
            onClick={inputMode === 'manual' ? handleManualGenerate : handlePIGenerate}
            disabled={
              isGenerating ||
              (inputMode === 'manual' && selectedCategories.length === 0) ||
              (inputMode === 'intelligence' && !piKnowledge) ||
              (!connectorStatus.hasUsableConnectors && !connectorStatus.edgeFunctionEnabled)
            }
            size="large"
          >
            {isGenerating ? 'Generating…' : 'Generate Tests'}
          </Button>
        </Paper>
      )}

      {/* ── Step 3: Review ── */}
      {currentStep === 'review' && (
        <Paper sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <Typography variant="h6">Review Suggestions</Typography>
            <Box flex={1} />
            <Button size="small" onClick={() => setCurrentStep('generate')}>← Back</Button>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={() => setImportOpen(true)}
              disabled={acceptedCount === 0}
            >
              Import {acceptedCount > 0 ? `${acceptedCount} accepted` : ''}
            </Button>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {suggestions.length === 0 ? (
            <Alert severity="warning">
              No test suggestions were generated. Try a different generation mode or check your AI
              connector configuration.
            </Alert>
          ) : (
            <SuggestionList
              suggestions={suggestions}
              onAccept={handleAccept}
              onReject={handleReject}
              onAcceptAll={handleAcceptAll}
              onRejectAll={handleRejectAll}
            />
          )}
        </Paper>
      )}

      {/* ── Bulk Import Dialog ── */}
      <BulkImportDialog
        open={importOpen}
        suggestions={suggestions}
        onClose={() => setImportOpen(false)}
        onImported={handleImported}
      />

      {/* ── Snackbar ── */}
      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        message={snackbar}
      />
    </Container>
  );
}
