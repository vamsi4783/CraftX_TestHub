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
  Divider, Snackbar, Stack, Chip, ToggleButtonGroup, ToggleButton, Tooltip,
} from '@mui/material';
import AutoAwesomeIcon  from '@mui/icons-material/AutoAwesome';
import DownloadIcon     from '@mui/icons-material/Download';
import EditNoteIcon     from '@mui/icons-material/EditNote';
import AccountTreeIcon  from '@mui/icons-material/AccountTree';
import CableIcon        from '@mui/icons-material/Cable';
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

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
import { useProjectIngestionStore } from '@/features/project-ingestion/projectIngestionStore';
import {
  getProjectSources,
  getProjectKnowledge,
} from '@/services/projectIngestion/projectIngestionDbService';

import { ProjectInputPanel }             from './ProjectInputPanel';
import { ProjectModelPreview }           from './ProjectModelPreview';
import { ProjectIntelligenceInputPanel } from './ProjectIntelligenceInputPanel';
import { ContextPreviewPanel }           from './ContextPreviewPanel';
import { ProjectUnderstandingSummary }   from './ProjectUnderstandingSummary';
import { TestPlanReviewPanel }           from './TestPlanReviewPanel';
import { SuggestionList }                from './SuggestionList';
import { BulkImportDialog }              from './BulkImportDialog';
import { buildHeuristicTestPlan }        from '@/services/aiTestGenerator';
import type { AiTestPlan, GenerationProvenance } from '@/services/aiTestGenerator';

// ─── Types ────────────────────────────────────────────────────────────────────

type InputMode = 'manual' | 'intelligence';
// PI wizard: input → understanding → plan → generate → review
// Manual wizard: input → preview → generate → review
type WizardStep = 'input' | 'preview' | 'understanding' | 'plan' | 'generate' | 'review';

const ALL_CATEGORIES: TestCategory[] = [
  'smoke', 'happy_path', 'validation', 'boundary',
  'negative', 'permission', 'navigation', 'regression',
  'integration', 'performance', 'api', 'data_validation', 'compatibility',
];

const CATEGORY_LABELS: Record<TestCategory, string> = {
  smoke:          'Smoke',
  happy_path:     'Happy Path',
  validation:     'Validation',
  boundary:       'Boundary',
  negative:       'Negative',
  permission:     'Permission',
  navigation:     'Navigation',
  regression:     'Regression',
  integration:    'Integration',
  performance:    'Performance',
  api:            'API',
  data_validation:'Data Validation',
  compatibility:  'Compatibility',
};

const MANUAL_STEPS: { key: WizardStep; label: string }[] = [
  { key: 'input',    label: 'Analyze Project' },
  { key: 'preview',  label: 'Preview Analysis' },
  { key: 'generate', label: 'Configure & Generate' },
  { key: 'review',   label: 'Review & Import' },
];

const PI_STEPS: { key: WizardStep; label: string }[] = [
  { key: 'input',         label: 'Select Project' },
  { key: 'understanding', label: 'Project Understanding' },
  { key: 'plan',          label: 'Test Plan' },
  { key: 'generate',      label: 'Configure & Generate' },
  { key: 'review',        label: 'Review & Import' },
];

const MANUAL_STEP_INDEX: Record<WizardStep, number> = { input: 0, preview: 1, understanding: -1, plan: -1, generate: 2, review: 3 };
const PI_STEP_INDEX:     Record<WizardStep, number> = { input: 0, preview: -1, understanding: 1, plan: 2, generate: 3, review: 4 };

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AITestGeneratorPage() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();

  // ── Mode ──────────────────────────────────────────────────────────────────────
  const [inputMode, setInputMode] = useState<InputMode>('manual');

  // ── Wizard state ─────────────────────────────────────────────────────────────
  const [currentStep,      setCurrentStep]      = useState<WizardStep>('input');
  const [isAnalyzing,      setIsAnalyzing]      = useState(false);
  const [isGenerating,     setIsGenerating]     = useState(false);
  const [isConfiguringPI,  setIsConfiguringPI]  = useState(false);
  const [analyzeError,     setAnalyzeError]     = useState<string | null>(null);
  const [generateError,    setGenerateError]    = useState<string | null>(null);

  // ── Manual mode state ─────────────────────────────────────────────────────────
  const [projectModel, setProjectModel] = useState<ProjectModel | null>(null);

  // ── Intelligence mode state ───────────────────────────────────────────────────
  const [piKnowledge,   setPiKnowledge]   = useState<ProjectKnowledge | null>(null);
  const [piOptions,     setPiOptions]     = useState<ContextGenerationOptions | null>(null);
  const [piProjectId,   setPiProjectId]   = useState<string>('');
  const [piTestPlan,    setPiTestPlan]    = useState<AiTestPlan | null>(null);
  const [piProvenance,  setPiProvenance]  = useState<GenerationProvenance | null>(null);
  // existing test count loaded when PI configure runs
  const [existingCount, setExistingCount] = useState(0);
  // per-module TestHub test case counts (moduleId → count)
  const [moduleTestCounts, setModuleTestCounts] = useState<Record<string, number>>({});

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
  const noConnector = !connectorStatus.hasUsableConnectors && !connectorStatus.edgeFunctionEnabled;

  // Pre-select project from ?project= URL param and switch to PI mode.
  // Also hydrates the Zustand store from Supabase when the store is empty
  // (happens on fresh navigation, direct URL, or cross-page navigation without
  // first visiting the Project Intelligence page).
  useEffect(() => {
    const projectParam = searchParams.get('project');
    if (!projectParam) return;
    setPiProjectId(projectParam);
    setInputMode('intelligence');

    const store = useProjectIngestionStore.getState();
    const hasKnowledge = !!store.knowledge[projectParam];
    const hasSources   = (store.sources[projectParam] ?? []).length > 0;

    if (!hasKnowledge || !hasSources) {
      Promise.all([
        hasSources  ? Promise.resolve(null) : getProjectSources(projectParam),
        hasKnowledge ? Promise.resolve(null) : getProjectKnowledge(projectParam),
      ]).then(([srcs, knowledge]) => {
        const { setSources, setKnowledge } = useProjectIngestionStore.getState();
        if (srcs)      setSources(projectParam, srcs);
        if (knowledge) setKnowledge(projectParam, knowledge);
      }).catch(() => { /* non-fatal — panel shows "no sources" with a link to PI page */ });
    }
  }, [searchParams]);

  // ── Mode switch: reset wizard ─────────────────────────────────────────────────
  const switchMode = (_: React.MouseEvent<HTMLElement>, next: InputMode | null) => {
    if (!next || next === inputMode) return;
    setInputMode(next);
    setCurrentStep('input');
    setProjectModel(null);
    setPiKnowledge(null);
    setPiOptions(null);
    setPiTestPlan(null);
    setPiProvenance(null);
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
    setIsConfiguringPI(true);
    setPiKnowledge(knowledge);
    setPiOptions(options);
    setPiProjectId(projectId);

    // Pre-load existing test count + per-module breakdown
    let count = 0;
    const perModule: Record<string, number> = {};
    try {
      const existing = await testCaseService.list(projectId);
      count = existing.length;
      for (const tc of existing) {
        if (tc.module_id) {
          perModule[tc.module_id] = (perModule[tc.module_id] ?? 0) + 1;
        }
      }
    } catch { /* non-fatal */ }
    setExistingCount(count);
    setModuleTestCounts(perModule);

    // Build heuristic test plan
    const plan = buildHeuristicTestPlan(
      knowledge,
      count,
      options.scope === 'module' ? options.moduleIds : undefined,
    );
    setPiTestPlan(plan);

    setCurrentStep('understanding');
    setIsConfiguringPI(false);
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
      if (result.provenance) setPiProvenance(result.provenance);
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
    const dest = piProjectId ? `/test-cases?project=${piProjectId}` : '/test-cases';
    navigate(dest, { state: { imported: count } });
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

      {/* Stepper — different steps for manual vs PI mode */}
      {(() => {
        const steps = inputMode === 'intelligence' ? PI_STEPS : MANUAL_STEPS;
        const index = inputMode === 'intelligence' ? PI_STEP_INDEX[currentStep] : MANUAL_STEP_INDEX[currentStep];
        return (
          <Stepper activeStep={index} sx={{ mb: 3 }}>
            {steps.map(s => (
              <Step key={s.key}>
                <StepLabel>{s.label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        );
      })()}

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
                isAnalyzing={isConfiguringPI}
              />
            </>
          )}
        </Paper>
      )}

      {/* ── Step 1 (Manual): Analysis Preview ── */}
      {currentStep === 'preview' && inputMode === 'manual' && (
        <Paper sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <Typography variant="h6">Analysis Preview</Typography>
            <Box flex={1} />
            <Button size="small" onClick={() => setCurrentStep('input')}>← Back</Button>
            <Button variant="contained" onClick={() => setCurrentStep('generate')}>
              Continue to Generate →
            </Button>
          </Stack>
          {projectModel && (
            <>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Review what was detected. Low confidence means less detailed output — add more files.
              </Typography>
              <ProjectModelPreview model={projectModel} />
            </>
          )}
        </Paper>
      )}

      {/* ── Step 1 (PI): Project Understanding ── */}
      {currentStep === 'understanding' && inputMode === 'intelligence' && piKnowledge && (
        <Paper sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <Typography variant="h6">Project Understanding</Typography>
            <Box flex={1} />
            <Button size="small" onClick={() => setCurrentStep('input')}>← Back</Button>
            <Button variant="contained" onClick={() => setCurrentStep('plan')}>
              Review Test Plan →
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Review what Project Intelligence detected about your project. This context will guide AI test generation.
          </Typography>
          <ProjectUnderstandingSummary knowledge={piKnowledge} existingCount={existingCount} />
        </Paper>
      )}

      {/* ── Step 2 (PI): Test Plan ── */}
      {currentStep === 'plan' && inputMode === 'intelligence' && piKnowledge && piTestPlan && (
        <Paper sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <Typography variant="h6">Test Plan</Typography>
            <Box flex={1} />
            {noConnector && (
              <Alert
                severity="warning"
                icon={<CableIcon fontSize="small" />}
                sx={{ py: 0, px: 1.5, fontSize: 12, alignItems: 'center' }}
                action={
                  <Button size="small" color="warning" onClick={() => navigate('/ai-connectors')}>
                    Add connector
                  </Button>
                }
              >
                No AI connector configured
              </Alert>
            )}
            <Button size="small" onClick={() => setCurrentStep('understanding')}>← Back</Button>
            <Tooltip title={noConnector ? 'Configure an AI connector in AI Connectors to continue' : ''} arrow>
              <span>
                <Button
                  variant="contained"
                  startIcon={<AutoAwesomeIcon />}
                  onClick={() => setCurrentStep('generate')}
                  disabled={noConnector}
                  sx={noConnector ? { opacity: 0.45 } : {}}
                >
                  Configure & Generate →
                </Button>
              </span>
            </Tooltip>
          </Stack>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Review the AI test plan before generating test cases. This shows what will be tested and why.
          </Typography>
          <TestPlanReviewPanel
            plan={piTestPlan}
            existingCounts={moduleTestCounts}
          />
        </Paper>
      )}

      {/* ── Step (Manual 2 / PI 3): Configure & Generate ── */}
      {currentStep === 'generate' && (
        <Paper sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <Typography variant="h6">Configure Generation</Typography>
            <Box flex={1} />
            <Button size="small" onClick={() => setCurrentStep(inputMode === 'intelligence' ? 'plan' : 'preview')}>← Back</Button>
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

          {/* Connector status */}
          <Stack direction="row" spacing={1} alignItems="center" mb={2}>
            <AutoAwesomeIcon fontSize="small" color={connectorStatus.hasUsableConnectors ? 'primary' : 'disabled'} />
            {connectorStatus.hasUsableConnectors ? (
              <Typography variant="caption">
                Using: <strong>{connectorStatus.activeConnectorName}</strong>
                {connectorStatus.activeConnectorModel ? ` (${connectorStatus.activeConnectorModel})` : ''}
              </Typography>
            ) : (
              <Typography variant="caption" color="text.secondary">No AI connector configured.</Typography>
            )}
            <Chip
              label={connectorStatus.edgeFunctionEnabled ? 'Edge: ON' : 'Edge: OFF'}
              size="small"
              variant="outlined"
              color={connectorStatus.edgeFunctionEnabled ? 'info' : 'default'}
            />
          </Stack>

          {noConnector && (
            <Alert
              severity="warning"
              icon={<CableIcon />}
              sx={{ mb: 2 }}
              action={
                <Button size="small" color="warning" onClick={() => navigate('/ai-connectors')}>
                  Configure
                </Button>
              }
            >
              An AI connector is required to generate tests. Add a connector (Gemini Flash, Ollama,
              OpenAI-compatible, or MCP) from the AI Connectors page — TestHub uses your own API key,
              not a shared key.
            </Alert>
          )}

          <Tooltip title={noConnector ? 'Add an AI connector to generate tests' : ''} arrow>
            <span>
              <Button
                variant="contained"
                startIcon={<AutoAwesomeIcon />}
                onClick={inputMode === 'manual' ? handleManualGenerate : handlePIGenerate}
                disabled={
                  isGenerating ||
                  (inputMode === 'manual' && selectedCategories.length === 0) ||
                  (inputMode === 'intelligence' && !piKnowledge) ||
                  noConnector
                }
                sx={noConnector ? { opacity: 0.45 } : {}}
                size="large"
              >
                {isGenerating ? 'Generating…' : 'Generate Tests'}
              </Button>
            </span>
          </Tooltip>
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
        provenance={piProvenance ?? undefined}
        preselectedProjectId={inputMode === 'intelligence' ? piProjectId : undefined}
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
