// ─── AutonomousRunnerPage ─────────────────────────────────────────────────────
// Main page for running automation steps attached to a test case.

import { useState, useEffect }     from 'react';
import { useParams, useNavigate }  from 'react-router-dom';
import {
  Box, Container, Paper, Typography, ToggleButtonGroup,
  ToggleButton, Divider, Skeleton, Alert,
} from '@mui/material';
import ArrowBackIcon      from '@mui/icons-material/ArrowBack';
import PlayArrowIcon      from '@mui/icons-material/PlayArrow';
import SmartToyIcon       from '@mui/icons-material/SmartToy';
import PauseCircleIcon    from '@mui/icons-material/PauseCircle';
import AutoModeIcon       from '@mui/icons-material/AutoMode';
import { useQuery }       from '@tanstack/react-query';
import { supabase }       from '@/lib/supabase';
import type { TestCaseStep }    from '@/types';
import type { ExecutionMode }   from './runnerTypes';
import { useAutonomousRunner }  from './useAutonomousRunner';
import { ExecutionProgress }    from './ExecutionProgress';
import { StepProgressList }     from './StepProgressList';
import { RunnerControls }       from './RunnerControls';
import { ExecutionReport }      from './ExecutionReport';

// ─── Data loading ─────────────────────────────────────────────────────────────

async function fetchSteps(testCaseId: string): Promise<TestCaseStep[]> {
  const { data, error } = await supabase
    .from('test_case_steps')
    .select('*')
    .eq('test_case_id', testCaseId)
    .order('step_number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TestCaseStep[];
}

async function fetchTestCaseName(testCaseId: string): Promise<string> {
  const { data } = await supabase
    .from('test_cases')
    .select('name')
    .eq('id', testCaseId)
    .single();
  return (data as { name?: string } | null)?.name ?? 'Test Case';
}

// ─── Mode options ─────────────────────────────────────────────────────────────

const MODES: { value: ExecutionMode; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    value: 'Manual',
    label: 'Manual',
    icon:  <PauseCircleIcon sx={{ fontSize: 18 }} />,
    desc:  'Pause before every step — you confirm each action.',
  },
  {
    value: 'SemiAuto',
    label: 'Semi-Auto',
    icon:  <SmartToyIcon sx={{ fontSize: 18 }} />,
    desc:  'Runs automatically; pauses on failure for your decision.',
  },
  {
    value: 'FullyAuto',
    label: 'Fully Auto',
    icon:  <AutoModeIcon sx={{ fontSize: 18 }} />,
    desc:  'Runs end-to-end without interruption.',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function AutonomousRunnerPage() {
  const { id: testCaseId = '' } = useParams<{ id: string }>();
  const navigate                = useNavigate();
  const [mode, setMode]         = useState<ExecutionMode>('FullyAuto');

  const {
    state, currentStepIndex, stepProgress, elapsedMs,
    report, evidenceCount,
    start, pause, resume, cancel, retryStep, skipStep, confirmStep, reset,
  } = useAutonomousRunner();

  // ── Fetch test case data ──────────────────────────────────────────────────

  const stepsQuery = useQuery({
    queryKey: ['test-case-steps', testCaseId],
    queryFn:  () => fetchSteps(testCaseId),
    enabled:  !!testCaseId,
  });

  const nameQuery = useQuery({
    queryKey: ['test-case-name', testCaseId],
    queryFn:  () => fetchTestCaseName(testCaseId),
    enabled:  !!testCaseId,
  });

  const steps         = stepsQuery.data ?? [];
  const automatedSteps = steps.filter(s => s.automation_config !== null);
  const isRunning      = state !== 'Idle';
  const isTerminal     = state === 'Completed' || state === 'Failed' || state === 'Cancelled';

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStart = () => {
    start(steps, { mode });
  };

  // ─ Render ─────────────────────────────────────────────────────────────────

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      {/* Back nav */}
      <Box
        display="flex"
        alignItems="center"
        gap={1}
        mb={2}
        sx={{ cursor: 'pointer', color: 'primary.main', width: 'fit-content' }}
        onClick={() => navigate(`/test-cases/${testCaseId}`)}
      >
        <ArrowBackIcon sx={{ fontSize: 18 }} />
        <Typography variant="body2">
          {nameQuery.data ?? 'Test Case'}
        </Typography>
      </Box>

      {/* Page title */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <PlayArrowIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h5" fontWeight={700}>Autonomous Test Runner</Typography>
        <Box
          sx={{
            ml: 'auto', px: 1, py: 0.25, borderRadius: 1,
            bgcolor: 'action.hover',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {automatedSteps.length} / {steps.length} steps automated
          </Typography>
        </Box>
      </Box>

      {/* Loading */}
      {stepsQuery.isLoading && (
        <Box>
          <Skeleton height={48} sx={{ mb: 1 }} />
          <Skeleton height={280} />
        </Box>
      )}

      {/* Error */}
      {stepsQuery.isError && (
        <Alert severity="error">
          Failed to load test case steps.
        </Alert>
      )}

      {/* No automated steps */}
      {!stepsQuery.isLoading && automatedSteps.length === 0 && (
        <Alert severity="info">
          No automation configs found. Open the test case and click "Configure" on each step.
        </Alert>
      )}

      {/* Main content */}
      {!stepsQuery.isLoading && automatedSteps.length > 0 && (
        <Box display="flex" flexDirection="column" gap={2}>
          {/* Mode selector — only shown when idle */}
          {!isRunning && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
                Execution Mode
              </Typography>
              <ToggleButtonGroup
                value={mode}
                exclusive
                onChange={(_, v) => v && setMode(v)}
                size="small"
                fullWidth
              >
                {MODES.map(m => (
                  <ToggleButton key={m.value} value={m.value} sx={{ gap: 0.75 }}>
                    {m.icon}
                    {m.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                {MODES.find(m => m.value === mode)?.desc}
              </Typography>
            </Paper>
          )}

          {/* Progress panel — shown while running */}
          {isRunning && (
            <ExecutionProgress
              state={state}
              currentStepIndex={currentStepIndex}
              stepProgress={stepProgress}
              elapsedMs={elapsedMs}
              evidenceCount={evidenceCount}
            />
          )}

          {/* Controls */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <RunnerControls
              state={state}
              currentStepIndex={currentStepIndex}
              onStart={handleStart}
              onPause={pause}
              onResume={resume}
              onCancel={cancel}
              onRetry={() => retryStep(currentStepIndex)}
              onSkip={skipStep}
              onConfirm={confirmStep}
              onReset={reset}
            />
          </Paper>

          {/* Step list */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
              Steps
            </Typography>
            <Divider sx={{ mb: 1 }} />
            <StepProgressList
              steps={isRunning || isTerminal ? stepProgress : automatedSteps.map(s => ({
                stepId:      s.id,
                stepNumber:  s.step_number,
                description: s.description,
                action:      s.automation_config!.action,
                driverId:    s.automation_config!.driver_id,
                status:      'pending' as const,
                duration_ms: 0,
                retryCount:  0,
              }))}
              currentStepIndex={currentStepIndex}
            />
          </Paper>

          {/* Report — shown after terminal state */}
          {isTerminal && report && (
            <ExecutionReport report={report} />
          )}
        </Box>
      )}
    </Container>
  );
}
