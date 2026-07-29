import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Card, CardContent, Typography, Button, Chip, Avatar, Grid, Divider,
  Table, TableBody, TableCell, TableHead, TableRow, LinearProgress, Stack,
  IconButton, Tooltip, Alert, FormControl, Select, MenuItem,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import RemoveIcon from '@mui/icons-material/Remove';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingState } from '@/components/common/LoadingState';
import { testSessionService } from '@/services/testSessionService';
import { useAuth } from '@/hooks/useAuth';
import { toastSuccess, toastError } from '@/lib/errors';
import type { TestSessionStatus } from '@/types';

const STEP_STATUS_COLOR: Record<string, string> = {
  pending: '#9CA3AF', in_progress: '#3B82F6', pass: '#10B981',
  fail: '#EF4444', blocked: '#F59E0B', skipped: '#6B7280', not_tested: '#9CA3AF',
};

const STATUS_COLOR: Record<TestSessionStatus, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  pending: 'default', in_progress: 'info', paused: 'warning', completed: 'success', cancelled: 'error',
};

function StatusBadge({ status }: { status: string }) {
  const color = STEP_STATUS_COLOR[status] ?? '#9CA3AF';
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5,
      px: 1, py: 0.25, borderRadius: 1, bgcolor: `${color}22`, border: `1px solid ${color}55` }}>
      {status === 'pass' && <CheckIcon sx={{ fontSize: 12, color }} />}
      {status === 'fail' && <CloseIcon sx={{ fontSize: 12, color }} />}
      {status === 'blocked' && <RemoveIcon sx={{ fontSize: 12, color }} />}
      <Typography variant="caption" fontWeight={700} sx={{ color }}>{status.replace(/_/g, ' ')}</Typography>
    </Box>
  );
}

export function TestSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const qc = useQueryClient();

  const { data: session, isLoading } = useQuery({
    queryKey: ['test-session', id],
    queryFn: () => testSessionService.get(id!),
    enabled: !!id,
    refetchInterval: 10000,
  });

  const startMutation = useMutation({
    mutationFn: () => testSessionService.start(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-session', id] });
      toastSuccess('Session started');
      navigate(`/test-sessions/${id}/execute`);
    },
    onError: e => toastError(e),
  });

  const pauseMutation = useMutation({
    mutationFn: () => testSessionService.pause(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-session', id] });
      toastSuccess('Session paused');
    },
    onError: e => toastError(e),
  });

  const completeMutation = useMutation({
    mutationFn: () => testSessionService.complete(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-session', id] });
      toastSuccess('Session marked as completed');
    },
    onError: e => toastError(e),
  });

  const statusMutation = useMutation({
    mutationFn: (status: TestSessionStatus) => testSessionService.update(id!, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-session', id] });
      qc.invalidateQueries({ queryKey: ['test-sessions'] });
      toastSuccess('Status updated');
    },
    onError: e => toastError(e),
  });

  if (isLoading || !session) return <LoadingState />;

  const isAssignee = profile?.id === session.assigned_to;
  const canControl = isAssignee || profile?.role === 'administrator';
  const done = session.passed_cases + session.failed_cases + session.blocked_cases + session.skipped_cases;

  return (
    <Box>
      <PageHeader
        title={session.name}
        subtitle={`Test Session · ${session.project?.name ?? ''}`}
        breadcrumbs={[{ label: 'Test Sessions', to: '/test-sessions' }, { label: session.name }]}
        showBack
        actions={
          <Stack direction="row" spacing={1}>
            {session.status === 'pending' && canControl && (
              <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
                Start Session
              </Button>
            )}
            {session.status === 'in_progress' && canControl && (
              <>
                <Button variant="outlined" startIcon={<PlayArrowIcon />} onClick={() => navigate(`/test-sessions/${id}/execute`)}>
                  Resume Execution
                </Button>
                <Button variant="outlined" startIcon={<PauseIcon />} onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>
                  Pause
                </Button>
                <Button variant="outlined" color="success" startIcon={<CheckCircleIcon />} onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
                  Mark Complete
                </Button>
              </>
            )}
            {session.status === 'paused' && canControl && (
              <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={() => navigate(`/test-sessions/${id}/execute`)}>
                Resume
              </Button>
            )}
          </Stack>
        }
      />

      <Grid container spacing={3} mb={3}>
        {/* Session info */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={2} color="text.secondary">SESSION INFO</Typography>
              <Stack spacing={1.5}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="text.secondary">Status</Typography>
                  <Select
                    size="small"
                    value={session.status}
                    onChange={e => statusMutation.mutate(e.target.value as TestSessionStatus)}
                    disabled={statusMutation.isPending}
                    sx={{ minWidth: 130, height: 28, fontSize: 13 }}
                  >
                    {(['pending', 'in_progress', 'paused', 'completed', 'cancelled'] as TestSessionStatus[]).map(s => (
                      <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize', fontSize: 13 }}>
                        {s.replace(/_/g, ' ')}
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
                <Divider />
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="text.secondary">Assignee</Typography>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Avatar sx={{ width: 24, height: 24, fontSize: 11, bgcolor: 'primary.main' }}>
                      {(session.assignee?.full_name ?? '?')[0]}
                    </Avatar>
                    <Typography variant="body2">{session.assignee?.full_name ?? '—'}</Typography>
                  </Box>
                </Box>
                <Divider />
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Release</Typography>
                  <Typography variant="body2">
                    {session.release ? `${session.release.name} v${session.release.version}` : '—'}
                  </Typography>
                </Box>
                {session.start_date && (
                  <>
                    <Divider />
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Start Date</Typography>
                      <Typography variant="body2">{new Date(session.start_date).toLocaleDateString()}</Typography>
                    </Box>
                  </>
                )}
                {session.end_date && (
                  <>
                    <Divider />
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">End Date</Typography>
                      <Typography variant="body2">{new Date(session.end_date).toLocaleDateString()}</Typography>
                    </Box>
                  </>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Progress */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={2} color="text.secondary">PROGRESS</Typography>
              <Box mb={2}>
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                  <Typography variant="body2">{done} of {session.total_cases} cases done</Typography>
                  <Typography variant="body2" fontWeight={700}>{session.progress_pct}%</Typography>
                </Box>
                <LinearProgress variant="determinate" value={session.progress_pct} sx={{ height: 12, borderRadius: 6 }} color={session.failed_cases > 0 ? 'error' : 'success'} />
              </Box>
              <Grid container spacing={2}>
                {[
                  { label: 'Passed', value: session.passed_cases, color: '#10B981' },
                  { label: 'Failed', value: session.failed_cases, color: '#EF4444' },
                  { label: 'Blocked', value: session.blocked_cases, color: '#F59E0B' },
                  { label: 'Skipped', value: session.skipped_cases, color: '#6B7280' },
                  { label: 'Pending', value: session.total_cases - done, color: '#9CA3AF' },
                ].map(m => (
                  <Grid item xs key={m.label}>
                    <Box textAlign="center" sx={{ p: 1.5, borderRadius: 2, bgcolor: `${m.color}15`, border: `1px solid ${m.color}33` }}>
                      <Typography variant="h5" fontWeight={800} sx={{ color: m.color }}>{m.value}</Typography>
                      <Typography variant="caption" color="text.secondary">{m.label}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Test Cases Table */}
      <Card>
        <CardContent sx={{ pb: '12px !important' }}>
          <Typography variant="subtitle2" fontWeight={700} mb={2}>Test Cases ({session.cases?.length ?? 0})</Typography>
        </CardContent>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Test ID</TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Module</TableCell>
              <TableCell>Priority</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(session.cases ?? []).map((sc, i) => (
              <TableRow key={sc.id} hover>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">{i + 1}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" fontFamily="monospace" color="primary.main">
                    {sc.test_case?.test_id ?? '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{sc.test_case?.title ?? '—'}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">{sc.test_case?.module?.name ?? '—'}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption">{sc.test_case?.priority ?? '—'}</Typography>
                </TableCell>
                <TableCell>
                  <StatusBadge status={sc.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {session.status === 'pending' && canControl && (
          <Box p={2} display="flex" justifyContent="center">
            <Alert severity="info" sx={{ maxWidth: 500 }}>
              Session is pending. Click <strong>Start Session</strong> to begin executing test cases.
            </Alert>
          </Box>
        )}
      </Card>
    </Box>
  );
}
