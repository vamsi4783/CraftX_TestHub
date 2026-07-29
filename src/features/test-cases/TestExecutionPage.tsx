import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Card, CardContent, Typography, Button, Stepper, Step, StepLabel,
  StepContent, TextField, Chip, Alert, LinearProgress, Divider, Grid,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import BlockIcon from '@mui/icons-material/Block';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { supabase } from '@/lib/supabase';
import { testCaseService } from '@/services/testCaseService';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingState } from '@/components/common/LoadingState';
import { SeverityChip } from '@/components/common/SeverityChip';
import { useAuth } from '@/hooks/useAuth';
import type { ResultStatus } from '@/types';

const RESULT_BUTTONS: { status: ResultStatus; label: string; color: string; icon: React.ReactNode }[] = [
  { status: 'pass',       label: 'PASS',       color: '#10B981', icon: <CheckCircleIcon /> },
  { status: 'fail',       label: 'FAIL',       color: '#EF4444', icon: <CancelIcon /> },
  { status: 'blocked',    label: 'BLOCKED',    color: '#F59E0B', icon: <BlockIcon /> },
  { status: 'skipped',    label: 'SKIPPED',    color: '#6B7280', icon: <SkipNextIcon /> },
  { status: 'not_tested', label: 'NOT TESTED', color: '#9CA3AF', icon: <RemoveCircleOutlineIcon /> },
];

export function TestExecutionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [result, setResult] = useState<ResultStatus | null>(null);
  const [notes, setNotes] = useState('');
  const [deviceInfo, setDeviceInfo] = useState('');
  const [activeStep, setActiveStep] = useState(0);

  const { data: assignment, isLoading } = useQuery({
    queryKey: ['assignment', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('test_assignments')
        .select(`
          *, test_case:test_cases(*, steps:test_case_steps(*), module:modules(id,name)),
          release:releases(id,name,version)
        `)
        .eq('id', id!)
        .single();
      if (error) throw error;
      if (data?.test_case?.steps) data.test_case.steps.sort((a: any, b: any) => a.step_number - b.step_number);
      return data;
    },
    enabled: !!id,
  });

  const submitMutation = useMutation({
    mutationFn: () => testCaseService.submitResult({
      assignment_id: id!,
      test_case_id: assignment.test_case.id,
      release_id: assignment.release_id,
      executed_by: profile!.id,
      status: result!,
      notes: notes || undefined,
      device_info: deviceInfo || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
      navigate(-1);
    },
  });

  if (isLoading || !assignment) return <LoadingState />;

  const tc = assignment.test_case;
  const steps = tc.steps ?? [];
  const progress = steps.length > 0 ? ((activeStep) / steps.length) * 100 : 0;

  return (
    <Box maxWidth={800} mx="auto">
      <PageHeader
        title="Test Execution"
        subtitle={`${tc.test_id} · ${assignment.release?.name}`}
        breadcrumbs={[{ label: 'My Tests', to: '/my-tests' }, { label: 'Execute' }]}
      showBack
      />

      {/* Test case header */}
      <Card sx={{ mb: 3, borderLeft: `4px solid #4F46E5` }}>
        <CardContent>
          <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={2}>
            <Box>
              <Typography variant="h6" fontWeight={700}>{tc.title}</Typography>
              {tc.description && <Typography variant="body2" color="text.secondary" mt={0.5}>{tc.description}</Typography>}
              {tc.preconditions && (
                <Alert severity="info" sx={{ mt: 1.5, py: 0.5 }}>
                  <Typography variant="caption"><strong>Preconditions:</strong> {tc.preconditions}</Typography>
                </Alert>
              )}
            </Box>
            <Box display="flex" gap={1} flexShrink={0}>
              <SeverityChip value={tc.priority} />
              {tc.module && <Chip label={tc.module.name} size="small" variant="outlined" />}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Progress */}
      <Box mb={2}>
        <Box display="flex" justifyContent="space-between" mb={0.5}>
          <Typography variant="caption" color="text.secondary">Step {Math.min(activeStep + 1, steps.length)} of {steps.length}</Typography>
          <Typography variant="caption" color="text.secondary">{Math.round(progress)}%</Typography>
        </Box>
        <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 4 }} />
      </Box>

      {/* Steps */}
      {steps.length > 0 ? (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} mb={2}>Test Steps</Typography>
            <Stepper activeStep={activeStep} orientation="vertical">
              {steps.map((step: any, i: number) => (
                <Step key={step.id}>
                  <StepLabel>
                    <Typography variant="body2" fontWeight={activeStep === i ? 700 : 400}>
                      Step {step.step_number}
                    </Typography>
                  </StepLabel>
                  <StepContent>
                    <Box mb={1.5}>
                      <Typography variant="body2" mb={1}>{step.description}</Typography>
                      <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
                        <Typography variant="caption" fontWeight={700} color="success.main">Expected Result</Typography>
                        <Typography variant="body2">{step.expected_result}</Typography>
                      </Box>
                      {step.notes && <Typography variant="caption" color="text.secondary" mt={0.5} display="block">📝 {step.notes}</Typography>}
                    </Box>
                    <Box display="flex" gap={1}>
                      {i < steps.length - 1 && (
                        <Button size="small" variant="contained" onClick={() => setActiveStep(i + 1)}>Next Step</Button>
                      )}
                      {i === steps.length - 1 && (
                        <Button size="small" variant="contained" color="success" onClick={() => setActiveStep(steps.length)}>All Steps Done</Button>
                      )}
                      {i > 0 && <Button size="small" variant="outlined" onClick={() => setActiveStep(i - 1)}>Back</Button>}
                    </Box>
                  </StepContent>
                </Step>
              ))}
            </Stepper>
          </CardContent>
        </Card>
      ) : (
        <Alert severity="info" sx={{ mb: 3 }}>This test case has no steps defined.</Alert>
      )}

      {/* Result */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" fontWeight={700} mb={2}>Submit Result</Typography>
          <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
            {RESULT_BUTTONS.map(b => (
              <Button
                key={b.status}
                variant={result === b.status ? 'contained' : 'outlined'}
                startIcon={b.icon}
                onClick={() => setResult(b.status)}
                sx={{
                  borderColor: b.color, color: result === b.status ? '#fff' : b.color,
                  bgcolor: result === b.status ? b.color : 'transparent',
                  '&:hover': { bgcolor: `${b.color}22`, borderColor: b.color },
                }}
              >
                {b.label}
              </Button>
            ))}
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField label="Device Info" value={deviceInfo} onChange={e => setDeviceInfo(e.target.value)} fullWidth size="small" placeholder="Samsung Galaxy S24, Android 14" />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Notes / Observations" value={notes} onChange={e => setNotes(e.target.value)} fullWidth multiline rows={3} size="small" placeholder="Describe what you observed…" />
            </Grid>
          </Grid>

          {result === 'fail' && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Submitting FAIL will prompt you to report a bug. You can report it from the Bugs page.
            </Alert>
          )}
        </CardContent>
      </Card>

      <Box display="flex" justifyContent="flex-end" gap={2}>
        <Button variant="outlined" onClick={() => navigate(-1)}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!result || submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
          color={result === 'pass' ? 'success' : result === 'fail' ? 'error' : 'primary'}
        >
          {submitMutation.isPending ? 'Saving…' : 'Submit Result'}
        </Button>
      </Box>
    </Box>
  );
}
