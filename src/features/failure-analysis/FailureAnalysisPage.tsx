// ─── Failure Analysis Page (Phase 4 M8) ──────────────────────────────────────
// Loads completed failed runs, triggers AI analysis, displays the full report.

import {
  Box, Container, Typography, Stack, Chip, Button, Paper, Alert,
  LinearProgress, Divider, Accordion, AccordionSummary, AccordionDetails,
  List, ListItem, ListItemIcon, ListItemText, Tooltip, CircularProgress,
  TextField, MenuItem, Tab, Tabs,
} from '@mui/material';
import ExpandMoreIcon        from '@mui/icons-material/ExpandMore';
import BugReportIcon         from '@mui/icons-material/BugReport';
import AutoFixHighIcon       from '@mui/icons-material/AutoFixHigh';
import PsychologyIcon        from '@mui/icons-material/Psychology';
import TimelineIcon          from '@mui/icons-material/Timeline';
import CheckCircleIcon       from '@mui/icons-material/CheckCircle';
import CancelIcon            from '@mui/icons-material/Cancel';
import SkipNextIcon          from '@mui/icons-material/SkipNext';
import ErrorIcon             from '@mui/icons-material/Error';
import WarningIcon           from '@mui/icons-material/Warning';
import InfoIcon              from '@mui/icons-material/Info';
import DownloadIcon          from '@mui/icons-material/Download';
import HistoryIcon           from '@mui/icons-material/History';
import { useState, useEffect, useCallback } from 'react';
import { supabase }                          from '@/lib/supabase';
import { failureAnalysisEngine }             from '@/services/failureAnalysis/FailureAnalysisEngine';
import type {
  AnalysisReport, Recommendation, StepSummary, FailureCategory,
} from '@/services/failureAnalysis/FailureAnalysisTypes';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<FailureCategory, string> = {
  assertion_failure:  '#ef5350',
  locator_failure:    '#ff7043',
  timeout:            '#ffa726',
  crash:              '#b71c1c',
  navigation:         '#7e57c2',
  permission:         '#ec407a',
  visual_regression:  '#26c6da',
  api_failure:        '#42a5f5',
  unknown:            '#78909c',
};

const CATEGORY_LABEL: Record<FailureCategory, string> = {
  assertion_failure:  'Assertion Failure',
  locator_failure:    'Locator Failure',
  timeout:            'Timeout',
  crash:              'Crash / ANR',
  navigation:         'Navigation',
  permission:         'Permission',
  visual_regression:  'Visual Regression',
  api_failure:        'API / Network',
  unknown:            'Unknown',
};

const PRIORITY_COLOR: Record<string, 'error' | 'warning' | 'info' | 'success'> = {
  critical: 'error',
  high:     'warning',
  medium:   'info',
  low:      'success',
};

interface FailedRun {
  run_id:      string;
  state:       string;
  test_case_id?: string;
  test_cases?: { title: string } | { title: string }[] | null;
  started_at:  string;
  total_steps: number;
  failed_steps: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepStatusIcon({ status }: { status: StepSummary['status'] }) {
  if (status === 'passed')  return <CheckCircleIcon fontSize="small" color="success" />;
  if (status === 'skipped') return <SkipNextIcon    fontSize="small" color="disabled" />;
  return <CancelIcon fontSize="small" color="error" />;
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const PriorityIcon =
    rec.priority === 'critical' ? ErrorIcon :
    rec.priority === 'high'     ? WarningIcon : InfoIcon;

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 1.5 }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <PriorityIcon color={PRIORITY_COLOR[rec.priority]} sx={{ mt: 0.2, flexShrink: 0 }} />
        <Box flex={1}>
          <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
            <Typography variant="subtitle2" fontWeight={600}>{rec.title}</Typography>
            <Chip label={rec.priority} size="small" color={PRIORITY_COLOR[rec.priority]} />
            {rec.requiresUserApproval && (
              <Chip label="Requires approval" size="small" variant="outlined" />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">{rec.description}</Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

function ExecutionTimeline({ report }: { report: AnalysisReport }) {
  const { steps } = report.executionSummary;
  if (!steps.length) return <Typography variant="body2" color="text.secondary">No step data available.</Typography>;
  return (
    <List dense sx={{ p: 0 }}>
      {steps.map(step => (
        <ListItem key={step.stepId} sx={{ px: 0, py: 0.5, alignItems: 'flex-start' }}>
          <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
            <StepStatusIcon status={step.status} />
          </ListItemIcon>
          <ListItemText
            primary={
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" fontWeight={600}>Step {step.stepNumber}</Typography>
                <Typography variant="caption">{step.action}</Typography>
                {step.selector && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 10 }}>
                    {step.selector.slice(0, 60)}
                  </Typography>
                )}
                <Typography variant="caption" color="text.disabled">{step.duration_ms}ms</Typography>
              </Stack>
            }
            secondary={step.error && (
              <Typography variant="caption" color="error.main" sx={{ fontFamily: 'monospace', fontSize: 10 }}>
                {step.error.slice(0, 200)}
              </Typography>
            )}
          />
        </ListItem>
      ))}
    </List>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function FailureAnalysisPage() {
  const [tab,         setTab]         = useState(0);
  const [runs,        setRuns]        = useState<FailedRun[]>([]);
  const [selectedRun, setSelectedRun] = useState('');
  const [analyzing,   setAnalyzing]   = useState(false);
  const [report,      setReport]      = useState<AnalysisReport | null>(null);
  const [history,     setHistory]     = useState<AnalysisReport[]>([]);
  const [error,       setError]       = useState<string | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(true);

  // ── Load recent failed runs ───────────────────────────────────────────────
  useEffect(() => {
    setLoadingRuns(true);
    supabase
      .from('autonomous_run_results')
      .select('run_id, state, test_case_id, test_cases(title), started_at, total_steps, failed_steps')
      .in('state', ['Failed', 'failed', 'FAILED', 'error'])
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error: e }) => {
        if (!e) setRuns((data ?? []) as FailedRun[]);
        setLoadingRuns(false);
      });
  }, []);

  // ── Load history ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 1) return;
    failureAnalysisEngine.listReports(undefined, 30).then(setHistory);
  }, [tab]);

  // ── Trigger analysis ───────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!selectedRun) return;
    setAnalyzing(true);
    setError(null);
    setReport(null);
    try {
      const result = await failureAnalysisEngine.analyze(selectedRun);
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }, [selectedRun]);

  // ── Export report ─────────────────────────────────────────────────────────
  const exportReport = useCallback(() => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `failure-analysis-${report.runId.slice(0, 8)}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  const selectedRunData = runs.find(r => r.run_id === selectedRun);

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Header */}
      <Stack direction="row" spacing={1.5} alignItems="center" mb={3}>
        <BugReportIcon color="error" />
        <Typography variant="h5" fontWeight={600}>Failure Analysis</Typography>
        <Box flex={1} />
        {report && (
          <Button startIcon={<DownloadIcon />} onClick={exportReport} size="small">
            Export JSON
          </Button>
        )}
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="New Analysis" />
        <Tab label="History" icon={<HistoryIcon fontSize="small" />} iconPosition="end" />
      </Tabs>

      {/* ── Tab 0: New Analysis ────────────────────────────────────────────── */}
      {tab === 0 && (
        <Box>
          {/* Run selector */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-end">
              <TextField
                select label="Select failed run" size="small" fullWidth
                value={selectedRun} onChange={e => setSelectedRun(e.target.value)}
                disabled={loadingRuns}
                helperText={loadingRuns ? 'Loading runs…' : `${runs.length} failed runs available`}
              >
                {runs.map(r => (
                  <MenuItem key={r.run_id} value={r.run_id}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="caption" fontWeight={600}>
                        {(Array.isArray(r.test_cases) ? r.test_cases[0]?.title : (r.test_cases as { title: string } | null)?.title) ?? r.test_case_id?.slice(0, 8) ?? 'Unknown'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {r.run_id.slice(0, 8)} — {new Date(r.started_at).toLocaleDateString()} — {r.failed_steps}/{r.total_steps} failed
                      </Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained" startIcon={analyzing ? <CircularProgress size={16} color="inherit" /> : <PsychologyIcon />}
                onClick={handleAnalyze} disabled={!selectedRun || analyzing}
                sx={{ minWidth: 160, flexShrink: 0 }}
              >
                {analyzing ? 'Analyzing…' : 'Analyze Failure'}
              </Button>
            </Stack>
          </Paper>

          {analyzing && <LinearProgress sx={{ mb: 2 }} />}
          {error    && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {!report && !analyzing && (
            <Alert severity="info">
              Select a failed run above and click "Analyze Failure" to get AI-powered root cause analysis.
            </Alert>
          )}

          {/* Report */}
          {report && <ReportView report={report} />}
        </Box>
      )}

      {/* ── Tab 1: History ─────────────────────────────────────────────────── */}
      {tab === 1 && (
        <Box>
          {history.length === 0 ? (
            <Alert severity="info">No analysis reports found. Run your first failure analysis above.</Alert>
          ) : (
            history.map(r => (
              <Paper
                key={r.id} variant="outlined"
                sx={{ p: 2, mb: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                onClick={() => { setReport(r); setTab(0); }}
              >
                <Stack direction="row" spacing={2} alignItems="center">
                  <Chip
                    label={CATEGORY_LABEL[r.classification.category]}
                    size="small"
                    sx={{ bgcolor: CATEGORY_COLOR[r.classification.category], color: '#fff', flexShrink: 0 }}
                  />
                  <Typography variant="body2" fontWeight={500}>
                    {r.executionSummary.testCaseName ?? r.testCaseId ?? 'Unknown test'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Run {r.runId.slice(0, 8)}
                  </Typography>
                  <Box flex={1} />
                  <Chip
                    label={r.status} size="small"
                    color={r.status === 'complete' ? 'success' : 'default'}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {new Date(r.createdAt).toLocaleString()}
                  </Typography>
                </Stack>
              </Paper>
            ))
          )}
        </Box>
      )}
    </Container>
  );
}

// ─── Report view (separated for readability) ───────────────────────────────────

function ReportView({ report }: { report: AnalysisReport }) {
  const { classification, executionSummary: summary, aiAnalysis, recommendations, previousFailures, evidence } = report;

  const confPct = Math.round(classification.confidence * 100);
  const aiConfPct = aiAnalysis ? Math.round(aiAnalysis.confidence * 100) : null;
  const regPct    = aiAnalysis ? Math.round(aiAnalysis.regressionProbability * 100) : null;

  return (
    <Stack spacing={2}>
      {/* ── Classification banner ───────────────────────────────────────────── */}
      <Paper
        sx={{ p: 2, borderLeft: 4, borderColor: CATEGORY_COLOR[classification.category] }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
          <Box flex={1}>
            <Stack direction="row" spacing={1.5} alignItems="center" mb={0.5}>
              <Chip
                label={CATEGORY_LABEL[classification.category]}
                sx={{ bgcolor: CATEGORY_COLOR[classification.category], color: '#fff', fontWeight: 700 }}
              />
              <Typography variant="caption" color="text.secondary">
                Confidence {confPct}%
              </Typography>
            </Stack>
            <Stack direction="row" spacing={0.5} flexWrap="wrap">
              {classification.signals.map((s, i) => (
                <Chip key={i} label={s} size="small" variant="outlined" sx={{ fontSize: 11 }} />
              ))}
            </Stack>
          </Box>
          <Box minWidth={120}>
            <Typography variant="caption" color="text.secondary" display="block">Classification</Typography>
            <LinearProgress
              variant="determinate" value={confPct}
              sx={{ height: 8, borderRadius: 4, mt: 0.5 }}
              color={confPct >= 80 ? 'success' : confPct >= 50 ? 'warning' : 'error'}
            />
          </Box>
        </Stack>
      </Paper>

      {/* ── Run info ────────────────────────────────────────────────────────── */}
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <Chip label={`Run: ${report.runId.slice(0, 12)}`} size="small" />
        <Chip label={`${summary.totalSteps} steps`} size="small" />
        <Chip label={`${summary.failedSteps} failed`} size="small" color="error" />
        <Chip label={`${Math.round(summary.duration_ms / 1000)}s`} size="small" />
        {summary.deviceInfo && (
          <Chip label={`${summary.deviceInfo.platform} ${summary.deviceInfo.os_version ?? ''}`} size="small" />
        )}
        {summary.testCaseName && (
          <Chip label={summary.testCaseName} size="small" variant="outlined" />
        )}
      </Stack>

      {/* ── AI Analysis ─────────────────────────────────────────────────────── */}
      {aiAnalysis ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
            <PsychologyIcon color="primary" />
            <Typography variant="subtitle1" fontWeight={600}>AI Root Cause Analysis</Typography>
            <Chip label={`${aiConfPct}% confidence`} size="small" color={aiConfPct! >= 80 ? 'success' : 'warning'} />
          </Stack>

          <Typography variant="body1" gutterBottom sx={{ fontWeight: 500 }}>
            {aiAnalysis.rootCause}
          </Typography>
          <Divider sx={{ my: 1.5 }} />

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Box flex={1}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Developer Explanation</Typography>
              <Typography variant="body2" mt={0.5}>{aiAnalysis.developerExplanation}</Typography>
            </Box>
            <Box flex={1}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>QA Explanation</Typography>
              <Typography variant="body2" mt={0.5}>{aiAnalysis.qaExplanation}</Typography>
            </Box>
          </Stack>

          {aiAnalysis.likelySourceFiles.length > 0 && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Likely Source Files</Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" mt={0.5}>
                {aiAnalysis.likelySourceFiles.map((f, i) => (
                  <Chip key={i} label={f} size="small" sx={{ fontFamily: 'monospace' }} />
                ))}
              </Stack>
            </>
          )}

          <Divider sx={{ my: 1.5 }} />
          <Stack direction="row" spacing={3}>
            <Box>
              <Typography variant="caption" color="text.secondary">Regression Probability</Typography>
              <Stack direction="row" spacing={0.5} alignItems="center" mt={0.5}>
                <LinearProgress
                  variant="determinate" value={regPct!}
                  sx={{ width: 80, height: 8, borderRadius: 4 }}
                  color={regPct! >= 70 ? 'error' : regPct! >= 40 ? 'warning' : 'success'}
                />
                <Typography variant="caption" fontWeight={600}>{regPct}%</Typography>
              </Stack>
            </Box>
            {aiAnalysis.evidenceSummary && (
              <Box flex={1}>
                <Typography variant="caption" color="text.secondary">Evidence Summary</Typography>
                <Typography variant="caption" display="block" mt={0.5}>{aiAnalysis.evidenceSummary}</Typography>
              </Box>
            )}
          </Stack>
        </Paper>
      ) : (
        <Alert severity="warning" icon={<PsychologyIcon />}>
          AI analysis was not performed (offline mode or API error). Deterministic classification only.
        </Alert>
      )}

      {/* ── Recommendations ─────────────────────────────────────────────────── */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} alignItems="center">
            <AutoFixHighIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" fontWeight={600}>
              Recommendations ({recommendations.length})
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          {recommendations.map(rec => (
            <RecommendationCard key={rec.id} rec={rec} />
          ))}
        </AccordionDetails>
      </Accordion>

      {/* ── Execution timeline ───────────────────────────────────────────────── */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} alignItems="center">
            <TimelineIcon fontSize="small" color="action" />
            <Typography variant="subtitle2" fontWeight={600}>
              Execution Timeline ({summary.steps.length} steps)
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <ExecutionTimeline report={report} />
        </AccordionDetails>
      </Accordion>

      {/* ── Evidence viewer ──────────────────────────────────────────────────── */}
      {evidence.length > 0 && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2" fontWeight={600}>
              Evidence ({evidence.length} items)
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Stack spacing={1.5}>
              {evidence.map(ev => (
                <Paper key={ev.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Chip label={ev.type} size="small" />
                    {ev.stepNumber != null && (
                      <Typography variant="caption" color="text.secondary">Step {ev.stepNumber}</Typography>
                    )}
                    {ev.url && (
                      <Chip
                        label="View" size="small" variant="outlined" clickable
                        component="a" href={ev.url} target="_blank" rel="noopener noreferrer"
                      />
                    )}
                  </Stack>
                  {ev.content && (
                    <Typography variant="caption" display="block" mt={0.5}
                      sx={{ fontFamily: ev.type === 'exception' ? 'monospace' : undefined, color: ev.type === 'exception' ? 'error.main' : 'text.secondary' }}>
                      {ev.content.slice(0, 400)}
                    </Typography>
                  )}
                </Paper>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      {/* ── Previous failures ────────────────────────────────────────────────── */}
      {previousFailures.length > 0 && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <HistoryIcon fontSize="small" color="action" />
              <Typography variant="subtitle2" fontWeight={600}>
                Previous Failures ({previousFailures.length})
              </Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            {previousFailures.map((pf, i) => (
              <Stack key={i} direction="row" spacing={1.5} alignItems="center" py={0.75}
                sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                <Chip
                  label={CATEGORY_LABEL[pf.category]}
                  size="small"
                  sx={{ bgcolor: CATEGORY_COLOR[pf.category], color: '#fff' }}
                />
                <Typography variant="caption" color="text.secondary">
                  {new Date(pf.createdAt).toLocaleDateString()}
                </Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.disabled' }}>
                  {pf.runId.slice(0, 8)}
                </Typography>
                <Box flex={1} />
                <Chip
                  label={pf.resolved ? 'Resolved' : 'Unresolved'}
                  size="small"
                  color={pf.resolved ? 'success' : 'default'}
                  variant="outlined"
                />
              </Stack>
            ))}
          </AccordionDetails>
        </Accordion>
      )}
    </Stack>
  );
}
