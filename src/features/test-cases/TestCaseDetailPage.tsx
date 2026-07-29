import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Card, CardContent, Chip, Divider, Grid, IconButton, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
  Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  InputLabel, MenuItem, Select, CircularProgress, Alert,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingState } from '@/components/common/LoadingState';
import { StatusChip } from '@/components/common/StatusChip';
import { SeverityChip } from '@/components/common/SeverityChip';
import { testCaseService } from '@/services/testCaseService';
import { moduleService } from '@/services/moduleService';
import { toastSuccess, toastError } from '@/lib/errors';
import { useAuth } from '@/hooks/useAuth';
import type { TcPriority, TcStatus, TcExecutionMode, TestCaseStep } from '@/types';

const PRIORITY_COLOR: Record<TcPriority, 'error' | 'warning' | 'info' | 'success'> = {
  critical: 'error', high: 'warning', medium: 'info', low: 'success',
};

// ── Edit Test Case Dialog ─────────────────────────────────────────────────────

function EditTestCaseDialog({ open, onClose, tc }: {
  open: boolean;
  onClose: () => void;
  tc: NonNullable<ReturnType<typeof useQuery<Awaited<ReturnType<typeof testCaseService.get>>>>['data']>;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: tc.title,
    description: tc.description ?? '',
    preconditions: tc.preconditions ?? '',
    priority: tc.priority,
    status: tc.status,
    estimated_minutes: tc.estimated_minutes,
    execution_mode: (tc.execution_mode ?? 'quick') as TcExecutionMode,
  });

  const { data: modules = [] } = useQuery({
    queryKey: ['modules', tc.project_id],
    queryFn: () => moduleService.list(tc.project_id),
  });

  const [moduleId, setModuleId] = useState(tc.module_id ?? '');

  const mutation = useMutation({
    mutationFn: () => testCaseService.update(tc.id, {
      title: form.title,
      description: form.description || null,
      preconditions: form.preconditions || null,
      priority: form.priority,
      status: form.status,
      estimated_minutes: form.estimated_minutes,
      module_id: moduleId || null,
      execution_mode: form.execution_mode,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-case', tc.id] });
      toastSuccess('Test case updated');
      onClose();
    },
    onError: err => toastError(err),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Test Case</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} pt={1}>
          <TextField label="Title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} fullWidth />
          <FormControl fullWidth>
            <InputLabel>Module</InputLabel>
            <Select label="Module" value={moduleId} onChange={e => setModuleId(e.target.value)}>
              <MenuItem value="">— None —</MenuItem>
              {modules.map(m => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
            </Select>
          </FormControl>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Priority</InputLabel>
                <Select label="Priority" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as TcPriority }))}>
                  {(['critical','high','medium','low'] as TcPriority[]).map(p => <MenuItem key={p} value={p} sx={{ textTransform:'capitalize' }}>{p}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select label="Status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as TcStatus }))}>
                  {(['draft','active','deprecated'] as TcStatus[]).map(s => <MenuItem key={s} value={s} sx={{ textTransform:'capitalize' }}>{s}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <TextField label="Est. Minutes" type="number" value={form.estimated_minutes}
                onChange={e => setForm(f => ({ ...f, estimated_minutes: +e.target.value }))} fullWidth />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Execution Mode</InputLabel>
                <Select label="Execution Mode" value={form.execution_mode} onChange={e => setForm(f => ({ ...f, execution_mode: e.target.value as TcExecutionMode }))}>
                  <MenuItem value="quick">⚡ Quick — direct Pass/Fail, no steps required</MenuItem>
                  <MenuItem value="detailed">📋 Detailed — step-by-step execution</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <TextField label="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} fullWidth multiline rows={2} />
          <TextField label="Preconditions" value={form.preconditions} onChange={e => setForm(f => ({ ...f, preconditions: e.target.value }))} fullWidth multiline rows={2} />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!form.title.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? <CircularProgress size={18} color="inherit" /> : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Edit Steps Dialog ─────────────────────────────────────────────────────────

function EditStepsDialog({ open, onClose, tc, existingSteps }: {
  open: boolean;
  onClose: () => void;
  tc: { id: string };
  existingSteps: TestCaseStep[];
}) {
  const qc = useQueryClient();
  type DraftStep = { description: string; expected_result: string; notes: string };
  const [steps, setSteps] = useState<DraftStep[]>(
    existingSteps.length > 0
      ? existingSteps.map(s => ({ description: s.description, expected_result: s.expected_result, notes: s.notes ?? '' }))
      : [{ description: '', expected_result: '', notes: '' }]
  );

  const mutation = useMutation({
    mutationFn: () => testCaseService.saveSteps(tc.id, steps.filter(s => s.description.trim()).map((s, i) => ({
      test_case_id: tc.id, step_number: i + 1,
      description: s.description, expected_result: s.expected_result, notes: s.notes || null,
    } as Omit<TestCaseStep, 'id' | 'created_at' | 'updated_at'>))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-case', tc.id] });
      toastSuccess('Steps saved');
      onClose();
    },
    onError: err => toastError(err),
  });

  const addStep = () => setSteps(s => [...s, { description: '', expected_result: '', notes: '' }]);
  const removeStep = (i: number) => setSteps(s => s.filter((_, idx) => idx !== i));
  const updateStep = (i: number, field: keyof DraftStep, val: string) =>
    setSteps(s => s.map((step, idx) => idx === i ? { ...step, [field]: val } : step));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Edit Test Steps</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} pt={1}>
          {steps.map((step, i) => (
            <Card key={i} variant="outlined">
              <CardContent sx={{ pb: '12px !important' }}>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                  <Typography variant="subtitle2" fontWeight={700} color="primary.main">Step {i + 1}</Typography>
                  <IconButton size="small" color="error" onClick={() => removeStep(i)} disabled={steps.length === 1}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Box display="flex" flexDirection="column" gap={1.5}>
                  <TextField label="Action *" value={step.description} onChange={e => updateStep(i, 'description', e.target.value)}
                    fullWidth size="small" placeholder="What should the tester do?" />
                  <TextField label="Expected Result *" value={step.expected_result} onChange={e => updateStep(i, 'expected_result', e.target.value)}
                    fullWidth size="small" placeholder="What should happen after this step?" />
                  <TextField label="Notes (optional)" value={step.notes} onChange={e => updateStep(i, 'notes', e.target.value)}
                    fullWidth size="small" />
                </Box>
              </CardContent>
            </Card>
          ))}
          <Button startIcon={<AddIcon />} onClick={addStep} variant="outlined" sx={{ alignSelf: 'flex-start' }}>
            Add Step
          </Button>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Saving…' : 'Save Steps'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function TestCaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);

  const { data: tc, isLoading, isError } = useQuery({
    queryKey: ['test-case', id],
    queryFn: () => testCaseService.get(id!),
    enabled: !!id,
  });

  const canManage = profile?.role === 'administrator' || profile?.role === 'developer';

  if (isLoading) return <LoadingState />;
  if (isError || !tc) {
    return (
      <Box p={4}>
        <Alert severity="error">Test case not found or failed to load.</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/test-cases')} sx={{ mt: 2 }}>
          Back to Test Cases
        </Button>
      </Box>
    );
  }

  const steps = tc.steps ?? [];
  const estHours = Math.floor(tc.estimated_minutes / 60);
  const estMins = tc.estimated_minutes % 60;
  const estLabel = estHours > 0 ? `${estHours}h ${estMins}m` : `${estMins}m`;

  return (
    <Box>
      <PageHeader
        title={tc.title}
        subtitle={tc.test_id}
        breadcrumbs={[
          { label: 'Test Cases', to: '/test-cases' },
          { label: tc.test_id },
        ]}
        showBack
        actions={
          canManage ? (
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={() => setEditOpen(true)}>
                Edit
              </Button>
              <Button variant="contained" size="small" startIcon={<EditIcon />} onClick={() => setStepsOpen(true)}>
                Edit Steps
              </Button>
            </Stack>
          ) : undefined
        }
      />

      <Grid container spacing={3}>
        {/* Left: Details */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} color="text.secondary" mb={2}>DETAILS</Typography>
              <Stack spacing={1.5} divider={<Divider />}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">Status</Typography>
                  <StatusChip status={tc.status} />
                </Box>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">Priority</Typography>
                  <Chip label={tc.priority} size="small" color={PRIORITY_COLOR[tc.priority]} sx={{ textTransform: 'capitalize' }} />
                </Box>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">Module</Typography>
                  <Typography variant="caption" fontWeight={500}>{tc.module?.name ?? '—'}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">Est. Time</Typography>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <AccessTimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    <Typography variant="caption">{estLabel}</Typography>
                  </Box>
                </Box>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">Execution Mode</Typography>
                  <Chip
                    label={(tc.execution_mode ?? 'quick') === 'quick' ? '⚡ Quick' : '📋 Detailed'}
                    size="small"
                    color={(tc.execution_mode ?? 'quick') === 'quick' ? 'default' : 'info'}
                    variant="outlined"
                  />
                </Box>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">Automation</Typography>
                  {tc.is_automation_ready
                    ? <Chip label="Ready" size="small" color="success" icon={<CheckCircleIcon />} />
                    : <Chip label="Manual" size="small" />}
                </Box>
                {tc.creator && (
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" color="text.secondary">Created by</Typography>
                    <Typography variant="caption">{tc.creator.full_name ?? tc.creator.email}</Typography>
                  </Box>
                )}
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">Created</Typography>
                  <Typography variant="caption">{new Date(tc.created_at).toLocaleDateString()}</Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* Tags */}
          {tc.tags?.length > 0 && (
            <Card sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} color="text.secondary" mb={1.5}>TAGS</Typography>
                <Box display="flex" flexWrap="wrap" gap={0.5}>
                  {tc.tags.map(tag => <Chip key={tag} label={tag} size="small" variant="outlined" />)}
                </Box>
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* Right: Description + Steps */}
        <Grid item xs={12} md={8}>
          {/* Description */}
          {(tc.description || tc.preconditions) && (
            <Card sx={{ mb: 2 }}>
              <CardContent>
                {tc.description && (
                  <>
                    <Typography variant="subtitle2" fontWeight={700} color="text.secondary" mb={1}>DESCRIPTION</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{tc.description}</Typography>
                  </>
                )}
                {tc.preconditions && (
                  <>
                    {tc.description && <Divider sx={{ my: 2 }} />}
                    <Typography variant="subtitle2" fontWeight={700} color="text.secondary" mb={1}>PRECONDITIONS</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{tc.preconditions}</Typography>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Steps */}
          <Card>
            <CardContent sx={{ pb: steps.length > 0 ? '0 !important' : undefined }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={steps.length > 0 ? 0 : 1}>
                <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
                  TEST STEPS ({steps.length})
                </Typography>
                {canManage && (
                  <Button size="small" startIcon={steps.length > 0 ? <EditIcon /> : <AddIcon />} onClick={() => setStepsOpen(true)}>
                    {steps.length > 0 ? 'Edit Steps' : 'Add Steps'}
                  </Button>
                )}
              </Box>
            </CardContent>

            {steps.length === 0 ? (
              <CardContent>
                <Box textAlign="center" py={3}>
                  <AssignmentIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">No steps defined yet.</Typography>
                  {canManage && (
                    <Button size="small" startIcon={<AddIcon />} onClick={() => setStepsOpen(true)} sx={{ mt: 1 }}>
                      Add Steps
                    </Button>
                  )}
                </Box>
              </CardContent>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 48 }}>#</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Expected Result</TableCell>
                    <TableCell>Notes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {steps.map(step => (
                    <TableRow key={step.id} sx={{ verticalAlign: 'top' }}>
                      <TableCell>
                        <Box sx={{
                          width: 24, height: 24, borderRadius: '50%',
                          bgcolor: 'primary.main', color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700,
                        }}>
                          {step.step_number}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{step.description}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="success.main" sx={{ whiteSpace: 'pre-wrap' }}>
                          {step.expected_result}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">{step.notes ?? '—'}</Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </Grid>
      </Grid>

      {/* Dialogs */}
      {editOpen && (
        <EditTestCaseDialog open={editOpen} onClose={() => setEditOpen(false)} tc={tc} />
      )}
      {stepsOpen && (
        <EditStepsDialog open={stepsOpen} onClose={() => setStepsOpen(false)} tc={tc} existingSteps={steps} />
      )}
    </Box>
  );
}
