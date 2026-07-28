import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, TextField, Select, MenuItem, FormControl, InputLabel,
  InputAdornment, Typography, Chip, Avatar, Tooltip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress,
  Grid, Checkbox, FormControlLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BugReportIcon from '@mui/icons-material/BugReport';
import { bugService } from '@/services/bugService';
import { projectService } from '@/services/projectService';
import { releaseService } from '@/services/releaseService';
import { moduleService } from '@/services/moduleService';
import { userService } from '@/services/userService';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { SeverityChip } from '@/components/common/SeverityChip';
import { StatusChip } from '@/components/common/StatusChip';
import { useAuth } from '@/hooks/useAuth';
import { toastSuccess, toastError } from '@/lib/errors';
import { formatDate, timeAgo } from '@/lib/utils';
import type { Bug, BugSeverity, BugPriority, BugStatus } from '@/types';

const SEVERITIES: BugSeverity[] = ['critical','high','medium','low'];
const PRIORITIES: BugPriority[] = ['p1','p2','p3','p4'];
const STATUSES: BugStatus[] = ['new','triaged','assigned','in_progress','ready_for_qa','verified','closed','rejected','duplicate'];
const ENVIRONMENTS = ['Production', 'Staging', 'QA', 'Development', 'UAT'];

function CreateBugDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    project_id: '', release_id: '', module_id: '', title: '', description: '',
    severity: 'high' as BugSeverity, priority: 'p2' as BugPriority,
    environment: 'QA', device: '', os_version: '', app_version: '', build_number: '',
    steps_to_reproduce: '', expected_result: '', actual_result: '',
    assigned_to: '', is_regression: false, tags: '',
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | { value: unknown }>) =>
    setForm(f => ({ ...f, [k]: (e.target as HTMLInputElement).value }));

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectService.list() });
  const { data: releases = [] } = useQuery({
    queryKey: ['releases', form.project_id], queryFn: () => releaseService.list(form.project_id),
    enabled: !!form.project_id,
  });
  const { data: modules = [] } = useQuery({
    queryKey: ['modules', form.project_id], queryFn: () => moduleService.list(form.project_id),
    enabled: !!form.project_id,
  });
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: userService.list });

  const { mutate, isPending } = useMutation({
    mutationFn: () => bugService.create({
      project_id: form.project_id, release_id: form.release_id || null,
      module_id: form.module_id || null, title: form.title, description: form.description,
      severity: form.severity, priority: form.priority, environment: form.environment,
      device: form.device || null, os_version: form.os_version || null,
      app_version: form.app_version || null, build_number: form.build_number || null,
      steps_to_reproduce: form.steps_to_reproduce || null,
      expected_result: form.expected_result || null, actual_result: form.actual_result || null,
      assigned_to: form.assigned_to || null, reported_by: profile!.id,
      status: 'new', is_regression: form.is_regression,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bugs'] });
      toastSuccess('Bug reported');
      onClose();
    },
    onError: err => toastError(err),
  });

  const valid = form.project_id && form.title.trim() && form.description.trim();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle>Report Bug</DialogTitle>
      <DialogContent dividers>
        <Box display="flex" flexDirection="column" gap={2}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Project</InputLabel>
                <Select label="Project" value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value, release_id: '', module_id: '' }))}>
                  {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Release</InputLabel>
                <Select label="Release" value={form.release_id} onChange={e => setForm(f => ({ ...f, release_id: e.target.value }))} disabled={!form.project_id}>
                  <MenuItem value="">None</MenuItem>
                  {releases.map(r => <MenuItem key={r.id} value={r.id}>{r.name} v{r.version}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Module</InputLabel>
                <Select label="Module" value={form.module_id} onChange={e => setForm(f => ({ ...f, module_id: e.target.value }))} disabled={!form.project_id}>
                  <MenuItem value="">None</MenuItem>
                  {modules.map(m => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Assign To</InputLabel>
                <Select label="Assign To" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                  <MenuItem value="">Unassigned</MenuItem>
                  {users.map(u => <MenuItem key={u.id} value={u.id}>{u.full_name ?? u.email}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <TextField label="Bug Title *" value={form.title} onChange={set('title')} fullWidth />
          <TextField label="Description *" value={form.description} onChange={set('description')} fullWidth multiline rows={3} placeholder="Describe the bug in detail…" />

          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <FormControl fullWidth>
                <InputLabel>Severity *</InputLabel>
                <Select label="Severity *" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value as BugSeverity }))}>
                  {SEVERITIES.map(s => <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControl fullWidth>
                <InputLabel>Priority *</InputLabel>
                <Select label="Priority *" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as BugPriority }))}>
                  {PRIORITIES.map(p => <MenuItem key={p} value={p}>{p.toUpperCase()}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Environment</InputLabel>
                <Select label="Environment" value={form.environment} onChange={e => setForm(f => ({ ...f, environment: e.target.value }))}>
                  {ENVIRONMENTS.map(e => <MenuItem key={e} value={e}>{e}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={6} sm={4}><TextField label="Device" value={form.device} onChange={set('device')} fullWidth placeholder="Pixel 7" /></Grid>
            <Grid item xs={6} sm={4}><TextField label="OS Version" value={form.os_version} onChange={set('os_version')} fullWidth placeholder="Android 14" /></Grid>
            <Grid item xs={12} sm={4}><TextField label="Build Number" value={form.build_number} onChange={set('build_number')} fullWidth /></Grid>
          </Grid>

          <TextField label="Steps to Reproduce" value={form.steps_to_reproduce} onChange={set('steps_to_reproduce')} fullWidth multiline rows={3} placeholder="1. Open app&#10;2. Navigate to...&#10;3. Observe..." />
          <TextField label="Expected Result" value={form.expected_result} onChange={set('expected_result')} fullWidth multiline rows={2} />
          <TextField label="Actual Result" value={form.actual_result} onChange={set('actual_result')} fullWidth multiline rows={2} />
          <TextField label="Tags (comma separated)" value={form.tags} onChange={set('tags')} fullWidth />
          <FormControlLabel
            control={<Checkbox checked={form.is_regression} onChange={e => setForm(f => ({ ...f, is_regression: e.target.checked }))} />}
            label="This is a regression (bug was previously fixed)"
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" onClick={() => mutate()} disabled={!valid || isPending}>
          {isPending ? <CircularProgress size={18} color="inherit" /> : 'Report Bug'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function BugsPage() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [filters, setFilters] = useState({ search: '', status: '', severity: '', priority: '' });

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectService.list() });
  const { data: bugs = [], isLoading } = useQuery({
    queryKey: ['bugs', projectId, filters],
    queryFn: () => bugService.list(projectId, {
      search: filters.search || undefined, status: filters.status || undefined,
      severity: filters.severity || undefined, priority: filters.priority || undefined,
    }),
    enabled: !!projectId,
  });

  return (
    <Box>
      <PageHeader
        title="Bug Tracker"
        subtitle="Track and manage all bugs across your projects."
        actions={
          <Button variant="contained" color="error" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            Report Bug
          </Button>
        }
      />

      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Project</InputLabel>
          <Select label="Project" value={projectId} onChange={e => setProjectId(e.target.value)}>
            <MenuItem value="">All Projects</MenuItem>
            {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField
          placeholder="Search bugs…" value={filters.search} size="small"
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} sx={{ flex: 1, minWidth: 160 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Severity</InputLabel>
          <Select label="Severity" value={filters.severity} onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}>
            <MenuItem value="">All</MenuItem>
            {SEVERITIES.map(s => <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Status</InputLabel>
          <Select label="Status" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <MenuItem value="">All</MenuItem>
            {STATUSES.map(s => <MenuItem key={s} value={s}><StatusChip status={s} /></MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {!projectId ? (
        <EmptyState icon={BugReportIcon} title="Select a project" description="Choose a project to view its bugs." />
      ) : !isLoading && bugs.length === 0 ? (
        <EmptyState icon={BugReportIcon} title="No bugs found" description="No bugs match the current filters."
          actionLabel="Report Bug" onAction={() => setCreateOpen(true)} />
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>ID</TableCell>
                <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>Title</TableCell>
                <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>Severity</TableCell>
                <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>Assignee</TableCell>
                <TableCell sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>Reported</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {bugs.map(bug => (
                <TableRow key={bug.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/bugs/${bug.id}`)}>
                  <TableCell>
                    <Typography variant="caption" fontFamily="monospace" fontWeight={700} color="primary.main">
                      {bug.bug_id}
                    </Typography>
                    {bug.is_regression && <Chip label="Regression" size="small" color="warning" sx={{ ml: 0.5, fontSize: '0.6rem', height: 16 }} />}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}
                      sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bug.title}
                    </Typography>
                    {bug.module && <Typography variant="caption" color="text.secondary">{bug.module.name}</Typography>}
                  </TableCell>
                  <TableCell><SeverityChip value={bug.severity} /></TableCell>
                  <TableCell><StatusChip status={bug.status} /></TableCell>
                  <TableCell>
                    {bug.assignee ? (
                      <Tooltip title={bug.assignee.full_name ?? bug.assignee.email}>
                        <Avatar sx={{ width: 24, height: 24, fontSize: 11, bgcolor: 'primary.main' }}>
                          {(bug.assignee.full_name ?? bug.assignee.email ?? '?')[0].toUpperCase()}
                        </Avatar>
                      </Tooltip>
                    ) : (
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">{timeAgo(bug.created_at)}</Typography>
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <IconButton size="small" onClick={() => navigate(`/bugs/${bug.id}`)}>
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CreateBugDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Box>
  );
}
