import { useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControl,
  Grid, IconButton, InputAdornment, InputLabel, LinearProgress, List, ListItem, ListItemText,
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
import RefreshIcon from '@mui/icons-material/Refresh';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { StatusChip } from '@/components/common/StatusChip';
import { testPlanService } from '@/services/testPlanService';
import { testCaseService } from '@/services/testCaseService';
import { importSuiteService, type ImportMode, type ImportPreview, type ValidationIssue } from '@/services/importSuiteService';
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

// ── Reset Plan Dialog ────────────────────────────────────────────────────────

function ResetPlanDialog({ open, onClose, planId, planName }: {
  open: boolean; onClose: () => void; planId: string; planName: string;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => testPlanService.resetStatus(planId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['test-plan', planId] });
      qc.invalidateQueries({ queryKey: ['test-sessions'] });
      toastSuccess(`Reset complete — ${result.sessions_reset} session${result.sessions_reset !== 1 ? 's' : ''} and ${result.executions_reset} execution${result.executions_reset !== 1 ? 's' : ''} cleared`);
      onClose();
    },
    onError: e => toastError(e),
  });

  function handleClose() {
    if (!mutation.isPending) onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Reset Test Plan Status</DialogTitle>
      <DialogContent>
        <Typography variant="body2" mb={2}>
          This will clear all execution progress for <strong>{planName}</strong>.
        </Typography>
        <Box mb={1}>
          <Typography variant="caption" color="error.main" fontWeight={700} display="block" mb={0.5}>
            Will be cleared:
          </Typography>
          <List dense disablePadding>
            {['PASS / FAIL / BLOCKED / SKIPPED results', 'Test session timestamps & counters', 'Execution notes & duration data'].map(item => (
              <ListItem key={item} disablePadding sx={{ pl: 1 }}>
                <ListItemText primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }} primary={`• ${item}`} />
              </ListItem>
            ))}
          </List>
        </Box>
        <Box>
          <Typography variant="caption" color="success.main" fontWeight={700} display="block" mb={0.5}>
            Will be preserved:
          </Typography>
          <List dense disablePadding>
            {['Test cases & steps', 'Bug reports', 'Attachments', 'Comments'].map(item => (
              <ListItem key={item} disablePadding sx={{ pl: 1 }}>
                <ListItemText primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }} primary={`• ${item}`} />
              </ListItem>
            ))}
          </List>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={mutation.isPending}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          startIcon={mutation.isPending ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
        >
          {mutation.isPending ? 'Resetting…' : 'Reset Status'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Import Suite Dialog ──────────────────────────────────────────────────────

type ImportStep = 'mode' | 'validating' | 'errors' | 'preview' | 'confirming';

// ── Schema Help Dialog ────────────────────────────────────────────────────────

const SCHEMA_FIELDS = [
  {
    section: 'Top-level',
    fields: [
      { name: 'version', type: 'string', required: true, notes: 'Must be exactly "1.0"' },
      { name: 'metadata', type: 'object', required: true, notes: 'exported_at (ISO date), source_plan_id (string), source_plan_name (string)' },
      { name: 'suite', type: 'object', required: true, notes: 'Suite identity block — see Suite fields below' },
      { name: 'test_cases', type: 'array', required: true, notes: 'Array of test case objects — must contain at least one entry' },
    ],
  },
  {
    section: 'suite',
    fields: [
      { name: 'id', type: 'string', required: true, notes: 'Unique suite identifier (e.g. "SUITE-001")' },
      { name: 'name', type: 'string', required: true, notes: 'Human-readable suite name' },
      { name: 'description', type: 'string | null', required: false, notes: 'Optional description' },
      { name: 'module', type: 'string', required: true, notes: 'Module label for the suite (e.g. "General")' },
      { name: 'version', type: 'string', required: true, notes: 'Semantic version string (e.g. "1.0.0")' },
      { name: 'tags', type: 'string[]', required: false, notes: 'Array of tag strings' },
      { name: 'automation', type: 'object', required: true, notes: '{ runner: null, config: {} }' },
    ],
  },
  {
    section: 'test_cases[]',
    fields: [
      { name: 'id', type: 'string', required: true, notes: 'Unique test case ID (e.g. "TC-001"). Used for MERGE matching.' },
      { name: 'title', type: 'string', required: true, notes: 'Short, descriptive test case title' },
      { name: 'description', type: 'string | null', required: false, notes: 'Full description of what the test verifies' },
      { name: 'priority', type: 'enum', required: true, notes: 'Allowed values: "critical" | "high" | "medium" | "low"' },
      { name: 'module', type: 'string', required: true, notes: 'Module name — matched to existing modules or created if missing' },
      { name: 'preconditions', type: 'string | null', required: false, notes: 'State that must be true before executing the test' },
      { name: 'expected_result', type: 'string | null', required: false, notes: 'Overall pass condition for the entire test case' },
      { name: 'tags', type: 'string[]', required: false, notes: 'Array of tag strings for filtering and reporting' },
      { name: 'automation', type: 'object', required: true, notes: '{ type: "MANUAL", automation_id: null, runner: null, runner_config: {}, expected_duration_ms: null }' },
      { name: 'steps', type: 'array', required: true, notes: 'Ordered array of step objects — see steps[] fields below' },
    ],
  },
  {
    section: 'test_cases[].steps[]',
    fields: [
      { name: 'order', type: 'number', required: true, notes: 'Step sequence number, starting at 1' },
      { name: 'action', type: 'string', required: true, notes: 'What the tester must do in this step' },
      { name: 'expected', type: 'string', required: true, notes: 'Observable result that confirms the step passed' },
      { name: 'notes', type: 'string | null', required: false, notes: 'Optional tester hints or test data values' },
      { name: 'automation_selector', type: 'null', required: false, notes: 'Set to null for MANUAL tests' },
      { name: 'automation_action_config', type: 'object', required: false, notes: 'Set to {} for MANUAL tests' },
    ],
  },
];

function SchemaHelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>JSON Import Format Reference</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {SCHEMA_FIELDS.map(({ section, fields }) => (
          <Box key={section}>
            <Box sx={{ px: 3, py: 1.5, bgcolor: 'action.hover' }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {section}
              </Typography>
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 180, fontWeight: 700 }}>Field</TableCell>
                  <TableCell sx={{ width: 130, fontWeight: 700 }}>Type</TableCell>
                  <TableCell sx={{ width: 80, fontWeight: 700 }}>Required</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {fields.map(f => (
                  <TableRow key={f.name} hover>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">{f.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" fontFamily="monospace">{f.type}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={f.required ? 'Yes' : 'No'}
                        size="small"
                        color={f.required ? 'error' : 'default'}
                        variant={f.required ? 'filled' : 'outlined'}
                        sx={{ fontSize: '0.65rem' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{f.notes}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Divider />
          </Box>
        ))}
        <Box sx={{ px: 3, py: 2 }}>
          <Alert severity="info" icon={false}>
            <Typography variant="caption">
              Download the starter template to see a complete valid example. Import modes: <strong>Create New</strong> adds all cases as new;{' '}
              <strong>Merge Existing</strong> matches by <code>id</code> and updates existing cases while adding new ones.
            </Typography>
          </Alert>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function ImportSuiteDialog({ open, onClose, planId, projectId }: {
  open: boolean; onClose: () => void; planId: string; projectId: string;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>('mode');
  const [mode, setMode] = useState<ImportMode>('CREATE_NEW');
  const [schemaHelpOpen, setSchemaHelpOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [errors, setErrors] = useState<ValidationIssue[]>([]);
  const [warnings, setWarnings] = useState<ValidationIssue[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [jobId, setJobId] = useState('');

  function reset() {
    setStep('mode');
    setMode('CREATE_NEW');
    setFileName('');
    setErrors([]);
    setWarnings([]);
    setPreview(null);
    setJobId('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFileUpload(file: File) {
    setFileName(file.name);
    setStep('validating');
    let payload: unknown;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      toastError(new Error('Invalid JSON file'));
      setStep('mode');
      return;
    }
    try {
      const result = await importSuiteService.preview(payload, mode, projectId, planId);
      if (!result.success) {
        setErrors(result.errors ?? []);
        setWarnings(result.warnings ?? []);
        setJobId(result.job_id);
        setStep('errors');
      } else {
        setWarnings(result.warnings ?? []);
        setPreview(result.preview!);
        setJobId(result.job_id);
        setStep('preview');
      }
    } catch (e) {
      toastError(e as Error);
      setStep('mode');
    }
  }

  const confirmMutation = useMutation({
    mutationFn: () => importSuiteService.confirm(jobId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['test-plan', planId] });
      qc.invalidateQueries({ queryKey: ['plan-cases', planId] });
      qc.invalidateQueries({ queryKey: ['test-cases', projectId] });
      toastSuccess(`Import complete — ${result.cases_created} created, ${result.cases_updated} updated, ${result.steps_total} steps`);
      handleClose();
    },
    onError: e => toastError(e),
  });

  const errorsByCase = useMemo(() => {
    const map: Record<string, ValidationIssue[]> = {};
    for (const e of errors) {
      const key = e.test_case_id ?? '__global__';
      (map[key] ??= []).push(e);
    }
    return map;
  }, [errors]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Import Test Suite from JSON</DialogTitle>
      <DialogContent>
        {step === 'mode' && (
          <Box>
            <FormControl fullWidth size="small" sx={{ mb: 2, mt: 1 }}>
              <InputLabel>Import Mode</InputLabel>
              <Select label="Import Mode" value={mode} onChange={e => setMode(e.target.value as ImportMode)}>
                <MenuItem value="CREATE_NEW">Create New — add cases without touching existing</MenuItem>
                <MenuItem value="MERGE_EXISTING">Merge Existing — update matching, add new</MenuItem>
                <MenuItem value="REPLACE_EXISTING" disabled>
                  Replace Existing — Coming Soon
                </MenuItem>
              </Select>
            </FormControl>
            <Box
              sx={{
                border: '2px dashed', borderColor: 'divider', borderRadius: 1,
                p: 3, textAlign: 'center', cursor: 'pointer',
                '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
              }}
              onClick={() => fileRef.current?.click()}
            >
              <UploadFileIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Click to upload a JSON file
              </Typography>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
              />
            </Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mt={1.5}>
              <Button
                size="small"
                startIcon={<HelpOutlineIcon fontSize="small" />}
                onClick={() => setSchemaHelpOpen(true)}
                sx={{ textTransform: 'none', fontSize: '0.75rem' }}
              >
                View JSON Format
              </Button>
              <Button
                size="small"
                component="a"
                href="/testhub_test_suite_template.json"
                download="testhub_test_suite_template.json"
                startIcon={<DownloadIcon fontSize="small" />}
                sx={{ textTransform: 'none', fontSize: '0.75rem' }}
              >
                Download Template
              </Button>
            </Stack>
            <SchemaHelpDialog open={schemaHelpOpen} onClose={() => setSchemaHelpOpen(false)} />
          </Box>
        )}

        {step === 'validating' && (
          <Box display="flex" flexDirection="column" alignItems="center" py={4} gap={2}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">Validating {fileName}…</Typography>
          </Box>
        )}

        {step === 'errors' && (
          <Box>
            <Alert severity="error" sx={{ mb: 2 }}>
              Found {errors.length} error{errors.length !== 1 ? 's' : ''}. Fix these before importing.
            </Alert>
            <Box sx={{ maxHeight: 320, overflow: 'auto' }}>
              {Object.entries(errorsByCase).map(([caseId, issues]) => (
                <Box key={caseId} mb={1.5}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary">
                    {caseId === '__global__' ? 'Global' : `Case: ${caseId}`}
                  </Typography>
                  {issues.map((e, i) => (
                    <Alert key={i} severity="error" sx={{ mt: 0.5, py: 0 }}>
                      <Typography variant="caption">[{e.error_code}] {e.error_message}</Typography>
                    </Alert>
                  ))}
                </Box>
              ))}
              {warnings.map((w, i) => (
                <Alert key={i} severity="warning" sx={{ mb: 0.5, py: 0 }}>
                  <Typography variant="caption">[{w.error_code}] {w.error_message}</Typography>
                </Alert>
              ))}
            </Box>
          </Box>
        )}

        {(step === 'preview' || step === 'confirming') && preview && (
          <Box>
            {warnings.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {warnings.length} warning{warnings.length !== 1 ? 's' : ''} — you may still proceed.
              </Alert>
            )}
            <Typography variant="subtitle2" fontWeight={700} mb={1}>{preview.suite.name}</Typography>
            <Stack spacing={0.5} mb={2}>
              <Typography variant="body2">Mode: <strong>{preview.mode.replace('_', ' ')}</strong></Typography>
              <Typography variant="body2">Cases: <strong>{preview.total_cases}</strong></Typography>
              <Typography variant="body2">Steps: <strong>{preview.total_steps}</strong></Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" mb={0.5}>By Priority</Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5} mb={2}>
              {Object.entries(preview.cases_by_priority).map(([p, n]) => (
                <Chip key={p} label={`${p}: ${n}`} size="small" />
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" mb={0.5}>By Module</Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {Object.entries(preview.cases_by_module).map(([m, n]) => (
                <Chip key={m} label={`${m}: ${n}`} size="small" variant="outlined" />
              ))}
            </Stack>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={confirmMutation.isPending}>Cancel</Button>
        {step === 'errors' && (
          <Button onClick={reset}>Upload Different File</Button>
        )}
        {(step === 'preview' || step === 'confirming') && (
          <>
            <Button onClick={reset} disabled={confirmMutation.isPending}>Back</Button>
            <Button
              variant="contained"
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending}
              startIcon={confirmMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <UploadFileIcon />}
            >
              {confirmMutation.isPending ? 'Importing…' : 'Confirm Import'}
            </Button>
          </>
        )}
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
  const [resetOpen, setResetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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

  const exportMutation = useMutation({
    mutationFn: () => testPlanService.getSuiteExportData(id!, plan?.name ?? '', plan?.project_id ?? ''),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(plan?.name ?? 'suite').replace(/\s+/g, '_')}_export.json`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess('Test suite exported');
    },
    onError: e => toastError(e),
  });

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
              <>
                <Button
                  variant="outlined"
                  size="small"
                  color="warning"
                  startIcon={<RefreshIcon />}
                  onClick={() => setResetOpen(true)}
                >
                  Reset Status
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<UploadFileIcon />}
                  onClick={() => setImportOpen(true)}
                >
                  Import JSON
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={exportMutation.isPending ? <CircularProgress size={14} /> : <DownloadIcon />}
                  disabled={exportMutation.isPending}
                  onClick={() => exportMutation.mutate()}
                >
                  Export JSON
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setAddOpen(true)}
                >
                  Add Test Cases
                </Button>
              </>
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

      {/* Reset Status Dialog */}
      <ResetPlanDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        planId={id!}
        planName={plan.name}
      />

      {/* Import Suite Dialog */}
      <ImportSuiteDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        planId={id!}
        projectId={plan.project_id}
      />
    </Box>
  );
}
