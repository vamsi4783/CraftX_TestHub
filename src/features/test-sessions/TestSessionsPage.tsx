import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Card, CardContent, Typography, Button, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, FormControl, InputLabel, Select,
  MenuItem, Table, TableBody, TableCell, TableHead, TableRow, Avatar,
  IconButton, Tooltip, LinearProgress, Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';
import VideoLabelIcon from '@mui/icons-material/VideoLabel';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { testSessionService } from '@/services/testSessionService';
import { testPlanService } from '@/services/testPlanService';
import { projectService } from '@/services/projectService';
import { releaseService } from '@/services/releaseService';
import { userService } from '@/services/userService';
import { useAuth } from '@/hooks/useAuth';
import { toastSuccess, toastError } from '@/lib/errors';
import type { TestSession, TestSessionStatus } from '@/types';

const STATUS_COLOR: Record<TestSessionStatus, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  pending: 'default', in_progress: 'info', paused: 'warning', completed: 'success', cancelled: 'error',
};

function CreateSessionDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [releaseId, setReleaseId] = useState('');
  const [planId, setPlanId] = useState(searchParams.get('plan') ?? '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<TestSessionStatus>('pending');

  const { data: releases = [] } = useQuery({
    queryKey: ['releases', projectId], queryFn: () => releaseService.list(projectId), enabled: !!projectId,
  });
  const { data: plans = [] } = useQuery({
    queryKey: ['test-plans', projectId], queryFn: () => testPlanService.list(projectId), enabled: !!projectId,
  });
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => userService.list() });

  // Fetch case count for the selected plan to validate before creating session
  const { data: planCases = [] } = useQuery({
    queryKey: ['plan-cases', planId],
    queryFn: () => testPlanService.getCases(planId),
    enabled: !!planId,
  });

  const planHasNoCases = !!planId && planCases.length === 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const session = await testSessionService.create({
        project_id: projectId, name, description: description || undefined,
        assigned_to: assignedTo, assigned_by: profile!.id,
        plan_id: planId || undefined, release_id: releaseId || undefined,
        start_date: startDate || undefined, end_date: endDate || undefined,
        status,
      });
      if (planId) {
        await testSessionService.addCasesFromPlan(session.id, planId);
      }
      return session;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-sessions'] });
      toastSuccess('Session created');
      onClose();
    },
    onError: e => toastError(e),
  });

  const testers = users.filter(u => ['qa_tester', 'developer', 'administrator'].includes(u.role));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create Test Session</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        <TextField label="Session Name *" value={name} onChange={e => setName(e.target.value)} fullWidth />
        <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} fullWidth multiline rows={2} />
        <FormControl fullWidth required>
          <InputLabel>Assign To *</InputLabel>
          <Select label="Assign To *" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
            {testers.map(u => <MenuItem key={u.id} value={u.id}>{u.full_name ?? u.email}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl fullWidth error={planHasNoCases}>
          <InputLabel>Test Plan (optional)</InputLabel>
          <Select label="Test Plan (optional)" value={planId} onChange={e => setPlanId(e.target.value)}>
            <MenuItem value="">— None —</MenuItem>
            {plans.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
          {planHasNoCases && (
            <Typography variant="caption" color="error" mt={0.5}>
              This test plan contains no test cases. Add at least one test case before creating a session.
            </Typography>
          )}
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>Release</InputLabel>
          <Select label="Release" value={releaseId} onChange={e => setReleaseId(e.target.value)}>
            <MenuItem value="">— None —</MenuItem>
            {releases.map(r => <MenuItem key={r.id} value={r.id}>{r.name} v{r.version}</MenuItem>)}
          </Select>
        </FormControl>
        <Stack direction="row" spacing={2}>
          <TextField label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
          <TextField label="End Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
        </Stack>
        <FormControl fullWidth>
          <InputLabel>Status</InputLabel>
          <Select label="Status" value={status} onChange={e => setStatus(e.target.value as TestSessionStatus)}>
            {(['pending', 'in_progress', 'paused', 'completed', 'cancelled'] as TestSessionStatus[]).map(s => (
              <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s.replace(/_/g, ' ')}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {planId && !planHasNoCases && (
          <Typography variant="caption" color="text.secondary">
            {planCases.length} test case{planCases.length !== 1 ? 's' : ''} from this plan will be automatically added to the session.
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!name.trim() || !assignedTo || planHasNoCases || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Creating…' : 'Create Session'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function TestSessionsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedProject = searchParams.get('project') ?? '';
  const setSelectedProject = (id: string) => setSearchParams(prev => { const p = new URLSearchParams(prev); id ? p.set('project', id) : p.delete('project'); return p; }, { replace: true });
  const [filterStatus, setFilterStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteSession, setDeleteSession] = useState<TestSession | null>(null);

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectService.list() });
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['test-sessions', selectedProject, filterStatus],
    queryFn: () => testSessionService.list({
      project_id: selectedProject || undefined,
      status: filterStatus || undefined,
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => testSessionService.delete(deleteSession!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-sessions'] });
      toastSuccess('Session deleted');
      setDeleteSession(null);
    },
    onError: e => toastError(e),
  });

  const canCreate = profile?.role === 'administrator' || profile?.role === 'developer';

  const visibleSessions = sessions.filter(s => {
    if (selectedProject && s.project_id !== selectedProject) return false;
    return true;
  });

  return (
    <Box>
      <PageHeader
        title="Test Sessions"
        subtitle="Assign and track testing sessions for testers."
        actions={
          canCreate && selectedProject ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
              New Session
            </Button>
          ) : undefined
        }
      />

      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Project</InputLabel>
          <Select label="Project" value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
            <MenuItem value="">— All Projects —</MenuItem>
            {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Status</InputLabel>
          <Select label="Status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <MenuItem value="">— All —</MenuItem>
            {(['pending', 'in_progress', 'paused', 'completed', 'cancelled'] as TestSessionStatus[]).map(s => (
              <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {isLoading ? (
        <LoadingState />
      ) : visibleSessions.length === 0 ? (
        <EmptyState
          icon={<VideoLabelIcon sx={{ fontSize: 56 }} />}
          title="No sessions found"
          description="Create a test session to assign test cases to testers."
          action={canCreate && selectedProject ? <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>Create Session</Button> : undefined}
        />
      ) : (
        <Card>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Session</TableCell>
                <TableCell>Assignee</TableCell>
                <TableCell>Release</TableCell>
                <TableCell>Progress</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Dates</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleSessions.map(session => (
                <TableRow key={session.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{session.name}</Typography>
                    {session.project && (
                      <Typography variant="caption" color="text.secondary">{session.project.name}</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: 'primary.main' }}>
                        {(session.assignee?.full_name ?? '?')[0]}
                      </Avatar>
                      <Typography variant="caption">{session.assignee?.full_name ?? '—'}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {session.release ? `${session.release.name} v${session.release.version}` : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ minWidth: 140 }}>
                    <Box>
                      <Box display="flex" justifyContent="space-between" mb={0.5}>
                        <Typography variant="caption">{session.passed_cases + session.failed_cases + session.blocked_cases + session.skipped_cases}/{session.total_cases}</Typography>
                        <Typography variant="caption">{session.progress_pct}%</Typography>
                      </Box>
                      <LinearProgress variant="determinate" value={session.progress_pct} sx={{ height: 6, borderRadius: 3 }} color={session.failed_cases > 0 ? 'error' : 'success'} />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={session.status.replace(/_/g, ' ')} size="small" color={STATUS_COLOR[session.status]} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {session.start_date ? new Date(session.start_date).toLocaleDateString() : '—'}
                      {session.end_date ? ` → ${new Date(session.end_date).toLocaleDateString()}` : ''}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="View Session">
                      <IconButton size="small" onClick={() => navigate(`/test-sessions/${session.id}`)}>
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {(session.status === 'pending' || session.status === 'paused') && (
                      <Tooltip title="Execute">
                        <IconButton size="small" color="primary" onClick={() => navigate(`/test-sessions/${session.id}/execute`)}>
                          <PlayArrowIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {canCreate && (
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => setDeleteSession(session)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {createOpen && selectedProject && (
        <CreateSessionDialog open={createOpen} onClose={() => setCreateOpen(false)} projectId={selectedProject} />
      )}

      <ConfirmDialog
        open={!!deleteSession}
        title="Delete Session"
        message={`Delete session "${deleteSession?.name}"? All execution data for this session will be lost.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setDeleteSession(null)}
      />
    </Box>
  );
}
