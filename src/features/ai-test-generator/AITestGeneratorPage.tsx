// ─── AI Test Generator Page (Phase 4 M6) ──────────────────────────────────────
// Main page orchestrating: ProjectInputPanel → ProjectModelPreview →
// generation options → SuggestionList → BulkImportDialog.
// AI is assistant-only — no suggestions are saved without explicit user approval.

import {
  Box, Container, Typography, Paper, Button, Step, Stepper, StepLabel,
  FormGroup, FormControlLabel, Checkbox, TextField, Alert, LinearProgress,
  Divider, Snackbar, Stack, Chip,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DownloadIcon    from '@mui/icons-material/Download';
import { useState }    from 'react';

import type {
  TestSuggestion, TestCategory, GenerationOptions,
} from '@/services/aiTestGenerator';
import type { SourceFile } from '@/services/aiTestGenerator';
import { aiTestGenerationEngine } from '@/services/aiTestGenerator';
import type { ProjectModel } from '@/services/aiTestGenerator';

import { ProjectInputPanel }    from './ProjectInputPanel';
import { ProjectModelPreview }  from './ProjectModelPreview';
import { SuggestionList }       from './SuggestionList';
import { BulkImportDialog }     from './BulkImportDialog';

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

type Step = 'input' | 'preview' | 'generate' | 'review';

const STEPS: { key: Step; label: string }[] = [
  { key: 'input',    label: 'Analyze Project' },
  { key: 'preview',  label: 'Preview Analysis' },
  { key: 'generate', label: 'Configure & Generate' },
  { key: 'review',   label: 'Review & Import' },
];

const STEP_INDEX: Record<Step, number> = { input: 0, preview: 1, generate: 2, review: 3 };

export function AITestGeneratorPage() {
  // ── Wizard state ─────────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep]   = useState<Step>('input');
  const [isAnalyzing,  setIsAnalyzing]  = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [projectModel, setProjectModel] = useState<ProjectModel | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // ── Generation options ────────────────────────────────────────────────────────
  const [selectedCategories, setSelectedCategories] = useState<TestCategory[]>([
    'smoke', 'happy_path', 'validation',
  ]);
  const [maxSuggestions, setMaxSuggestions] = useState(20);

  // ── Suggestions ───────────────────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<TestSuggestion[]>([]);

  // ── Import dialog ─────────────────────────────────────────────────────────────
  const [importOpen, setImportOpen] = useState(false);
  const [snackbar, setSnackbar]     = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleAnalyze = async (files: SourceFile[], type: import('@/services/aiTestGenerator').ProjectType, projectName: string) => {
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

  const handleGenerate = async () => {
    if (!projectModel) return;
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const options: GenerationOptions = {
        categories:    selectedCategories,
        maxSuggestions,
      };
      const result = await aiTestGenerationEngine.generate(
        [],              // already analyzed — pass empty files, model is embedded in engine
        projectModel.projectType,
        options,
        [],              // existingTestTitles — could be loaded from DB in future
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

  const handleAccept = (id: string) =>
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: 'accepted' } : s));

  const handleReject = (id: string) =>
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: 'rejected' } : s));

  const handleAcceptAll = () =>
    setSuggestions(prev => prev.map(s => s.status === 'pending' ? { ...s, status: 'accepted' } : s));

  const handleRejectAll = () =>
    setSuggestions(prev => prev.map(s => s.status === 'pending' ? { ...s, status: 'rejected' } : s));

  const handleImported = (count: number) => {
    setImportOpen(false);
    setSnackbar(`${count} test case${count !== 1 ? 's' : ''} imported successfully.`);
  };

  const toggleCategory = (cat: TestCategory) =>
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);

  const acceptedCount = suggestions.filter(s => s.status === 'accepted').length;

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

      {/* ── Step 0: Project Input ── */}
      {currentStep === 'input' && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Analyze Project</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Paste source code files so the analyzer can extract screens, forms, APIs, and navigation flows.
            No code is sent to a server during analysis — it runs locally in your browser.
          </Typography>
          {analyzeError && <Alert severity="error" sx={{ mb: 2 }}>{analyzeError}</Alert>}
          <ProjectInputPanel onAnalyze={handleAnalyze} isAnalyzing={isAnalyzing} />
        </Paper>
      )}

      {/* ── Step 1: Preview ── */}
      {currentStep === 'preview' && projectModel && (
        <Paper sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <Typography variant="h6">Analysis Preview</Typography>
            <Box flex={1} />
            <Button size="small" onClick={() => setCurrentStep('input')}>← Back</Button>
            <Button
              variant="contained"
              onClick={() => setCurrentStep('generate')}
            >
              Continue to Generate →
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Review what was detected. Low confidence means less detailed output — add more files to improve results.
          </Typography>
          <ProjectModelPreview model={projectModel} />
        </Paper>
      )}

      {/* ── Step 2: Generation Options ── */}
      {currentStep === 'generate' && (
        <Paper sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <Typography variant="h6">Configure Generation</Typography>
            <Box flex={1} />
            <Button size="small" onClick={() => setCurrentStep('preview')}>← Back</Button>
          </Stack>

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
              Between 1 and 50. AI may return fewer if overlap with existing tests is detected.
            </Typography>
          </Stack>

          {generateError && <Alert severity="error" sx={{ mb: 2 }}>{generateError}</Alert>}
          {isGenerating && <LinearProgress sx={{ mb: 2 }} />}

          <Alert severity="info" sx={{ mb: 2, fontSize: 13 }}>
            Generated tests are presented as suggestions — no data is saved until you accept and import them.
          </Alert>

          <Button
            variant="contained"
            startIcon={<AutoAwesomeIcon />}
            onClick={handleGenerate}
            disabled={isGenerating || selectedCategories.length === 0}
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

          <SuggestionList
            suggestions={suggestions}
            onAccept={handleAccept}
            onReject={handleReject}
            onAcceptAll={handleAcceptAll}
            onRejectAll={handleRejectAll}
          />
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
