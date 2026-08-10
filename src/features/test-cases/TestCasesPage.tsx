import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Typography, Button, Chip, TextField, Select, MenuItem, FormControl,
  InputLabel, InputAdornment, Skeleton, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, Grid, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SearchIcon from '@mui/icons-material/Search';
import AssignmentIcon from '@mui/icons-material/Assignment';
import { JsonImportDialog } from './JsonImportDialog';
import { testCaseService } from '@/services/testCaseService';
import { projectService } from '@/services/projectService';
import { moduleService } from '@/services/moduleService';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusChip } from '@/components/common/StatusChip';
import { SeverityChip } from '@/components/common/SeverityChip';
import { EmptyState } from '@/components/common/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { toastError } from '@/lib/errors';
import type { TcPriority, TcStatus } from '@/types';

function CreateTestCaseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ project_id: '', module_id: '', title: '', description: '', priority: 'medium' as TcPriority, estimated_minutes: 15, preconditions: '', tags: '' });
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectService.list() });
  const { data: modules = [] } = useQuery({ queryKey: ['modules', form.project_id], queryFn: () => moduleService.list(form.project_id), enabled: !!form.project_id });

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      if (!profile) throw new Error('Not authenticated');
      return testCaseService.create({ ...form, module_id: form.module_id || undefined, created_by: profile.id, status: 'draft', tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['test-cases'] }); onClose(); setForm({ project_id:'',module_id:'',title:'',description:'',priority:'medium',estimated_minutes:15,preconditions:'',tags:'' }); },
    onError: err => toastError(err),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create Test Case</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} pt={1}>
          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>Project *</InputLabel>
              <Select label="Project *" value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value, module_id: '' }))}>
                {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>Module</InputLabel>
              <Select label="Module" value={form.module_id} onChange={e => setForm(f => ({ ...f, module_id: e.target.value }))}>
                <MenuItem value="">— None —</MenuItem>
                {modules.map(m => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}><TextField label="Title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} fullWidth /></Grid>
          <Grid item xs={12}><TextField label="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} fullWidth multiline rows={2} /></Grid>
          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>Priority</InputLabel>
              <Select label="Priority" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as TcPriority }))}>
                {(['critical','high','medium','low'] as TcPriority[]).map(p => <MenuItem key={p} value={p} sx={{ textTransform:'capitalize' }}>{p}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6}><TextField label="Est. Minutes" type="number" value={form.estimated_minutes} onChange={e => setForm(f => ({ ...f, estimated_minutes: +e.target.value }))} fullWidth /></Grid>
          <Grid item xs={12}><TextField label="Preconditions" value={form.preconditions} onChange={e => setForm(f => ({ ...f, preconditions: e.target.value }))} fullWidth multiline rows={2} /></Grid>
          <Grid item xs={12}><TextField label="Tags (comma separated)" placeholder="e.g. smoke, login, critical-path" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} fullWidth /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => mutate()} disabled={!form.project_id || !form.title || isPending || !profile}>
          {isPending ? <CircularProgress size={18} color="inherit" /> : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function TestCasesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const filterProject = searchParams.get('project') ?? '';
  const setFilterProject = (id: string) => setSearchParams(prev => { const p = new URLSearchParams(prev); id ? p.set('project', id) : p.delete('project'); return p; }, { replace: true });
  const [filterStatus, setFilterStatus] = useState('');
  const [createOpen, setCreateOpen]       = useState(false);
  const [jsonImportOpen, setJsonImportOpen] = useState(false);
  const qc = useQueryClient();

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectService.list() });
  const { data: testCases = [], isLoading } = useQuery({
    queryKey: ['test-cases', filterProject, filterStatus, search],
    queryFn: () => testCaseService.list(filterProject || '%', { status: filterStatus || undefined, search: search || undefined }),
  });

  return (
    <Box>
      <PageHeader
        title="Test Cases"
        subtitle="Manage your test case library across all projects."
        actions={
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setJsonImportOpen(true)}>
              Import JSON
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
              New Test Case
            </Button>
          </Stack>
        }
      />

      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <TextField size="small" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} sx={{ width: 220 }} />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Project</InputLabel>
          <Select label="Project" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
            <MenuItem value="">All Projects</MenuItem>
            {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Status</InputLabel>
          <Select label="Status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {(['draft','active','deprecated'] as TcStatus[]).map(s => <MenuItem key={s} value={s} sx={{ textTransform:'capitalize' }}>{s}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {isLoading ? (
        <Box display="flex" flexDirection="column" gap={1}>{[1,2,3,4,5].map(i => <Skeleton key={i} variant="rounded" height={52} />)}</Box>
      ) : testCases.length === 0 ? (
        <EmptyState icon={AssignmentIcon} title="No test cases" description="Create your first test case to get started." actionLabel="New Test Case" onAction={() => setCreateOpen(true)} />
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Title</TableCell>
                <TableCell>Module</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Est. Time</TableCell>
                <TableCell>Automation</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {testCases.map(tc => (
                <TableRow key={tc.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/test-cases/${tc.id}`)}>
                  <TableCell><Typography variant="caption" fontWeight={700} color="text.disabled">{tc.test_id}</Typography></TableCell>
                  <TableCell><Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: 300 }}>{tc.title}</Typography></TableCell>
                  <TableCell><Typography variant="caption">{tc.module?.name ?? '—'}</Typography></TableCell>
                  <TableCell><SeverityChip value={tc.priority} /></TableCell>
                  <TableCell><StatusChip status={tc.status} /></TableCell>
                  <TableCell><Typography variant="caption">{tc.estimated_minutes}m</Typography></TableCell>
                  <TableCell>{tc.is_automation_ready ? <Chip label="Ready" size="small" color="success" /> : <Chip label="Manual" size="small" />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CreateTestCaseDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <JsonImportDialog
        open={jsonImportOpen}
        onClose={() => setJsonImportOpen(false)}
        onImported={({ imported }) => {
          setJsonImportOpen(false);
          if (imported > 0) qc.invalidateQueries({ queryKey: ['test-cases'] });
        }}
      />
    </Box>
  );
}
