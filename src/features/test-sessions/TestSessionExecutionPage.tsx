import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Card, CardContent, Typography, Button, Chip, TextField, Alert,
  LinearProgress, Divider, Grid, Stack, IconButton, Tooltip, Dialog,
  DialogTitle, DialogContent, DialogActions, Stepper, Step, StepLabel,
  Avatar, Badge, CircularProgress, Collapse,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import BlockIcon from '@mui/icons-material/Block';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import BugReportIcon from '@mui/icons-material/BugReport';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import SaveIcon from '@mui/icons-material/Save';
import CheckIcon from '@mui/icons-material/Check';
import { testSessionService } from '@/services/testSessionService';
import { executionService } from '@/services/executionService';
import { bugService } from '@/services/bugService';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingState } from '@/components/common/LoadingState';
import { useAuth } from '@/hooks/useAuth';
import { toastSuccess, toastError } from '@/lib/errors';
import type { TestSessionCase, TestCaseStep, StepResultStatus, Bug } from '@/types';

type StepState = {
  status: StepResultStatus;
  actual_result: string;
  notes: string;
  bug_id?: string;
};

const RESULT_OPTIONS: { status: StepResultStatus; label: string; color: string; icon: React.ReactNode }[] = [
  { status: 'pass',       label: 'PASS',       color: '#10B981', icon: <CheckCircleIcon /> },
  { status: 'fail',       label: 'FAIL',       color: '#EF4444', icon: <CancelIcon /> },
  { status: 'blocked',    label: 'BLOCKED',    color: '#F59E0B', icon: <BlockIcon /> },
  { status: 'skipped',    label: 'SKIPPED',    color: '#6B7280', icon: <SkipNextIcon /> },
  { status: 'not_tested', label: 'N/A',        color: '#9CA3AF', icon: <RemoveCircleOutlineIcon /> },
];

function getOverallStatus(steps: StepState[]): StepResultStatus {
  const statuses = steps.map(s => s.status);
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.every(s => s === 'pass' || s === 'not_tested')) return 'pass';
  if (statuses.includes('skipped')) return 'skipped';
  return 'not_tested';
}

function AutoBugDialog({
  open, onClose, onCreated,
  session, sessionCase, stepNumber, stepResult,
}: {
  open: boolean; onClose: () => void; onCreated: (bug: Bug) => void;
  session: { id: string; project_id: string; release_id?: string | null; plan_id?: string | null };
  sessionCase: TestSessionCase;
  stepNumber: number;
  stepResult: StepState;
}) {
  const { profile } = useAuth();
  const tc = sessionCase.test_case;
  const isQuick = !stepNumber;

  const defaultTitle = `[${tc?.test_id ?? ''}] ${tc?.title ?? 'Test case failed'}`;

  const buildDescription = () => {
    const lines: string[] = [];
    lines.push(`**Test Case:** ${tc?.test_id} — ${tc?.title ?? ''}`);
    if (tc?.module?.name) lines.push(`**Module:** ${tc.module.name}`);
    if (tc?.priority)     lines.push(`**Priority:** ${tc.priority}`);
    lines.push('');
    if (tc?.preconditions) {
      lines.push('**Preconditions:**');
      lines.push(tc.preconditions);
      lines.push('');
    }
    if (!isQuick) {
      lines.push(`**Failed at Step:** ${stepNumber}`);
      lines.push('');
    }
    if (stepResult.actual_result) {
      lines.push('**What happened (Actual Result):**');
      lines.push(stepResult.actual_result);
      lines.push('');
    }
    if (stepResult.notes) {
      lines.push('**Tester Notes:**');
      lines.push(stepResult.notes);
    }
    return lines.join('\n').trim();
  };

  const [title, setTitle] = useState(defaultTitle);
  const [severity, setSeverity] = useState<'critical' | 'high' | 'medium' | 'low'>('high');
  const [description, setDescription] = useState(buildDescription);
  const [actualResult, setActualResult] = useState(stepResult.actual_result || '');
  const [stepsToReproduce, setStepsToReproduce] = useState('');

  const mutation = useMutation({
    mutationFn: () => bugService.create({
      project_id: session.project_id,
      release_id: session.release_id ?? undefined,
      test_case_id: sessionCase.test_case_id,
      test_session_id: session.id,
      test_plan_id: session.plan_id ?? undefined,
      title, description, severity,
      priority: 'p2', status: 'new',
      environment: 'QA',
      reported_by: profile!.id,
      steps_to_reproduce: stepsToReproduce || undefined,
      actual_result: actualResult || undefined,
    }),
    onSuccess: bug => {
      onCreated(bug);
      toastSuccess(`Bug ${bug.bug_id} created`);
      onClose();
    },
    onError: e => toastError(e),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <BugReportIcon color="error" /> Report Bug
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        {/* Context banner */}
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'error.main', color: '#fff', display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          <BugReportIcon sx={{ mt: 0.25, fontSize: 18 }} />
          <Box>
            <Typography variant="body2" fontWeight={700}>{tc?.test_id} — {tc?.title}</Typography>
            {tc?.module?.name && <Typography variant="caption" sx={{ opacity: 0.85 }}>Module: {tc.module.name}</Typography>}
          </Box>
        </Box>

        <TextField
          label="Bug Title *"
          value={title}
          onChange={e => setTitle(e.target.value)}
          fullWidth
          helperText="Edit to make the title more specific if needed"
        />

        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField
              select label="Severity" value={severity}
              onChange={e => setSeverity(e.target.value as typeof severity)}
              fullWidth SelectProps={{ native: true }}
            >
              {['critical', 'high', 'medium', 'low'].map(s => <option key={s} value={s}>{s}</option>)}
            </TextField>
          </Grid>
        </Grid>

        <TextField
          label="What actually happened? *"
          value={actualResult}
          onChange={e => setActualResult(e.target.value)}
          multiline rows={3} fullWidth
          placeholder="Describe exactly what went wrong — what you saw, what error appeared, what didn't work…"
          error={!actualResult.trim()}
          helperText={!actualResult.trim() ? 'Required — helps the developer reproduce the issue' : ''}
        />

        <TextField
          label="Steps to reproduce (optional)"
          value={stepsToReproduce}
          onChange={e => setStepsToReproduce(e.target.value)}
          multiline rows={3} fullWidth
          placeholder={`e.g.\n1. Open the app\n2. Navigate to …\n3. Tap …\n4. See error`}
        />

        <TextField
          label="Additional context (auto-filled from test case)"
          value={description}
          onChange={e => setDescription(e.target.value)}
          multiline rows={4} fullWidth
          helperText="Pre-filled with test case details — edit or expand as needed"
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">Skip — don't create bug</Button>
        <Button
          variant="contained" color="error" startIcon={<BugReportIcon />}
          disabled={!title.trim() || !actualResult.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Creating…' : 'Create Bug'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function TestSessionExecutionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const qc = useQueryClient();

  const [caseIndex, setCaseIndex] = useState(0);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [stepStates, setStepStates] = useState<Record<number, StepState>>({});
  const [stepResultIds, setStepResultIds] = useState<Record<number, string>>({});
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [bugDialogOpen, setBugDialogOpen] = useState(false);
  const [bugForStep, setBugForStep] = useState<number | null>(null);
  const [sessionNotes, setSessionNotes] = useState('');
  const autoSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingAdvance = useRef(false);

  const { data: session, isLoading } = useQuery({
    queryKey: ['test-session', id],
    queryFn: () => testSessionService.get(id!),
    enabled: !!id,
  });

  const cases = session?.cases ?? [];

  // Auto-advance to first pending case on session load/resume
  useEffect(() => {
    if (!session?.cases?.length) return;
    const firstPending = session.cases.findIndex(c => !['pass', 'fail', 'blocked', 'skipped'].includes(c.status));
    if (firstPending > 0) {
      setCaseIndex(firstPending);
    } else if (firstPending === -1) {
      // All cases are done — go back to the session detail instead of re-showing case 0
      navigate(`/test-sessions/${id}`);
    }
  }, [session?.id]);

  const currentCase = cases[caseIndex] ?? null;
  const steps: TestCaseStep[] = (currentCase?.test_case?.steps ?? []).sort((a, b) => a.step_number - b.step_number);
  const currentStep = steps[currentStepIdx] ?? null;

  // Start or resume execution for current case
  useEffect(() => {
    if (!currentCase || !session || !profile) return;
    setStepStates({});
    setStepResultIds({});
    setCurrentStepIdx(0);
    setExecutionId(null);

    (async () => {
      // Check for existing in-progress execution
      const existing = await executionService.getBySessionCase(currentCase.id).catch(() => null);
      if (existing && existing.status === 'in_progress') {
        setExecutionId(existing.id);
        // Load saved step results
        const results = await executionService.getStepResults(existing.id).catch(() => []);
        const states: Record<number, StepState> = {};
        const resultIds: Record<number, string> = {};
        results.forEach(r => {
          states[r.step_number] = { status: r.status as StepResultStatus, actual_result: r.actual_result ?? '', notes: r.notes ?? '', bug_id: r.bug_id ?? undefined };
          resultIds[r.step_number] = r.id;
        });
        setStepStates(states);
        setStepResultIds(resultIds);
        // Resume at last incomplete step
        const lastDone = results.filter(r => r.status !== 'not_tested').length;
        setCurrentStepIdx(Math.min(lastDone, steps.length - 1));
      } else {
        // Start new execution
        const exec = await executionService.start({
          session_id: session.id,
          session_case_id: currentCase.id,
          test_case_id: currentCase.test_case_id,
          project_id: session.project_id,
          release_id: session.release_id ?? undefined,
          executed_by: profile.id,
          environment: 'QA',
          step_snapshot: steps,
        }).catch(() => null);
        if (exec) setExecutionId(exec.id);
      }
    })();
  }, [caseIndex, currentCase?.id]);

  // Auto-save step result every 30s
  const autoSave = useCallback(async () => {
    if (!executionId || !currentStep) return;
    const state = stepStates[currentStep.step_number];
    if (!state || state.status === 'not_tested') return;
    await executionService.saveStepResult({
      execution_id: executionId,
      step_id: currentStep.id,
      step_number: currentStep.step_number,
      step_description: currentStep.description,
      expected_result: currentStep.expected_result,
      status: state.status,
      actual_result: state.actual_result,
      notes: state.notes,
    }).catch(() => null);
  }, [executionId, currentStep, stepStates]);

  useEffect(() => {
    autoSaveTimer.current = setInterval(autoSave, 30000);
    return () => { if (autoSaveTimer.current) clearInterval(autoSaveTimer.current); };
  }, [autoSave]);

  const setStep = (stepNum: number, update: Partial<StepState>) => {
    setStepStates(prev => {
      const existing: StepState = prev[stepNum] ?? { status: 'not_tested', actual_result: '', notes: '' };
      return { ...prev, [stepNum]: { ...existing, ...update } };
    });
  };

  const saveCurrentStep = async (): Promise<string | null> => {
    if (!executionId || !currentStep) return null;
    const state = stepStates[currentStep.step_number] ?? { status: 'not_tested' as StepResultStatus, actual_result: '', notes: '' };
    setSaving(true);
    try {
      const result = await executionService.saveStepResult({
        execution_id: executionId,
        step_id: currentStep.id,
        step_number: currentStep.step_number,
        step_description: currentStep.description,
        expected_result: currentStep.expected_result,
        status: state.status,
        actual_result: state.actual_result,
        notes: state.notes,
      });
      setStepResultIds(prev => ({ ...prev, [currentStep.step_number]: result.id }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return result.id;
    } catch (e) {
      toastError(e);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleStepNext = async () => {
    await saveCurrentStep();
    const state = stepStates[currentStep!.step_number];
    if (state?.status === 'fail') {
      setBugForStep(currentStep!.step_number);
      setBugDialogOpen(true);
    } else if (currentStepIdx < steps.length - 1) {
      setCurrentStepIdx(i => i + 1);
    }
  };

  const advanceCase = useCallback(async () => {
    if (!session) return;
    if (caseIndex < cases.length - 1) {
      setCaseIndex(i => i + 1);
    } else {
      await testSessionService.complete(session.id);
      toastSuccess('All cases complete! Session finished.');
      navigate(`/test-sessions/${id}`);
    }
  }, [caseIndex, cases.length, session, id, navigate]);

  const completeCase = async (finalStatus: StepResultStatus) => {
    if (!executionId || !currentCase || !session) return;
    setSaving(true);
    try {
      await executionService.complete(executionId, finalStatus, sessionNotes || undefined);
      await testSessionService.updateCaseStatus(currentCase.id, finalStatus);
      qc.invalidateQueries({ queryKey: ['test-session', id] });
      toastSuccess(`Case marked as ${finalStatus}`);

      if (finalStatus === 'fail') {
        // Open bug dialog first — advance happens after dialog is closed
        pendingAdvance.current = true;
        setBugForStep(null);
        setBugDialogOpen(true);
      } else {
        await advanceCase();
      }
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !session) return <LoadingState />;
  if (cases.length === 0) {
    return (
      <Box>
        <PageHeader title="Execute Session" subtitle={session.name}
          breadcrumbs={[{ label: 'Sessions', to: '/test-sessions' }, { label: session.name, to: `/test-sessions/${id}` }, { label: 'Execute' }]} />
        <Alert severity="warning">This session has no test cases. Add cases before executing.</Alert>
      </Box>
    );
  }

  const isQuickMode = steps.length === 0;

  const stepStatesArr = steps.map(s => stepStates[s.step_number] ?? { status: 'not_tested' as StepResultStatus, actual_result: '', notes: '' });
  const doneSteps = stepStatesArr.filter(s => s.status !== 'not_tested').length;
  const stepProgress = steps.length > 0 ? (doneSteps / steps.length) * 100 : 0;
  const currentStepState = currentStep ? (stepStates[currentStep.step_number] ?? { status: 'not_tested' as StepResultStatus, actual_result: '', notes: '' }) : null;
  const overallForCase = getOverallStatus(stepStatesArr);

  const sessionDone = cases.filter(c => ['pass','fail','blocked','skipped'].includes(c.status)).length;
  const sessionProgress = cases.length > 0 ? (sessionDone / cases.length) * 100 : 0;

  return (
    <Box maxWidth={960} mx="auto">
      <PageHeader
        title="Test Execution"
        subtitle={session.name}
        breadcrumbs={[{ label: 'Sessions', to: '/test-sessions' }, { label: session.name, to: `/test-sessions/${id}` }, { label: 'Execute' }]}
        showBack
        actions={
          <Button variant="outlined" onClick={() => navigate(`/test-sessions/${id}`)}>
            Exit Execution
          </Button>
        }
      />

      {/* Session overall progress */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box display="flex" alignItems="center" gap={2}>
            <Typography variant="caption" color="text.secondary" noWrap>Session Progress</Typography>
            <Box flex={1}>
              <LinearProgress variant="determinate" value={sessionProgress} sx={{ height: 8, borderRadius: 4 }} color="primary" />
            </Box>
            <Typography variant="caption" fontWeight={700} noWrap>{sessionDone}/{cases.length} cases</Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Case navigator */}
      <Box display="flex" gap={1} mb={2} flexWrap="wrap">
        {cases.map((sc, i) => {
          const color = sc.status === 'pass' ? '#10B981' : sc.status === 'fail' ? '#EF4444' : sc.status === 'blocked' ? '#F59E0B' : sc.status === 'skipped' ? '#6B7280' : sc.status === 'in_progress' ? '#4F46E5' : i === caseIndex ? '#4F46E5' : undefined;
          return (
            <Tooltip key={sc.id} title={sc.test_case?.title ?? ''}>
              <Box
                onClick={() => { if (i !== caseIndex) setCaseIndex(i); }}
                sx={{
                  width: 32, height: 32, borderRadius: 1, cursor: 'pointer',
                  bgcolor: color ? `${color}22` : 'action.hover',
                  border: `2px solid ${color ?? (i === caseIndex ? '#4F46E5' : 'transparent')}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
              >
                <Typography variant="caption" fontWeight={700} sx={{ color: color ?? 'text.secondary', fontSize: 10 }}>{i + 1}</Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      {/* ── QUICK MODE ── */}
      {isQuickMode && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={5}>
            <Card sx={{ borderLeft: '4px solid #4F46E5' }}>
              <CardContent>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>CASE {caseIndex + 1} OF {cases.length}</Typography>
                <Typography variant="h6" fontWeight={700} lineHeight={1.3} mb={0.5}>
                  {currentCase?.test_case?.title ?? '—'}
                </Typography>
                <Typography variant="caption" fontFamily="monospace" color="primary.main" display="block" mb={1.5}>
                  {currentCase?.test_case?.test_id ?? '—'}
                </Typography>
                <Box display="flex" gap={1} flexWrap="wrap" mb={1.5}>
                  <Chip label={(currentCase?.test_case?.priority ?? 'medium').toUpperCase()} size="small" />
                  {currentCase?.test_case?.module && (
                    <Chip label={currentCase.test_case.module.name} size="small" variant="outlined" />
                  )}
                </Box>
                {currentCase?.test_case?.estimated_minutes && (
                  <Typography variant="caption" color="text.secondary">
                    Est. {currentCase.test_case.estimated_minutes} min
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={7}>
            <Card>
              <CardContent>
                {currentCase?.test_case?.description && (
                  <Box sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
                    <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={0.5}>DESCRIPTION</Typography>
                    <Typography variant="body2">{currentCase.test_case.description}</Typography>
                  </Box>
                )}

                {currentCase?.test_case?.preconditions && (
                  <Box sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
                    <Typography variant="caption" fontWeight={700} color="warning.main" display="block" mb={0.5}>PRECONDITIONS</Typography>
                    <Typography variant="body2">{currentCase.test_case.preconditions}</Typography>
                  </Box>
                )}

                <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={1}>RESULT *</Typography>
                <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
                  {RESULT_OPTIONS.filter(o => o.status !== 'not_tested').map(opt => (
                    <Button
                      key={opt.status}
                      variant="outlined"
                      startIcon={opt.icon}
                      onClick={() => completeCase(opt.status)}
                      disabled={saving}
                      sx={{
                        borderColor: opt.color,
                        color: opt.color,
                        '&:hover': { bgcolor: `${opt.color}22`, borderColor: opt.color },
                        minWidth: 110,
                      }}
                    >
                      {saving ? <CircularProgress size={16} color="inherit" /> : opt.label}
                    </Button>
                  ))}
                </Box>

                <Divider sx={{ mb: 2 }} />
                <TextField
                  label="Notes (optional)"
                  value={sessionNotes}
                  onChange={e => setSessionNotes(e.target.value)}
                  fullWidth multiline rows={2} size="small"
                  placeholder="Observations about this test case…"
                />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ── GUIDED MODE — WITH STEPS ── */}
      {!isQuickMode && (
        <Grid container spacing={2}>
          {/* Left: Test Case Info + Steps sidebar */}
          <Grid item xs={12} md={4}>
            <Card sx={{ mb: 2, borderLeft: '4px solid #4F46E5' }}>
              <CardContent>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>CASE {caseIndex + 1} OF {cases.length}</Typography>
                <Typography variant="h6" fontWeight={700} lineHeight={1.3} mb={0.5}>
                  {currentCase?.test_case?.title ?? '—'}
                </Typography>
                <Typography variant="caption" fontFamily="monospace" color="primary.main">
                  {currentCase?.test_case?.test_id ?? '—'}
                </Typography>
                <Box display="flex" gap={1} mt={1} flexWrap="wrap">
                  <Chip label={currentCase?.test_case?.priority ?? '—'} size="small" />
                  {currentCase?.test_case?.module && (
                    <Chip label={currentCase.test_case.module.name} size="small" variant="outlined" />
                  )}
                </Box>
              </CardContent>
            </Card>

            {/* Steps sidebar */}
            <Card>
              <CardContent sx={{ pb: '12px !important' }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">STEPS</Typography>
              </CardContent>
              <Divider />
              {steps.map((step, i) => {
                const state = stepStates[step.step_number];
                const color = state?.status === 'pass' ? '#10B981' : state?.status === 'fail' ? '#EF4444' : state?.status === 'blocked' ? '#F59E0B' : state?.status === 'skipped' ? '#6B7280' : undefined;
                return (
                  <Box
                    key={step.id}
                    onClick={() => setCurrentStepIdx(i)}
                    sx={{
                      px: 2, py: 1, cursor: 'pointer',
                      bgcolor: i === currentStepIdx ? 'action.selected' : 'transparent',
                      borderLeft: `3px solid ${i === currentStepIdx ? '#4F46E5' : 'transparent'}`,
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Box display="flex" alignItems="center" gap={1}>
                      <Avatar sx={{ width: 20, height: 20, fontSize: 11, bgcolor: color ?? (i === currentStepIdx ? '#4F46E5' : 'grey.400') }}>
                        {state?.status === 'pass' ? '✓' : state?.status === 'fail' ? '✗' : step.step_number}
                      </Avatar>
                      <Typography variant="caption" sx={{ flex: 1 }} noWrap>{step.description}</Typography>
                    </Box>
                  </Box>
                );
              })}
            </Card>
          </Grid>

          {/* Right: Current step execution */}
          <Grid item xs={12} md={8}>
            {currentStep ? (
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="subtitle1" fontWeight={700}>Step {currentStep.step_number}</Typography>
                    <Box display="flex" gap={1}>
                      <IconButton size="small" disabled={currentStepIdx === 0} onClick={() => setCurrentStepIdx(i => i - 1)}><NavigateBeforeIcon /></IconButton>
                      <Typography variant="body2" color="text.secondary" alignSelf="center">{currentStepIdx + 1}/{steps.length}</Typography>
                      <IconButton size="small" disabled={currentStepIdx === steps.length - 1} onClick={() => setCurrentStepIdx(i => i + 1)}><NavigateNextIcon /></IconButton>
                    </Box>
                  </Box>

                  {/* Step progress */}
                  <LinearProgress variant="determinate" value={stepProgress} sx={{ mb: 2, height: 6, borderRadius: 3 }} />

                  {/* Action */}
                  <Box sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
                    <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={0.5}>ACTION</Typography>
                    <Typography variant="body2">{currentStep.description}</Typography>
                  </Box>

                  {/* Expected */}
                  <Box sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }}>
                    <Typography variant="caption" fontWeight={700} color="success.main" display="block" mb={0.5}>EXPECTED RESULT</Typography>
                    <Typography variant="body2">{currentStep.expected_result}</Typography>
                  </Box>

                  {currentStep.notes && (
                    <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>
                      <Typography variant="caption">{currentStep.notes}</Typography>
                    </Alert>
                  )}

                  {/* Result buttons */}
                  <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={1}>RESULT *</Typography>
                  <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
                    {RESULT_OPTIONS.map(opt => (
                      <Button
                        key={opt.status}
                        size="small"
                        variant={currentStepState?.status === opt.status ? 'contained' : 'outlined'}
                        startIcon={opt.icon}
                        onClick={() => setStep(currentStep.step_number, { status: opt.status })}
                        sx={{
                          borderColor: opt.color,
                          color: currentStepState?.status === opt.status ? '#fff' : opt.color,
                          bgcolor: currentStepState?.status === opt.status ? opt.color : 'transparent',
                          '&:hover': { bgcolor: `${opt.color}22`, borderColor: opt.color },
                        }}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </Box>

                  {/* Actual result (shown when fail/blocked) */}
                  <Collapse in={currentStepState?.status === 'fail' || currentStepState?.status === 'blocked'}>
                    <TextField
                      label="Actual Result *"
                      value={currentStepState?.actual_result ?? ''}
                      onChange={e => setStep(currentStep.step_number, { actual_result: e.target.value })}
                      fullWidth multiline rows={2} size="small" sx={{ mb: 2 }}
                      placeholder="What actually happened?"
                      error={currentStepState?.status === 'fail' && !currentStepState?.actual_result}
                    />
                  </Collapse>

                  <TextField
                    label="Notes (optional)"
                    value={currentStepState?.notes ?? ''}
                    onChange={e => setStep(currentStep.step_number, { notes: e.target.value })}
                    fullWidth multiline rows={2} size="small" sx={{ mb: 2 }}
                  />

                  {/* Step actions */}
                  <Divider sx={{ mb: 2 }} />
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Box display="flex" gap={1}>
                      <Tooltip title="Auto-save active">
                        <Button
                          size="small" variant="outlined" startIcon={saved ? <CheckIcon /> : saving ? <CircularProgress size={14} /> : <SaveIcon />}
                          onClick={saveCurrentStep} disabled={saving}
                          color={saved ? 'success' : 'primary'}
                        >
                          {saved ? 'Saved' : 'Save'}
                        </Button>
                      </Tooltip>
                      {currentStepState?.status === 'fail' && (
                        <Button size="small" variant="outlined" color="error" startIcon={<BugReportIcon />} onClick={() => { setBugForStep(currentStep.step_number); setBugDialogOpen(true); }}>
                          File Bug
                        </Button>
                      )}
                    </Box>
                    <Box display="flex" gap={1}>
                      {currentStepIdx < steps.length - 1 ? (
                        <Button variant="contained" endIcon={<NavigateNextIcon />} onClick={handleStepNext} disabled={!currentStepState?.status || currentStepState.status === 'not_tested'}>
                          Next Step
                        </Button>
                      ) : (
                        <Box display="flex" gap={1}>
                          <Button variant="outlined" color="error" onClick={() => completeCase('fail')} disabled={saving}>Mark FAIL</Button>
                          <Button variant="contained" color="success" startIcon={<CheckCircleIcon />} onClick={() => completeCase(overallForCase)} disabled={saving}>
                            Complete Case
                          </Button>
                        </Box>
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ) : null}

            {/* Session notes */}
            <Card sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={1}>SESSION NOTES</Typography>
                <TextField
                  value={sessionNotes}
                  onChange={e => setSessionNotes(e.target.value)}
                  fullWidth multiline rows={2} size="small"
                  placeholder="Notes about this session overall…"
                />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Auto Bug Dialog */}
      {bugDialogOpen && currentCase && (
        <AutoBugDialog
          open={bugDialogOpen}
          onClose={() => {
            setBugDialogOpen(false);
            setBugForStep(null);
            if (pendingAdvance.current) {
              pendingAdvance.current = false;
              advanceCase();
            } else if (currentStepIdx < steps.length - 1) {
              setCurrentStepIdx(i => i + 1);
            }
          }}
          onCreated={(bug) => {
            if (bugForStep !== null) {
              const stepResultId = stepResultIds[bugForStep];
              if (stepResultId) {
                executionService.linkBugToStep(stepResultId, bug.id).catch(() => null);
                setStep(bugForStep, { bug_id: bug.id });
              }
            }
          }}
          session={session}
          sessionCase={currentCase}
          stepNumber={bugForStep ?? currentStep?.step_number ?? 0}
          stepResult={bugForStep ? (stepStates[bugForStep] ?? { status: 'fail', actual_result: '', notes: '' }) : (currentStepState ?? { status: 'fail', actual_result: '', notes: '' })}
        />
      )}
    </Box>
  );
}
