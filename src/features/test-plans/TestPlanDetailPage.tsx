import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControl,
  Grid, IconButton, InputAdornment, InputLabel, LinearProgress,
  MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CategoryIcon from '@mui/icons-material/Category';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { StatusChip } from '@/components/common/StatusChip';
import { testPlanService } from '@/services/testPlanService';
import { testCaseService } from '@/services/testCaseService';
import { toastSuccess, toastError } from '@/lib/errors';
import { useAuth } from '@/hooks/useAuth';
import type { TestCase, TestPlanCase } from '@/types';

const PRIORITY_COLOR: Record<string, 'default' | 'error' | 'warning' | 'info' | 'success'> = {
  critical: 'error', high: 'warning', medium: 'info', low: 'success',
};

// ── Add Cases Dialog ────────────────────────────────────────────────────────

function AddCasesDialog({
  open, onClose, planId, projectId, alreadyLinked,
}: {
  open: boolean;
  onClose: () => void;
  planId: string;
  projectId: string;
  alreadyLinked: Set<string>;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: allCases = [], isLoading } = useQuery({
    queryKey: ['test-cases', projectId, 'active'],
    queryFn: () => testCaseService.list(projectId, { status: 'active' }),
    enabled: open && !!projectId,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allCases.filter(tc =>
      !alreadyLinked.has(tc.id) &&
      (!priorityFilter || tc.priority === priorityFilter) &&
      (tc.title.toLowerCase().includes(q) ||
        tc.test_id.toLowerCase().includes(q) ||
        tc.module?.name?.toLowerCase().includes(q))
    );
  }, [allCases, search, priorityFilter, alreadyLinked]);

  const mutation = useMutation({
    mutationFn: () => testPlanService.addCases(planId, [...selected]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-plan', planId] });
      qc.invalidateQueries({ queryKey: ['plan-cases', planId] });
      toastSuccess(`${selected.size} test case${selected.size !== 1 ? 's' : ''} added`);
      setSelected(new Set());
      setSearch('');
      onClose();
    },
    onError: e => toastError(e),
  });

  function toggleCase(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every(tc => selected.has(tc.id));
  const someFilteredSelected = filtered.some(tc => selected.has(tc.id)) && !allFilteredSelected;

  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach(tc => next.delete(tc.id));
      } else {
        filtered.forEach(tc => next.add(tc.id));
      }
      return next;
    });
  }

  function handleClose() {
    setSelected(new Set());
    setSearch('');
    setPriorityFilter('');
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Add Test Cases</DialogTitle>
      <DialogContent>
        <Box display="flex" gap={1} mb={2} mt={1}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search by ID, title, or module…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Priority</InputLabel>
            <Select label="Priority" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="critical">Critical</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="low">Low</MenuItem>
            </Select>
          </FormControl>
        </Box>
        {isLoading ? (
          <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
        ) : filtered.length === 0 ? (
          <Typography color="text.secondary" textAlign="center" py={4}>
            {allCases.length === 0 ? 'No active test cases in this project.' : 'No matching test cases.'}
          </Typography>
        ) : (
          <Box sx={{ maxHeight: 400, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={allFilteredSelected}
                      indeterminate={someFilteredSelected}
                      onChange={toggleAll}
                    />
                  </TableCell>
                  <TableCell>ID</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Module</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell align="right">Est. (min)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((tc: TestCase) => {
                  const isSelected = selected.has(tc.id);
                  return (
                    <TableRow
                      key={tc.id}
                      hover
                      selected={isSelected}
                      onClick={() => toggleCase(tc.id)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell padding="checkbox">
                        <IconButton size="small" disableRipple>
                          {isSelected ? <CheckBoxIcon color="primary" fontSize="small" /> : <CheckBoxOutlineBlankIcon fontSize="small" />}
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" fontFamily="monospace">{tc.test_id}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{tc.title}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">{tc.module?.name ?? '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={tc.priority} size="small" color={PRIORITY_COLOR[tc.priority] ?? 'default'} />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="caption">{tc.estimated_minutes ?? '—'}</Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary">
          {selected.size > 0 ? `${selected.size} selected` : 'Select test cases to add'}
        </Typography>
        <Box display="flex" gap={1}>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            variant="contained"
            disabled={selected.size === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Adding…' : `Add ${selected.size > 0 ? selected.size : ''} Case${selected.size !== 1 ? 's' : ''}`}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

// ── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: '12px !important' }}>
        <Box color="primary.main">{icon}</Box>
        <Box>
          <Typography variant="h6" fontWeight={700} lineHeight={1}>{value}</Typography>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function TestPlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const qc = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [removingCase, setRemovingCase] = useState<TestPlanCase | null>(null);

  const statusMutation = useMutation({
    mutationFn: (status: string) => testPlanService.update(id!, { status: status as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-plan', id] });
      qc.invalidateQueries({ queryKey: ['test-plans'] });
      toastSuccess('Status updated');
    },
    onError: e => toastError(e),
  });

  const { data: plan, isLoading } = useQuery({
    queryKey: ['test-plan', id],
    queryFn: () => testPlanService.get(id!),
    enabled: !!id,
  });

  const { data: cases = [], isLoading: casesLoading } = useQuery({
    queryKey: ['plan-cases', id],
    queryFn: () => testPlanService.getCases(id!),
    enabled: !!id,
  });

  const removeMutation = useMutation({
    mutationFn: () => testPlanService.removeCase(removingCase!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-plan', id] });
      qc.invalidateQueries({ queryKey: ['plan-cases', id] });
      toastSuccess('Test case removed from plan');
      setRemovingCase(null);
    },
    onError: e => toastError(e),
  });

  const canManage = profile?.role === 'administrator' || profile?.role === 'developer';

  if (isLoading || !plan) return <LoadingState />;

  const alreadyLinked = new Set(cases.map(c => c.test_case_id));
  const totalEstMinutes = cases.reduce((sum, c) => sum + (c.test_case?.estimated_minutes ?? 0), 0);
  const totalEstHours = Math.floor(totalEstMinutes / 60);
  const remainMinutes = totalEstMinutes % 60;
  const estimatedLabel = totalEstHours > 0
    ? `${totalEstHours}h ${remainMinutes}m`
    : `${totalEstMinutes}m`;

  const modules = [...new Set(cases.map(c => c.test_case?.module?.name).filter(Boolean))];

  return (
    <Box>
      <PageHeader
        title={plan.name}
        subtitle={plan.description ?? 'Test Plan'}
        breadcrumbs={[
          { label: 'Test Plans', to: '/test-plans' },
          { label: plan.name },
        ]}
        showBack
        actions={
          <Stack direction="row" spacing={1}>
            <Select
              size="small"
              value={plan.status}
              onChange={e => statusMutation.mutate(e.target.value)}
              disabled={statusMutation.isPending}
              sx={{ minWidth: 120, height: 32 }}
            >
              {(['draft', 'active', 'completed', 'archived'] as const).map(s => (
                <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>
              ))}
            </Select>
            <Button
              variant="outlined"
              size="small"
              startIcon={<PlayArrowIcon />}
              onClick={() => navigate(`/test-sessions/new?plan=${plan.id}`)}
            >
              Start Session
            </Button>
            {canManage && (
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setAddOpen(true)}
              >
                Add Test Cases
              </Button>
            )}
          </Stack>
        }
      />

      {/* Summary */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={4}>
          <SummaryCard
            icon={<AssignmentIcon />}
            label="Total Test Cases"
            value={cases.length}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <SummaryCard
            icon={<AccessTimeIcon />}
            label="Total Estimated Time"
            value={cases.length === 0 ? '—' : estimatedLabel}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <SummaryCard
            icon={<CategoryIcon />}
            label="Modules Covered"
            value={modules.length}
          />
        </Grid>
      </Grid>

      {/* Release info */}
      {plan.release && (
        <Box mb={3}>
          <Typography variant="caption" color="text.secondary">
            Release: <strong>{plan.release.name} v{plan.release.version}</strong>
          </Typography>
        </Box>
      )}

      <Divider sx={{ mb: 3 }} />

      {/* Test Cases Section */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h6" fontWeight={700}>
          Test Cases ({cases.length})
        </Typography>
        {canManage && (
          <Button size="small" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
            Add Cases
          </Button>
        )}
      </Box>

      {casesLoading ? (
        <LinearProgress />
      ) : cases.length === 0 ? (
        <EmptyState
          icon={<AssignmentIcon sx={{ fontSize: 56 }} />}
          title="No test cases yet"
          description="Add test cases to this plan to start organizing your testing."
          action={
            canManage ? (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
                Add Test Cases
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Title</TableCell>
                <TableCell>Module</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell align="right">Est. (min)</TableCell>
                {canManage && <TableCell align="center">Action</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {cases.map(pc => (
                <TableRow key={pc.id} hover>
                  <TableCell>
                    <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                      {pc.test_case?.test_id ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {pc.test_case?.title ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {pc.test_case?.module?.name ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {pc.test_case?.priority && (
                      <Chip
                        label={pc.test_case.priority}
                        size="small"
                        color={PRIORITY_COLOR[pc.test_case.priority] ?? 'default'}
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="caption">
                      {pc.test_case?.estimated_minutes ?? '—'}
                    </Typography>
                  </TableCell>
                  {canManage && (
                    <TableCell align="center">
                      <Tooltip title="Remove from plan">
                        <IconButton size="small" color="error" onClick={() => setRemovingCase(pc)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add Cases Dialog */}
      <AddCasesDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        planId={id!}
        projectId={plan.project_id}
        alreadyLinked={alreadyLinked}
      />

      {/* Remove Confirm */}
      <ConfirmDialog
        open={!!removingCase}
        title="Remove Test Case"
        message={`Remove "${removingCase?.test_case?.title}" from this plan? The test case itself will not be deleted.`}
        confirmLabel="Remove"
        confirmColor="error"
        onConfirm={() => removeMutation.mutate()}
        onCancel={() => setRemovingCase(null)}
      />
    </Box>
  );
}
