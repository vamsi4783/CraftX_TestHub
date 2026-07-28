import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Grid, Card, CardContent, Typography, Button, Chip, Avatar, Divider,
  TextField, Select, MenuItem, FormControl, InputLabel, List, ListItem,
  ListItemAvatar, ListItemText, IconButton, Alert, Tooltip, Dialog,
  DialogTitle, DialogContent, DialogActions, Stack, Badge, Menu,
  LinearProgress, Tab, Tabs, Collapse,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import EditIcon from '@mui/icons-material/Edit';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BugReportIcon from '@mui/icons-material/BugReport';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HistoryIcon from '@mui/icons-material/History';
import LinkIcon from '@mui/icons-material/Link';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import CodeIcon from '@mui/icons-material/Code';
import ReplayIcon from '@mui/icons-material/Replay';
import BlockIcon from '@mui/icons-material/Block';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import CloseIcon from '@mui/icons-material/Close';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { bugService } from '@/services/bugService';
import { userService } from '@/services/userService';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusChip } from '@/components/common/StatusChip';
import { SeverityChip } from '@/components/common/SeverityChip';
import { LoadingState } from '@/components/common/LoadingState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { toastSuccess, toastError } from '@/lib/errors';
import { formatDate, timeAgo, getInitials } from '@/lib/utils';
import type { BugStatus, BugSeverity, BugPriority, BugRelationshipType } from '@/types';

// ─── Lifecycle config ──────────────────────────────────────────────────────

const LIFECYCLE_STEPS: BugStatus[] = [
  'new', 'triaged', 'assigned', 'in_progress', 'ready_for_qa', 'retesting', 'verified', 'closed',
];

const STATUS_LABEL: Partial<Record<BugStatus, string>> = {
  new: 'New', triaged: 'Triaged', assigned: 'Assigned', in_progress: 'In Progress',
  ready_for_qa: 'Ready for QA', retesting: 'Retesting', verified: 'Verified',
  closed: 'Closed', rejected: 'Rejected', duplicate: 'Duplicate',
  cannot_reproduce: 'Cannot Reproduce', wont_fix: "Won't Fix",
};

const STATUS_COLOR: Partial<Record<BugStatus, string>> = {
  new: '#EF4444', triaged: '#F59E0B', assigned: '#3B82F6', in_progress: '#4F46E5',
  ready_for_qa: '#06B6D4', retesting: '#8B5CF6', verified: '#10B981', closed: '#6B7280',
  rejected: '#9CA3AF', duplicate: '#9CA3AF', cannot_reproduce: '#9CA3AF', wont_fix: '#9CA3AF',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box display="flex" justifyContent="space-between" alignItems="center" py={0.75}>
      <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ minWidth: 90 }}>{label}</Typography>
      <Box>{value}</Box>
    </Box>
  );
}

function StatusDot({ status }: { status: BugStatus }) {
  const color = STATUS_COLOR[status] ?? '#9CA3AF';
  return <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, display: 'inline-block', mr: 0.75 }} />;
}

function FileSizeLabel({ bytes }: { bytes: number | null }) {
  if (!bytes) return null;
  if (bytes < 1024) return <>{bytes} B</>;
  if (bytes < 1048576) return <>{(bytes / 1024).toFixed(1)} KB</>;
  return <>{(bytes / 1048576).toFixed(1)} MB</>;
}

// ─── Lifecycle Banner ──────────────────────────────────────────────────────

function LifecycleBanner({ status }: { status: BugStatus }) {
  const activeIdx = LIFECYCLE_STEPS.indexOf(status);
  const isTerminal = !LIFECYCLE_STEPS.includes(status);

  return (
    <Card sx={{ mb: 3, overflow: 'visible' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" alignItems="center" gap={0} overflow="auto">
          {isTerminal ? (
            <Box display="flex" alignItems="center" gap={1} px={1}>
              <StatusDot status={status} />
              <Typography variant="body2" fontWeight={700} sx={{ color: STATUS_COLOR[status] }}>
                {STATUS_LABEL[status]}
              </Typography>
              <Typography variant="caption" color="text.secondary">(Terminal state)</Typography>
            </Box>
          ) : (
            LIFECYCLE_STEPS.map((step, i) => {
              const done = i < activeIdx;
              const active = i === activeIdx;
              const color = STATUS_COLOR[step] ?? '#9CA3AF';
              return (
                <Box key={step} display="flex" alignItems="center">
                  <Box sx={{ textAlign: 'center', px: 1.5 }}>
                    <Box sx={{
                      width: 28, height: 28, borderRadius: '50%', mx: 'auto', mb: 0.25,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: done ? '#10B981' : active ? color : 'action.hover',
                      border: active ? `2px solid ${color}` : '2px solid transparent',
                      transition: 'all 0.2s',
                    }}>
                      {done
                        ? <CheckCircleIcon sx={{ fontSize: 16, color: '#fff' }} />
                        : <Typography variant="caption" fontWeight={700} sx={{ color: done ? '#fff' : active ? color : 'text.disabled', fontSize: 10 }}>{i + 1}</Typography>
                      }
                    </Box>
                    <Typography variant="caption" sx={{ fontSize: 9, color: active ? color : done ? '#10B981' : 'text.disabled', fontWeight: active ? 700 : 400, whiteSpace: 'nowrap' }}>
                      {STATUS_LABEL[step]}
                    </Typography>
                  </Box>
                  {i < LIFECYCLE_STEPS.length - 1 && (
                    <Box sx={{ width: 20, height: 2, bgcolor: i < activeIdx ? '#10B981' : 'action.hover', flexShrink: 0 }} />
                  )}
                </Box>
              );
            })
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── Developer Resolution Dialog ───────────────────────────────────────────

function ResolutionDialog({ open, onClose, bugId }: { open: boolean; onClose: () => void; bugId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ fix_version: '', commit_ref: '', pull_request: '', root_cause: '', resolution_notes: '', files_changed: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: () => bugService.submitResolution(bugId, {
      fix_version: form.fix_version || undefined,
      commit_ref: form.commit_ref || undefined,
      pull_request: form.pull_request || undefined,
      root_cause: form.root_cause || undefined,
      resolution_notes: form.resolution_notes || undefined,
      files_changed: form.files_changed || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bug', bugId] });
      qc.invalidateQueries({ queryKey: ['bug-history', bugId] });
      toastSuccess('Resolution submitted — bug moved to Ready for QA');
      onClose();
    },
    onError: e => toastError(e),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CodeIcon color="primary" /> Submit Developer Resolution
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        <Alert severity="info" sx={{ py: 0.5 }}>
          Submitting will move this bug to <strong>Ready for QA</strong> status.
        </Alert>
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField label="Fix Version" value={form.fix_version} onChange={set('fix_version')} fullWidth size="small" placeholder="v2.1.0" />
          </Grid>
          <Grid item xs={6}>
            <TextField label="Commit Reference" value={form.commit_ref} onChange={set('commit_ref')} fullWidth size="small" placeholder="abc1234" />
          </Grid>
          <Grid item xs={12}>
            <TextField label="Pull Request URL" value={form.pull_request} onChange={set('pull_request')} fullWidth size="small" placeholder="https://github.com/..." />
          </Grid>
          <Grid item xs={12}>
            <TextField label="Root Cause" value={form.root_cause} onChange={set('root_cause')} fullWidth multiline rows={2} size="small" placeholder="What caused this bug?" />
          </Grid>
          <Grid item xs={12}>
            <TextField label="Resolution Notes *" value={form.resolution_notes} onChange={set('resolution_notes')} fullWidth multiline rows={3} size="small" placeholder="How was it fixed?" />
          </Grid>
          <Grid item xs={12}>
            <TextField label="Files Changed" value={form.files_changed} onChange={set('files_changed')} fullWidth size="small" placeholder="src/foo.ts, src/bar.ts" />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="success" disabled={!form.resolution_notes.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Submitting…' : 'Submit & Mark Ready for QA'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Add Relationship Dialog ────────────────────────────────────────────────

function RelationshipDialog({ open, onClose, bugId, projectId }: { open: boolean; onClose: () => void; bugId: string; projectId: string }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [relType, setRelType] = useState<BugRelationshipType>('related');
  const [search, setSearch] = useState('');

  const { data: candidates = [] } = useQuery({
    queryKey: ['bug-search', projectId, search],
    queryFn: () => bugService.list(projectId, { search }),
    enabled: search.length > 2,
  });

  const mutation = useMutation({
    mutationFn: (relatedBugId: string) => bugService.addRelationship(bugId, relatedBugId, relType, profile!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bug-relationships', bugId] });
      toastSuccess('Relationship added');
      onClose();
    },
    onError: e => toastError(e),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Link Bug</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        <FormControl size="small" fullWidth>
          <InputLabel>Relationship</InputLabel>
          <Select label="Relationship" value={relType} onChange={e => setRelType(e.target.value as BugRelationshipType)}>
            {(['duplicate_of', 'blocks', 'blocked_by', 'related', 'parent', 'child'] as BugRelationshipType[]).map(r => (
              <MenuItem key={r} value={r}>{r.replace(/_/g, ' ')}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField label="Search bugs by title or ID" value={search} onChange={e => setSearch(e.target.value)} size="small" fullWidth placeholder="Type at least 3 characters…" />
        {candidates.filter(c => c.id !== bugId).map(b => (
          <Card key={b.id} variant="outlined" sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }} onClick={() => mutation.mutate(b.id)}>
            <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="caption" color="primary.main" fontFamily="monospace">{b.bug_id}</Typography>
                <Typography variant="body2" flex={1} noWrap>{b.title}</Typography>
                <SeverityChip value={b.severity} />
                <StatusChip status={b.status} />
              </Box>
            </CardContent>
          </Card>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export function BugDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();

  const [tab, setTab] = useState(0);
  const [comment, setComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editStatus, setEditStatus] = useState<BugStatus>('new');
  const [editSeverity, setEditSeverity] = useState<BugSeverity>('high');
  const [editPriority, setEditPriority] = useState<BugPriority>('p2');
  const [editAssignee, setEditAssignee] = useState('');
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ label: string; message: string; action: () => Promise<void> } | null>(null);
  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null);
  const [failRetestNotes, setFailRetestNotes] = useState('');
  const [failRetestOpen, setFailRetestOpen] = useState(false);

  const { data: bug, isLoading } = useQuery({
    queryKey: ['bug', id],
    queryFn: () => bugService.get(id!),
    enabled: !!id,
  });
  const { data: comments = [] } = useQuery({
    queryKey: ['bug-comments', id],
    queryFn: () => bugService.getComments(id!),
    enabled: !!id,
  });
  const { data: history = [] } = useQuery({
    queryKey: ['bug-history', id],
    queryFn: () => bugService.getHistory(id!),
    enabled: !!id,
  });
  const { data: relationships = [] } = useQuery({
    queryKey: ['bug-relationships', id],
    queryFn: () => bugService.getRelationships(id!),
    enabled: !!id,
  });
  const { data: attachments = [] } = useQuery({
    queryKey: ['bug-attachments', id],
    queryFn: () => bugService.getAttachments(id!),
    enabled: !!id,
  });
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => userService.list() });

  // Merged timeline (comments + history)
  const timeline = useMemo(() => {
    const items = [
      ...comments.map(c => ({ type: 'comment' as const, time: c.created_at, data: c })),
      ...history.map(h => ({ type: 'history' as const, time: h.changed_at, data: h })),
    ];
    return items.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [comments, history]);

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<typeof bug>) => bugService.update(id!, payload as Parameters<typeof bugService.update>[1]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bug', id] });
      qc.invalidateQueries({ queryKey: ['bug-history', id] });
      setEditOpen(false);
      toastSuccess('Bug updated');
    },
    onError: e => toastError(e),
  });

  const commentMutation = useMutation({
    mutationFn: () => bugService.addComment(id!, profile!.id, comment, isInternal),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bug-comments', id] });
      setComment('');
      toastSuccess('Comment added');
    },
    onError: e => toastError(e),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (cid: string) => bugService.deleteComment(cid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bug-comments', id] }),
  });

  const retestMutation = useMutation({
    mutationFn: () => bugService.markRetesting(id!, profile!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bug', id] }); toastSuccess('Moved to Retesting'); },
    onError: e => toastError(e),
  });

  const failRetestMutation = useMutation({
    mutationFn: () => bugService.failRetest(id!, failRetestNotes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bug', id] });
      qc.invalidateQueries({ queryKey: ['bug-history', id] });
      setFailRetestOpen(false);
      toastSuccess('Bug returned to developer');
    },
    onError: e => toastError(e),
  });

  const removeRelMutation = useMutation({
    mutationFn: (relId: string) => bugService.removeRelationship(relId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bug-relationships', id] }),
  });

  if (isLoading || !bug) return <LoadingState />;

  const isMyBug = profile?.id === bug.assigned_to;
  const isDeveloper = profile?.role === 'developer' || isAdmin;
  const isQA = profile?.role === 'qa_tester' || isAdmin;
  const canEditDetails = isDeveloper || isQA || isAdmin;

  type ActionDef = { label: string; color: 'primary' | 'success' | 'error' | 'warning'; icon: React.ReactNode; condition: boolean; onClick: () => void };
  // Status-based action buttons
  const allActions: ActionDef[] = [
    {
      label: 'Triage', color: 'primary', icon: <CheckCircleIcon />,
      condition: bug.status === 'new' && isQA,
      onClick: () => updateMutation.mutate({ status: 'triaged' }),
    },
    {
      label: 'Start Work', color: 'primary', icon: <CodeIcon />,
      condition: bug.status === 'assigned' && isMyBug && isDeveloper,
      onClick: () => updateMutation.mutate({ status: 'in_progress' }),
    },
    {
      label: 'Submit Fix', color: 'success', icon: <DoneAllIcon />,
      condition: bug.status === 'in_progress' && isMyBug && isDeveloper,
      onClick: () => setResolutionOpen(true),
    },
    {
      label: 'Cannot Reproduce', color: 'warning', icon: <BlockIcon />,
      condition: ['assigned', 'in_progress'].includes(bug.status) && isDeveloper,
      onClick: () => updateMutation.mutate({ status: 'cannot_reproduce' }),
    },
    {
      label: "Won't Fix", color: 'warning', icon: <CloseIcon />,
      condition: ['assigned', 'in_progress', 'triaged'].includes(bug.status) && isAdmin,
      onClick: () => updateMutation.mutate({ status: 'wont_fix' }),
    },
    {
      label: 'Begin Retest', color: 'primary', icon: <ReplayIcon />,
      condition: bug.status === 'ready_for_qa' && isQA,
      onClick: () => retestMutation.mutate(),
    },
    {
      label: 'Retest Passed ✓', color: 'success', icon: <CheckCircleIcon />,
      condition: bug.status === 'retesting' && isQA,
      onClick: () => updateMutation.mutate({ status: 'verified' }),
    },
    {
      label: 'Retest Failed ✗', color: 'error', icon: <ReplayIcon />,
      condition: bug.status === 'retesting' && isQA,
      onClick: () => setFailRetestOpen(true),
    },
    {
      label: 'Close Bug', color: 'success', icon: <DoneAllIcon />,
      condition: bug.status === 'verified' && isQA,
      onClick: () => updateMutation.mutate({ status: 'closed' }),
    },
    {
      label: 'Reject', color: 'error', icon: <CloseIcon />,
      condition: ['new', 'triaged'].includes(bug.status) && isQA,
      onClick: () => updateMutation.mutate({ status: 'rejected' }),
    },
    {
      label: 'Reopen', color: 'warning', icon: <ReplayIcon />,
      condition: ['closed', 'rejected', 'verified', 'wont_fix', 'cannot_reproduce'].includes(bug.status) && isAdmin,
      onClick: () => updateMutation.mutate({ status: 'new' }),
    },
  ];
  const actions = allActions.filter(a => a.condition);

  const STATUSES: BugStatus[] = ['new','triaged','assigned','in_progress','ready_for_qa','retesting','verified','closed','rejected','duplicate','cannot_reproduce','wont_fix'];
  const SEVERITIES: BugSeverity[] = ['critical','high','medium','low'];
  const PRIORITIES: BugPriority[] = ['p1','p2','p3','p4'];

  return (
    <Box>
      <PageHeader
        title={bug.bug_id}
        subtitle={bug.title}
        breadcrumbs={[{ label: 'Bugs', to: '/bugs' }, { label: bug.bug_id }]}
        actions={
          <Stack direction="row" spacing={1}>
            {actions.slice(0, 2).map(a => (
              <Button key={a.label} variant="contained" color={a.color} size="small" startIcon={a.icon}
                onClick={a.onClick} disabled={updateMutation.isPending || retestMutation.isPending}>
                {a.label}
              </Button>
            ))}
            {actions.length > 2 && (
              <>
                <IconButton size="small" onClick={e => setMoreAnchor(e.currentTarget)}><MoreVertIcon /></IconButton>
                <Menu anchorEl={moreAnchor} open={!!moreAnchor} onClose={() => setMoreAnchor(null)}>
                  {actions.slice(2).map(a => (
                    <MenuItem key={a.label} onClick={() => { setMoreAnchor(null); a.onClick(); }}
                      sx={{ color: a.color === 'error' ? 'error.main' : a.color === 'warning' ? 'warning.main' : 'inherit' }}>
                      <Box mr={1}>{a.icon}</Box>{a.label}
                    </MenuItem>
                  ))}
                </Menu>
              </>
            )}
            <Button variant="outlined" size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>Back</Button>
          </Stack>
        }
      />

      <LifecycleBanner status={bug.status} />

      <Grid container spacing={3}>
        {/* ── Main content ──────────────────────────────── */}
        <Grid item xs={12} md={8}>
          {/* Title + description */}
          <Card sx={{ mb: 2, borderLeft: `4px solid ${STATUS_COLOR[bug.status] ?? '#9CA3AF'}` }}>
            <CardContent>
              <Box display="flex" gap={1} mb={1.5} flexWrap="wrap">
                <SeverityChip value={bug.severity} />
                <Chip label={bug.priority.toUpperCase()} size="small" />
                <StatusChip status={bug.status} />
                {bug.is_regression && <Chip label="REGRESSION" size="small" color="warning" />}
                {bug.tags?.map(t => <Chip key={t} label={t} size="small" variant="outlined" />)}
              </Box>
              <Typography variant="h6" fontWeight={700} mb={1}>{bug.title}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{bug.description}</Typography>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Tab label="Timeline" />
            <Tab label={`Steps & Details`} />
            {bug.root_cause || bug.resolution_notes ? <Tab label="Resolution" /> : null}
            <Tab label={`Links (${relationships.length})`} />
            <Tab label={`Attachments (${attachments.length})`} />
          </Tabs>

          {/* Tab 0: Timeline */}
          {tab === 0 && (
            <Box>
              {/* Bug created event */}
              <Box display="flex" gap={2} mb={2}>
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'error.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <BugReportIcon sx={{ fontSize: 16, color: '#fff' }} />
                </Box>
                <Box flex={1} mt={0.5}>
                  <Typography variant="body2"><strong>{bug.reporter?.full_name}</strong> reported this bug</Typography>
                  <Typography variant="caption" color="text.secondary">{formatDate(bug.created_at)}</Typography>
                </Box>
              </Box>

              {/* Merged timeline */}
              {timeline.map((item, i) => (
                <Box key={i} display="flex" gap={2} mb={2}>
                  {item.type === 'comment' ? (
                    <>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        {getInitials(item.data.user?.full_name)}
                      </Avatar>
                      <Box flex={1}>
                        <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                          <Typography variant="caption" fontWeight={700}>{item.data.user?.full_name}</Typography>
                          {item.data.is_internal && <Chip label="Internal" size="small" color="warning" sx={{ height: 16, fontSize: 10 }} />}
                          <Typography variant="caption" color="text.secondary">{timeAgo(item.data.created_at)}</Typography>
                          {profile?.id === item.data.user_id && (
                            <Tooltip title="Delete comment">
                              <IconButton size="small" onClick={() => deleteCommentMutation.mutate(item.data.id)} sx={{ ml: 'auto' }}>
                                <CloseIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                        <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 1.5 }}>
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{item.data.content}</Typography>
                        </Box>
                      </Box>
                    </>
                  ) : (
                    <>
                      <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'action.selected', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <HistoryIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                      </Box>
                      <Box flex={1} mt={0.75}>
                        <Typography variant="caption">
                          <strong>{item.data.changer?.full_name ?? 'System'}</strong> changed <strong>{item.data.field_name.replace(/_/g, ' ')}</strong>{' '}
                          {item.data.old_value && <><Chip label={item.data.old_value} size="small" sx={{ height: 16, fontSize: 10 }} /> → </>}
                          <Chip label={item.data.new_value ?? '—'} size="small" sx={{ height: 16, fontSize: 10 }} />
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">{timeAgo(item.data.changed_at)}</Typography>
                      </Box>
                    </>
                  )}
                </Box>
              ))}

              {/* Comment input */}
              <Divider sx={{ my: 2 }} />
              <Box display="flex" gap={1.5}>
                <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {getInitials(profile?.full_name)}
                </Avatar>
                <Box flex={1}>
                  <TextField
                    placeholder="Add a comment… (Ctrl+Enter to send)"
                    value={comment} onChange={e => setComment(e.target.value)}
                    multiline minRows={2} maxRows={6} size="small" fullWidth
                    onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey && comment.trim()) commentMutation.mutate(); }}
                  />
                  <Box display="flex" justifyContent="space-between" alignItems="center" mt={1}>
                    <Chip
                      label={isInternal ? '🔒 Internal' : '🌐 Public'}
                      size="small"
                      onClick={() => setIsInternal(v => !v)}
                      color={isInternal ? 'warning' : 'default'}
                      variant={isInternal ? 'filled' : 'outlined'}
                      sx={{ cursor: 'pointer' }}
                    />
                    <Button variant="contained" size="small" endIcon={<SendIcon />} disabled={!comment.trim() || commentMutation.isPending} onClick={() => commentMutation.mutate()}>
                      Send
                    </Button>
                  </Box>
                </Box>
              </Box>
            </Box>
          )}

          {/* Tab 1: Steps & Details */}
          {tab === 1 && (
            <Box display="flex" flexDirection="column" gap={2}>
              {bug.steps_to_reproduce && (
                <Card>
                  <CardContent>
                    <Typography variant="subtitle2" fontWeight={700} mb={1}>Steps to Reproduce</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{bug.steps_to_reproduce}</Typography>
                  </CardContent>
                </Card>
              )}
              <Grid container spacing={2}>
                {bug.expected_result && (
                  <Grid item xs={12} sm={6}>
                    <Card sx={{ borderLeft: '4px solid #10B981' }}>
                      <CardContent>
                        <Typography variant="caption" fontWeight={700} color="success.main" display="block" mb={0.5}>EXPECTED</Typography>
                        <Typography variant="body2">{bug.expected_result}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                )}
                {bug.actual_result && (
                  <Grid item xs={12} sm={6}>
                    <Card sx={{ borderLeft: '4px solid #EF4444' }}>
                      <CardContent>
                        <Typography variant="caption" fontWeight={700} color="error.main" display="block" mb={0.5}>ACTUAL</Typography>
                        <Typography variant="body2">{bug.actual_result}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                )}
              </Grid>
              {bug.logs && (
                <Card>
                  <CardContent>
                    <Typography variant="subtitle2" fontWeight={700} mb={1}>Logs</Typography>
                    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                      {bug.logs}
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Box>
          )}

          {/* Tab 2: Resolution (conditional) */}
          {tab === 2 && (bug.root_cause || bug.resolution_notes) && (
            <Box display="flex" flexDirection="column" gap={2}>
              {bug.root_cause && (
                <Card sx={{ borderLeft: '4px solid #F59E0B' }}>
                  <CardContent>
                    <Typography variant="subtitle2" fontWeight={700} color="warning.main" mb={1}>Root Cause</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{bug.root_cause}</Typography>
                  </CardContent>
                </Card>
              )}
              {bug.resolution_notes && (
                <Card sx={{ borderLeft: '4px solid #10B981' }}>
                  <CardContent>
                    <Typography variant="subtitle2" fontWeight={700} color="success.main" mb={1}>Resolution Notes</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{bug.resolution_notes}</Typography>
                  </CardContent>
                </Card>
              )}
              <Grid container spacing={2}>
                {bug.fix_version && <Grid item xs={6}><Card><CardContent><Typography variant="caption" color="text.secondary" display="block">Fix Version</Typography><Typography variant="body2" fontWeight={600}>{bug.fix_version}</Typography></CardContent></Card></Grid>}
                {bug.commit_ref && <Grid item xs={6}><Card><CardContent><Typography variant="caption" color="text.secondary" display="block">Commit</Typography><Typography variant="body2" fontFamily="monospace">{bug.commit_ref}</Typography></CardContent></Card></Grid>}
                {bug.pull_request && (
                  <Grid item xs={12}>
                    <Card>
                      <CardContent>
                        <Typography variant="caption" color="text.secondary" display="block">Pull Request</Typography>
                        <Button size="small" startIcon={<OpenInNewIcon />} href={bug.pull_request} target="_blank" rel="noreferrer">{bug.pull_request}</Button>
                      </CardContent>
                    </Card>
                  </Grid>
                )}
                {bug.files_changed && <Grid item xs={12}><Card><CardContent><Typography variant="caption" color="text.secondary" display="block">Files Changed</Typography><Typography variant="body2" fontFamily="monospace" sx={{ whiteSpace: 'pre-wrap' }}>{bug.files_changed}</Typography></CardContent></Card></Grid>}
              </Grid>
            </Box>
          )}

          {/* Tab for Links */}
          {tab === (bug.root_cause || bug.resolution_notes ? 3 : 2) && (
            <Box>
              <Button variant="outlined" size="small" startIcon={<LinkIcon />} sx={{ mb: 2 }} onClick={() => setLinkOpen(true)}>
                Add Link
              </Button>
              {relationships.length === 0 ? (
                <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>No linked bugs.</Typography>
              ) : (
                relationships.map(rel => (
                  <Card key={rel.id} variant="outlined" sx={{ mb: 1 }}>
                    <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Chip label={rel.relationship.replace(/_/g, ' ')} size="small" variant="outlined" />
                        <Typography variant="caption" color="primary.main" fontFamily="monospace">{rel.related_bug?.bug_id}</Typography>
                        <Typography variant="body2" flex={1} noWrap>{rel.related_bug?.title ?? '—'}</Typography>
                        <SeverityChip value={rel.related_bug?.severity ?? 'low'} />
                        <StatusChip status={rel.related_bug?.status ?? 'new'} />
                        <IconButton size="small" onClick={() => navigate(`/bugs/${rel.related_bug_id}`)}><OpenInNewIcon sx={{ fontSize: 14 }} /></IconButton>
                        <IconButton size="small" onClick={() => removeRelMutation.mutate(rel.id)}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
                      </Box>
                    </CardContent>
                  </Card>
                ))
              )}
            </Box>
          )}

          {/* Tab for Attachments */}
          {tab === (bug.root_cause || bug.resolution_notes ? 4 : 3) && (
            <Box>
              {attachments.length === 0 ? (
                <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>No attachments.</Typography>
              ) : (
                attachments.map(att => (
                  <Card key={att.id} variant="outlined" sx={{ mb: 1 }}>
                    <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                      <Box display="flex" alignItems="center" gap={1.5}>
                        <AttachFileIcon color="action" />
                        <Box flex={1}>
                          <Typography variant="body2" fontWeight={500}>{att.file_name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {att.file_type} · <FileSizeLabel bytes={att.file_size} /> · {att.uploader?.full_name} · {timeAgo(att.created_at)}
                          </Typography>
                        </Box>
                        <Button size="small" href={att.file_url} target="_blank" rel="noreferrer" startIcon={<OpenInNewIcon />}>View</Button>
                      </Box>
                    </CardContent>
                  </Card>
                ))
              )}
            </Box>
          )}
        </Grid>

        {/* ── Sidebar ──────────────────────────────────── */}
        <Grid item xs={12} md={4}>
          {/* Edit panel */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                <Typography variant="subtitle2" fontWeight={700}>Details</Typography>
                {canEditDetails && (
                  <IconButton size="small" onClick={() => { setEditOpen(e => !e); setEditStatus(bug.status); setEditSeverity(bug.severity); setEditPriority(bug.priority); setEditAssignee(bug.assigned_to ?? ''); }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>

              <Collapse in={editOpen}>
                <Box display="flex" flexDirection="column" gap={1.5} mb={2}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Status</InputLabel>
                    <Select label="Status" value={editStatus} onChange={e => setEditStatus(e.target.value as BugStatus)}>
                      {STATUSES.map(s => <MenuItem key={s} value={s}><StatusDot status={s} />{STATUS_LABEL[s] ?? s}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Severity</InputLabel>
                    <Select label="Severity" value={editSeverity} onChange={e => setEditSeverity(e.target.value as BugSeverity)}>
                      {SEVERITIES.map(s => <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Priority</InputLabel>
                    <Select label="Priority" value={editPriority} onChange={e => setEditPriority(e.target.value as BugPriority)}>
                      {PRIORITIES.map(p => <MenuItem key={p} value={p}>{p.toUpperCase()}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Assignee</InputLabel>
                    <Select label="Assignee" value={editAssignee} onChange={e => setEditAssignee(e.target.value)}>
                      <MenuItem value="">— Unassigned —</MenuItem>
                      {users.filter(u => ['developer', 'administrator'].includes(u.role)).map(u => (
                        <MenuItem key={u.id} value={u.id}>{u.full_name ?? u.email}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Box display="flex" gap={1}>
                    <Button size="small" onClick={() => setEditOpen(false)}>Cancel</Button>
                    <Button size="small" variant="contained" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate({ status: editStatus, severity: editSeverity, priority: editPriority, assigned_to: editAssignee || null })}>
                      Save
                    </Button>
                  </Box>
                </Box>
                <Divider sx={{ mb: 1.5 }} />
              </Collapse>

              <InfoRow label="Status"   value={<StatusChip status={bug.status} />} />
              <Divider />
              <InfoRow label="Severity" value={<SeverityChip value={bug.severity} />} />
              <Divider />
              <InfoRow label="Priority" value={<Chip label={bug.priority.toUpperCase()} size="small" />} />
              <Divider />
              <InfoRow label="Reporter" value={<Box display="flex" alignItems="center" gap={0.75}><Avatar sx={{ width: 20, height: 20, fontSize: 10, bgcolor: 'primary.main' }}>{getInitials(bug.reporter?.full_name)}</Avatar><Typography variant="caption">{bug.reporter?.full_name ?? '—'}</Typography></Box>} />
              <Divider />
              <InfoRow label="Assignee" value={bug.assignee
                ? <Box display="flex" alignItems="center" gap={0.75}><Avatar sx={{ width: 20, height: 20, fontSize: 10, bgcolor: 'secondary.main' }}>{getInitials(bug.assignee.full_name)}</Avatar><Typography variant="caption">{bug.assignee.full_name}</Typography></Box>
                : <Chip label="Unassigned" size="small" variant="outlined" />
              } />
              <Divider />
              <InfoRow label="Module"   value={<Typography variant="caption">{bug.module?.name ?? '—'}</Typography>} />
              <Divider />
              <InfoRow label="Release"  value={<Typography variant="caption">{bug.release?.name ?? '—'}</Typography>} />
              <Divider />
              <InfoRow label="Project"  value={<Typography variant="caption">{bug.project?.name ?? '—'}</Typography>} />
              <Divider />
              <InfoRow label="Reported" value={<Typography variant="caption">{formatDate(bug.created_at)}</Typography>} />
              {bug.closed_at && <><Divider /><InfoRow label="Closed" value={<Typography variant="caption">{formatDate(bug.closed_at)}</Typography>} /></>}
            </CardContent>
          </Card>

          {/* Environment */}
          {(bug.device || bug.os_version || bug.app_version || bug.browser || bug.build_number) && (
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} mb={1.5}>Environment</Typography>
                {bug.environment && <><InfoRow label="Env"    value={<Chip label={bug.environment} size="small" />} /><Divider /></>}
                {bug.device      && <><InfoRow label="Device"  value={<Typography variant="caption">{bug.device}</Typography>} /><Divider /></>}
                {bug.os_version  && <><InfoRow label="OS"      value={<Typography variant="caption">{bug.os_version}</Typography>} /><Divider /></>}
                {bug.browser     && <><InfoRow label="Browser" value={<Typography variant="caption">{bug.browser}</Typography>} /><Divider /></>}
                {bug.app_version && <><InfoRow label="App v"   value={<Typography variant="caption">{bug.app_version}</Typography>} /><Divider /></>}
                {bug.build_number && <InfoRow label="Build"   value={<Typography variant="caption">{bug.build_number}</Typography>} />}
              </CardContent>
            </Card>
          )}

          {/* Retesting info */}
          {(bug.retested_by || bug.retested_at) && (
            <Card sx={{ mb: 2, borderLeft: '4px solid #8B5CF6' }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} color="secondary" mb={1}>Retest Info</Typography>
                {bug.retester && <InfoRow label="Tester" value={<Typography variant="caption">{bug.retester.full_name}</Typography>} />}
                {bug.retested_at && <InfoRow label="Date" value={<Typography variant="caption">{formatDate(bug.retested_at)}</Typography>} />}
              </CardContent>
            </Card>
          )}

          {/* Quick actions */}
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={1.5}>Actions</Typography>
              <Stack spacing={1}>
                <Button size="small" variant="outlined" startIcon={<PersonAddIcon />} onClick={() => setEditOpen(true)} fullWidth>
                  Assign Developer
                </Button>
                <Button size="small" variant="outlined" startIcon={<LinkIcon />} onClick={() => setLinkOpen(true)} fullWidth>
                  Link Related Bug
                </Button>
                {(bug.status === 'in_progress' || bug.status === 'assigned') && isDeveloper && (
                  <Button size="small" variant="outlined" color="success" startIcon={<CodeIcon />} onClick={() => setResolutionOpen(true)} fullWidth>
                    Submit Fix
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Dialogs */}
      <ResolutionDialog open={resolutionOpen} onClose={() => setResolutionOpen(false)} bugId={id!} />
      <RelationshipDialog open={linkOpen} onClose={() => setLinkOpen(false)} bugId={id!} projectId={bug.project_id} />

      {/* Fail Retest Dialog */}
      <Dialog open={failRetestOpen} onClose={() => setFailRetestOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Retest Failed</DialogTitle>
        <DialogContent sx={{ mt: 1 }}>
          <Alert severity="warning" sx={{ mb: 2 }}>The bug will be returned to <strong>In Progress</strong> status and the developer will be notified.</Alert>
          <TextField label="Failure Notes" value={failRetestNotes} onChange={e => setFailRetestNotes(e.target.value)} fullWidth multiline rows={3} placeholder="Describe what still fails…" />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFailRetestOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" disabled={failRetestMutation.isPending} onClick={() => failRetestMutation.mutate()}>
            {failRetestMutation.isPending ? 'Returning…' : 'Return to Developer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Generic confirm */}
      {confirmAction && (
        <ConfirmDialog
          open
          title={confirmAction.label}
          message={confirmAction.message}
          confirmLabel={confirmAction.label}
          onConfirm={async () => { await confirmAction.action(); setConfirmAction(null); }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </Box>
  );
}
