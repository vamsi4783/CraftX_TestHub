import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Button, LinearProgress,
  Tabs, Tab, Divider, Stack, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, FormControl, InputLabel, Select, MenuItem,
  Alert, Checkbox, FormControlLabel, Avatar, Tooltip, Table, TableBody,
  TableCell, TableHead, TableRow,
} from '@mui/material';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import BugReportIcon from '@mui/icons-material/BugReport';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import ArticleIcon from '@mui/icons-material/Article';
import AndroidIcon from '@mui/icons-material/Android';
import AppleIcon from '@mui/icons-material/Apple';
import LanguageIcon from '@mui/icons-material/Language';
import VerifiedIcon from '@mui/icons-material/Verified';
import CancelIcon from '@mui/icons-material/Cancel';
import HourglassIcon from '@mui/icons-material/HourglassEmpty';
import WarningIcon from '@mui/icons-material/Warning';
import { releaseService } from '@/services/releaseService';
import { bugService } from '@/services/bugService';
import { testCaseService } from '@/services/testCaseService';
import { testSessionService } from '@/services/testSessionService';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusChip } from '@/components/common/StatusChip';
import { SeverityChip } from '@/components/common/SeverityChip';
import { LoadingState } from '@/components/common/LoadingState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { toastSuccess, toastError } from '@/lib/errors';
import { formatDate, timeAgo, getInitials } from '@/lib/utils';
import type { ReadinessVerdict, ReleaseBuildPlatform, ReleaseDocType, QAApprovalChecklist } from '@/types';

// ── Constants ───────────────────────────────────────────────────────────────

const VERDICT_CONFIG: Record<ReadinessVerdict, { label: string; color: string }> = {
  not_ready:         { label: '🔴 NOT READY',         color: '#EF4444' },
  ready_with_risks:  { label: '🟡 READY WITH RISKS',  color: '#F59E0B' },
  ready_for_release: { label: '🟢 READY FOR RELEASE', color: '#10B981' },
};

const PLATFORM_ICON: Record<ReleaseBuildPlatform, React.ReactNode> = {
  android_apk: <AndroidIcon />, android_aab: <AndroidIcon />,
  ios_ipa: <AppleIcon />, web: <LanguageIcon />,
  desktop: <ArticleIcon />, other: <ArticleIcon />,
};

const PLATFORM_LABEL: Record<ReleaseBuildPlatform, string> = {
  android_apk: 'Android APK', android_aab: 'Android AAB',
  ios_ipa: 'iOS IPA', web: 'Web Build',
  desktop: 'Desktop', other: 'Other',
};

const DOC_TYPE_LABEL: Record<ReleaseDocType, string> = {
  user_manual: 'User Manual', developer_handbook: 'Developer Handbook',
  qa_guide: 'QA Guide', release_notes: 'Release Notes',
  known_issues: 'Known Issues', test_report: 'Test Report',
  changelog: 'Changelog', other: 'Other',
};

const CHECKLIST_LABELS: Record<keyof QAApprovalChecklist, string> = {
  critical_bugs_closed:       'All critical bugs are closed',
  required_tests_executed:    'All required tests executed',
  coverage_target_reached:    'Coverage target reached (≥80%)',
  no_blocked_tests:           'No blocked or skipped tests',
  release_notes_completed:    'Release notes completed',
  known_issues_documented:    'Known issues documented',
  regression_passed:          'Regression suite passed',
};

function FileSizeLabel({ bytes }: { bytes: number | null }) {
  if (!bytes) return <>—</>;
  if (bytes < 1024) return <>{bytes} B</>;
  if (bytes < 1048576) return <>{(bytes / 1024).toFixed(0)} KB</>;
  return <>{(bytes / 1048576).toFixed(1)} MB</>;
}

// ── Add Build Dialog ────────────────────────────────────────────────────────

function AddBuildDialog({ open, onClose, releaseId }: { open: boolean; onClose: () => void; releaseId: string }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [platform, setPlatform] = useState<ReleaseBuildPlatform>('android_apk');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [version, setVersion] = useState('');
  const [buildNumber, setBuildNumber] = useState('');
  const [checksum, setChecksum] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () => releaseService.addBuild({
      release_id: releaseId, platform, file_url: fileUrl, file_name: fileName || fileUrl.split('/').pop() || 'build',
      version, build_number: buildNumber || null, checksum: checksum || null,
      notes: notes || null, uploaded_by: profile!.id, is_latest: true, file_size: null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['release-builds', releaseId] });
      toastSuccess('Build added');
      onClose();
    },
    onError: e => toastError(e),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Build</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        <Alert severity="info" sx={{ py: 0.5 }}>Upload your build file to Supabase Storage first, then paste the URL here.</Alert>
        <FormControl fullWidth size="small" required>
          <InputLabel>Platform</InputLabel>
          <Select label="Platform" value={platform} onChange={e => setPlatform(e.target.value as ReleaseBuildPlatform)}>
            {(Object.keys(PLATFORM_LABEL) as ReleaseBuildPlatform[]).map(p => (
              <MenuItem key={p} value={p}>{PLATFORM_LABEL[p]}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField label="File URL *" value={fileUrl} onChange={e => setFileUrl(e.target.value)} fullWidth size="small" placeholder="https://…/app-release.apk" />
        <TextField label="File Name" value={fileName} onChange={e => setFileName(e.target.value)} fullWidth size="small" placeholder="app-release-v2.1.0.apk" />
        <Grid container spacing={2}>
          <Grid item xs={6}><TextField label="Version *" value={version} onChange={e => setVersion(e.target.value)} fullWidth size="small" placeholder="2.1.0" /></Grid>
          <Grid item xs={6}><TextField label="Build Number" value={buildNumber} onChange={e => setBuildNumber(e.target.value)} fullWidth size="small" placeholder="2100" /></Grid>
        </Grid>
        <TextField label="SHA-256 Checksum" value={checksum} onChange={e => setChecksum(e.target.value)} fullWidth size="small" placeholder="Optional" />
        <TextField label="Notes" value={notes} onChange={e => setNotes(e.target.value)} fullWidth multiline rows={2} size="small" />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!fileUrl.trim() || !version.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Adding…' : 'Add Build'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Add Document Dialog ─────────────────────────────────────────────────────

function AddDocumentDialog({ open, onClose, releaseId }: { open: boolean; onClose: () => void; releaseId: string }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [docType, setDocType] = useState<ReleaseDocType>('release_notes');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [version, setVersion] = useState('');

  const mutation = useMutation({
    mutationFn: () => releaseService.addDocument({
      release_id: releaseId, doc_type: docType, name, description: description || null,
      file_url: fileUrl, file_name: fileName || fileUrl.split('/').pop() || 'document',
      version: version || null, uploaded_by: profile!.id, file_size: null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['release-docs', releaseId] });
      toastSuccess('Document added');
      onClose();
    },
    onError: e => toastError(e),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Document</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        <FormControl fullWidth size="small" required>
          <InputLabel>Document Type</InputLabel>
          <Select label="Document Type" value={docType} onChange={e => setDocType(e.target.value as ReleaseDocType)}>
            {(Object.keys(DOC_TYPE_LABEL) as ReleaseDocType[]).map(t => (
              <MenuItem key={t} value={t}>{DOC_TYPE_LABEL[t]}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField label="Document Name *" value={name} onChange={e => setName(e.target.value)} fullWidth size="small" />
        <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} fullWidth multiline rows={2} size="small" />
        <TextField label="File URL *" value={fileUrl} onChange={e => setFileUrl(e.target.value)} fullWidth size="small" placeholder="https://…/document.pdf" />
        <Grid container spacing={2}>
          <Grid item xs={8}><TextField label="File Name" value={fileName} onChange={e => setFileName(e.target.value)} fullWidth size="small" /></Grid>
          <Grid item xs={4}><TextField label="Version" value={version} onChange={e => setVersion(e.target.value)} fullWidth size="small" placeholder="v1" /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!name.trim() || !fileUrl.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Adding…' : 'Add Document'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── QA Approval Panel ───────────────────────────────────────────────────────

function QAApprovalPanel({ releaseId }: { releaseId: string }) {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const isQA = profile?.role === 'qa_tester' || isAdmin;

  const { data: approval } = useQuery({
    queryKey: ['qa-approval', releaseId],
    queryFn: () => releaseService.getApproval(releaseId),
  });

  const [notes, setNotes] = useState('');
  const [checklist, setChecklist] = useState<Partial<QAApprovalChecklist>>(
    approval?.checklist ?? {}
  );

  const CHECKLIST_KEYS = Object.keys(CHECKLIST_LABELS) as (keyof QAApprovalChecklist)[];
  const effectiveChecklist = { ...(approval?.checklist ?? {}), ...checklist } as QAApprovalChecklist;
  const allChecked = CHECKLIST_KEYS.every(k => effectiveChecklist[k]);

  const saveMutation = useMutation({
    mutationFn: (status: string | undefined) => releaseService.upsertApproval(releaseId, {
      checklist, notes: notes || approval?.notes || undefined, status,
      approved_by: status ? profile!.id : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qa-approval', releaseId] });
      toastSuccess('Approval updated');
    },
    onError: e => toastError(e),
  });

  const STATUS_CONFIG = {
    pending:             { label: 'Pending Review', color: '#9CA3AF', icon: <HourglassIcon /> },
    approved:            { label: 'Approved ✓',     color: '#10B981', icon: <VerifiedIcon /> },
    rejected:            { label: 'Rejected ✗',     color: '#EF4444', icon: <CancelIcon /> },
    needs_more_testing:  { label: 'More Testing Needed', color: '#F59E0B', icon: <WarningIcon /> },
  };

  const sc = STATUS_CONFIG[approval?.status ?? 'pending'];

  return (
    <Box>
      {/* Status banner */}
      <Card sx={{ mb: 3, borderLeft: `4px solid ${sc.color}` }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={2}>
            <Box sx={{ color: sc.color }}>{sc.icon}</Box>
            <Box flex={1}>
              <Typography variant="h6" fontWeight={700} sx={{ color: sc.color }}>{sc.label}</Typography>
              {approval?.approver && (
                <Typography variant="caption" color="text.secondary">
                  By {approval.approver.full_name} · {approval.action_taken_at ? formatDate(approval.action_taken_at) : ''}
                </Typography>
              )}
            </Box>
            {isQA && approval?.status === 'approved' && (
              <Chip label="Re-evaluate" size="small" onClick={() => saveMutation.mutate('pending')} />
            )}
          </Box>
          {approval?.notes && (
            <Alert severity="info" sx={{ mt: 1.5, py: 0.5 }}>
              <Typography variant="caption">{approval.notes}</Typography>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {/* Checklist */}
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={2}>QA Readiness Checklist</Typography>
              {CHECKLIST_KEYS.map(key => (
                <Box key={key} display="flex" alignItems="center" gap={1} py={0.75}>
                  <Checkbox
                    size="small"
                    checked={effectiveChecklist[key] ?? false}
                    onChange={e => setChecklist(prev => ({ ...prev, [key]: e.target.checked }))}
                    disabled={!isQA}
                    sx={{ p: 0.25 }}
                  />
                  <Typography variant="body2" sx={{ opacity: effectiveChecklist[key] ? 1 : 0.6 }}>
                    {CHECKLIST_LABELS[key]}
                  </Typography>
                  {effectiveChecklist[key] && <CheckCircleIcon sx={{ fontSize: 14, color: '#10B981', ml: 'auto' }} />}
                </Box>
              ))}
              <Divider sx={{ my: 1.5 }} />
              <Box display="flex" alignItems="center" gap={1}>
                <LinearProgress
                  variant="determinate"
                  value={(CHECKLIST_KEYS.filter(k => effectiveChecklist[k]).length / CHECKLIST_KEYS.length) * 100}
                  sx={{ flex: 1, height: 8, borderRadius: 4 }}
                  color={allChecked ? 'success' : 'primary'}
                />
                <Typography variant="caption" fontWeight={700}>
                  {CHECKLIST_KEYS.filter(k => effectiveChecklist[k]).length}/{CHECKLIST_KEYS.length}
                </Typography>
              </Box>
              {isQA && (
                <Button variant="outlined" size="small" sx={{ mt: 1.5 }} onClick={() => saveMutation.mutate(undefined)} disabled={saveMutation.isPending}>
                  Save Checklist
                </Button>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Approval actions */}
        {isQA && (
          <Grid item xs={12} md={5}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} mb={2}>QA Decision</Typography>
                <TextField
                  label="Notes / Remarks"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  fullWidth multiline rows={3} size="small" sx={{ mb: 2 }}
                  placeholder="Conditions, risks, or blockers…"
                />
                <Stack spacing={1}>
                  <Button
                    variant="contained" color="success" startIcon={<VerifiedIcon />} fullWidth
                    disabled={!allChecked || saveMutation.isPending}
                    onClick={() => saveMutation.mutate('approved')}
                  >
                    Approve Release
                  </Button>
                  <Button
                    variant="outlined" color="warning" startIcon={<WarningIcon />} fullWidth
                    disabled={saveMutation.isPending}
                    onClick={() => saveMutation.mutate('needs_more_testing')}
                  >
                    Needs More Testing
                  </Button>
                  <Button
                    variant="outlined" color="error" startIcon={<CancelIcon />} fullWidth
                    disabled={saveMutation.isPending}
                    onClick={() => saveMutation.mutate('rejected')}
                  >
                    Reject Release
                  </Button>
                </Stack>
                {!allChecked && (
                  <Alert severity="warning" sx={{ mt: 1.5, py: 0.5 }}>
                    <Typography variant="caption">Complete all checklist items before approving.</Typography>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function ReleaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);
  const [buildDialogOpen, setBuildDialogOpen] = useState(false);
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [deleteBuild, setDeleteBuild] = useState<string | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<string | null>(null);

  const canManage = profile?.role === 'administrator' || profile?.role === 'developer';

  const { data: release, isLoading } = useQuery({ queryKey: ['release', id], queryFn: () => releaseService.get(id!), enabled: !!id });
  const { data: readiness } = useQuery({ queryKey: ['release-readiness', id], queryFn: () => releaseService.getReadiness(id!), enabled: !!id, refetchInterval: 30_000 });
  const { data: bugs = [] } = useQuery({ queryKey: ['bugs-release', id], queryFn: () => bugService.list('%', { release_id: id }), enabled: !!id });
  const { data: assignments = [] } = useQuery({ queryKey: ['assignments', id], queryFn: () => testCaseService.getAssignments(id!), enabled: !!id });
  const { data: sessions = [] } = useQuery({ queryKey: ['sessions-release', id], queryFn: () => testSessionService.list({ release_id: id }), enabled: !!id });
  const { data: builds = [] } = useQuery({ queryKey: ['release-builds', id], queryFn: () => releaseService.getBuilds(id!), enabled: !!id });
  const { data: documents = [] } = useQuery({ queryKey: ['release-docs', id], queryFn: () => releaseService.getDocuments(id!), enabled: !!id });

  const deleteBuildMutation = useMutation({
    mutationFn: () => releaseService.deleteBuild(deleteBuild!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['release-builds', id] }); toastSuccess('Build deleted'); setDeleteBuild(null); },
    onError: e => toastError(e),
  });

  const deleteDocMutation = useMutation({
    mutationFn: () => releaseService.deleteDocument(deleteDoc!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['release-docs', id] }); toastSuccess('Document deleted'); setDeleteDoc(null); },
    onError: e => toastError(e),
  });

  if (isLoading || !release) return <LoadingState />;

  const openBugs = bugs.filter(b => !['closed','rejected','duplicate','wont_fix','cannot_reproduce'].includes(b.status));
  const criticalBugs = openBugs.filter(b => b.severity === 'critical');
  const highBugs = openBugs.filter(b => b.severity === 'high');
  const verdict = readiness?.verdict;
  const vc = verdict ? VERDICT_CONFIG[verdict] : null;

  return (
    <Box>
      <PageHeader
        title={release.name}
        subtitle={`v${release.version}${release.build_number ? ` · Build ${release.build_number}` : ''}`}
        breadcrumbs={[
          { label: 'Projects', to: '/projects' },
          { label: release.project?.name ?? '—', to: `/projects/${release.project_id}` },
          { label: release.name },
        ]}
        actions={
          <Button variant="outlined" size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>Back</Button>
        }
      />

      {/* Readiness banner */}
      {vc && (
        <Box sx={{ p: 2, mb: 3, borderRadius: 2, border: `2px solid ${vc.color}`, bgcolor: `${vc.color}11`, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6" fontWeight={800} color={vc.color}>{vc.label}</Typography>
          <Box flex={1} />
          <StatusChip status={release.status} />
          {release.start_date && <Chip label={`Start: ${formatDate(release.start_date)}`} size="small" variant="outlined" />}
          {release.end_date && <Chip label={`End: ${formatDate(release.end_date)}`} size="small" variant="outlined" />}
        </Box>
      )}

      {/* Metrics row */}
      {readiness && (
        <Grid container spacing={2} mb={3}>
          {[
            { label: 'Testing %',     value: `${readiness.testing_percentage}%`, bar: readiness.testing_percentage, color: '#4F46E5' },
            { label: 'Pass Rate',     value: `${readiness.pass_rate}%`,          bar: readiness.pass_rate,          color: '#10B981' },
            { label: 'Open Bugs',     value: openBugs.length,                    bar: null,                         color: openBugs.length > 0 ? '#EF4444' : '#10B981' },
            { label: 'Critical',      value: criticalBugs.length,               bar: null,                         color: criticalBugs.length > 0 ? '#7C3AED' : '#10B981' },
            { label: 'High',          value: highBugs.length,                   bar: null,                         color: highBugs.length > 0 ? '#F59E0B' : '#10B981' },
            { label: 'Tests Done',    value: `${readiness.completed_tests}/${readiness.total_tests}`, bar: readiness.testing_percentage, color: '#06B6D4' },
            { label: 'Sessions',      value: sessions.length,                   bar: null,                         color: '#8B5CF6' },
          ].map(m => (
            <Grid item xs={6} sm={4} md key={m.label}>
              <Card>
                <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                  <Typography variant="h5" fontWeight={800} color={m.color}>{m.value}</Typography>
                  <Typography variant="caption" color="text.secondary">{m.label}</Typography>
                  {m.bar !== null && (
                    <LinearProgress variant="determinate" value={m.bar} sx={{ mt: 0.75, height: 4, borderRadius: 2 }} />
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }} variant="scrollable">
        <Tab label={`Sessions (${sessions.length})`} icon={<AssignmentIcon />} iconPosition="start" />
        <Tab label={`Bugs (${openBugs.length} open)`} icon={<BugReportIcon />} iconPosition="start" />
        <Tab label={`Builds (${builds.length})`} icon={<RocketLaunchIcon />} iconPosition="start" />
        <Tab label={`Documents (${documents.length})`} icon={<ArticleIcon />} iconPosition="start" />
        <Tab label="QA Sign-off" icon={<VerifiedIcon />} iconPosition="start" />
        <Tab label="Release Notes" icon={<ArticleIcon />} iconPosition="start" />
      </Tabs>

      {/* Tab 0: Sessions */}
      {tab === 0 && (
        <Box>
          {sessions.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>No test sessions for this release.</Typography>
          ) : (
            <Card>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Session</TableCell>
                    <TableCell>Assignee</TableCell>
                    <TableCell>Progress</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sessions.map(s => (
                    <TableRow key={s.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/test-sessions/${s.id}`)}>
                      <TableCell><Typography variant="body2" fontWeight={600}>{s.name}</Typography></TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Avatar sx={{ width: 24, height: 24, fontSize: 11, bgcolor: 'primary.main' }}>{getInitials(s.assignee?.full_name)}</Avatar>
                          <Typography variant="caption">{s.assignee?.full_name ?? '—'}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ minWidth: 120 }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <LinearProgress variant="determinate" value={s.progress_pct} sx={{ flex: 1, height: 6, borderRadius: 3 }} />
                          <Typography variant="caption">{s.progress_pct}%</Typography>
                        </Box>
                      </TableCell>
                      <TableCell><StatusChip status={s.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </Box>
      )}

      {/* Tab 1: Bugs */}
      {tab === 1 && (
        <Box>
          {/* Bug severity summary */}
          {bugs.length > 0 && (
            <Box display="flex" gap={1} mb={2} flexWrap="wrap">
              {[
                { label: 'Critical', count: bugs.filter(b => b.severity === 'critical' && !['closed','rejected'].includes(b.status)).length, color: '#7C3AED' },
                { label: 'High',     count: bugs.filter(b => b.severity === 'high'     && !['closed','rejected'].includes(b.status)).length, color: '#EF4444' },
                { label: 'Medium',   count: bugs.filter(b => b.severity === 'medium'   && !['closed','rejected'].includes(b.status)).length, color: '#F59E0B' },
                { label: 'Low',      count: bugs.filter(b => b.severity === 'low'      && !['closed','rejected'].includes(b.status)).length, color: '#10B981' },
                { label: 'Closed',   count: bugs.filter(b => ['closed','verified'].includes(b.status)).length, color: '#6B7280' },
              ].map(s => (
                <Chip key={s.label} label={`${s.label}: ${s.count}`} size="small"
                  sx={{ bgcolor: `${s.color}22`, color: s.color, fontWeight: 600, border: `1px solid ${s.color}44` }} />
              ))}
            </Box>
          )}
          {bugs.length === 0 ? (
            <Box textAlign="center" py={6}>
              <CheckCircleIcon sx={{ fontSize: 56, color: 'success.main', mb: 1 }} />
              <Typography variant="body1" fontWeight={600}>No bugs for this release 🎉</Typography>
            </Box>
          ) : (
            <Card>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Title</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Assignee</TableCell>
                    <TableCell>Updated</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bugs.map(bug => (
                    <TableRow key={bug.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/bugs/${bug.id}`)}>
                      <TableCell><Typography variant="caption" fontFamily="monospace" color="primary.main">{bug.bug_id}</Typography></TableCell>
                      <TableCell><Typography variant="body2" noWrap sx={{ maxWidth: 280 }}>{bug.title}</Typography></TableCell>
                      <TableCell><SeverityChip value={bug.severity} /></TableCell>
                      <TableCell><StatusChip status={bug.status} /></TableCell>
                      <TableCell><Typography variant="caption">{bug.assignee?.full_name ?? '—'}</Typography></TableCell>
                      <TableCell><Typography variant="caption" color="text.secondary">{timeAgo(bug.updated_at)}</Typography></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </Box>
      )}

      {/* Tab 2: Builds */}
      {tab === 2 && (
        <Box>
          {canManage && (
            <Button variant="contained" startIcon={<AddIcon />} size="small" sx={{ mb: 2 }} onClick={() => setBuildDialogOpen(true)}>
              Add Build
            </Button>
          )}
          {builds.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>No builds uploaded yet.</Typography>
          ) : (
            <Grid container spacing={2}>
              {builds.map(build => (
                <Grid item xs={12} sm={6} md={4} key={build.id}>
                  <Card sx={{ position: 'relative', border: build.is_latest ? '2px solid #4F46E5' : undefined }}>
                    {build.is_latest && <Chip label="LATEST" size="small" color="primary" sx={{ position: 'absolute', top: 8, right: 8, fontSize: 10 }} />}
                    <CardContent>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <Box sx={{ color: 'text.secondary' }}>{PLATFORM_ICON[build.platform]}</Box>
                        <Typography variant="subtitle2" fontWeight={700}>{PLATFORM_LABEL[build.platform]}</Typography>
                      </Box>
                      <Typography variant="caption" display="block" color="text.secondary" mb={0.5}>
                        v{build.version}{build.build_number ? ` (${build.build_number})` : ''} · <FileSizeLabel bytes={build.file_size} />
                      </Typography>
                      {build.notes && <Typography variant="caption" color="text.secondary" display="block" mb={1}>{build.notes}</Typography>}
                      {build.checksum && (
                        <Typography variant="caption" color="text.disabled" display="block" noWrap sx={{ fontFamily: 'monospace', fontSize: 10 }}>{build.checksum}</Typography>
                      )}
                      <Box display="flex" gap={1} mt={1.5}>
                        <Button size="small" variant="outlined" startIcon={<DownloadIcon />} href={build.file_url} target="_blank" rel="noreferrer" sx={{ flex: 1 }}>
                          Download
                        </Button>
                        {canManage && (
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => setDeleteBuild(build.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                      <Typography variant="caption" color="text.disabled" display="block" mt={0.75}>
                        {build.uploader?.full_name} · {timeAgo(build.created_at)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* Tab 3: Documents */}
      {tab === 3 && (
        <Box>
          {canManage && (
            <Button variant="contained" startIcon={<AddIcon />} size="small" sx={{ mb: 2 }} onClick={() => setDocDialogOpen(true)}>
              Add Document
            </Button>
          )}
          {documents.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>No documents uploaded yet.</Typography>
          ) : (
            <Box display="flex" flexDirection="column" gap={1}>
              {documents.map(doc => (
                <Card key={doc.id} variant="outlined">
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box display="flex" alignItems="center" gap={1.5}>
                      <ArticleIcon color="action" />
                      <Box flex={1}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="body2" fontWeight={600}>{doc.name}</Typography>
                          <Chip label={DOC_TYPE_LABEL[doc.doc_type]} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                          {doc.version && <Chip label={doc.version} size="small" sx={{ fontSize: 10 }} />}
                        </Box>
                        {doc.description && <Typography variant="caption" color="text.secondary">{doc.description}</Typography>}
                        <Typography variant="caption" color="text.disabled" display="block">
                          {doc.uploader?.full_name} · {timeAgo(doc.created_at)} · <FileSizeLabel bytes={doc.file_size} />
                        </Typography>
                      </Box>
                      <Button size="small" href={doc.file_url} target="_blank" rel="noreferrer" startIcon={<DownloadIcon />}>Open</Button>
                      {canManage && (
                        <IconButton size="small" color="error" onClick={() => setDeleteDoc(doc.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Tab 4: QA Sign-off */}
      {tab === 4 && <QAApprovalPanel releaseId={id!} />}

      {/* Tab 5: Release Notes */}
      {tab === 5 && (
        <Grid container spacing={2}>
          {release.release_notes && (
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} mb={1.5}>Release Notes</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{release.release_notes}</Typography>
                </CardContent>
              </Card>
            </Grid>
          )}
          {release.known_issues && (
            <Grid item xs={12} md={6}>
              <Card sx={{ borderLeft: '4px solid #F59E0B' }}>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} mb={1.5} color="warning.main">Known Issues</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{release.known_issues}</Typography>
                </CardContent>
              </Card>
            </Grid>
          )}
          {!release.release_notes && !release.known_issues && (
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>No release notes yet.</Typography>
            </Grid>
          )}
        </Grid>
      )}

      {/* Dialogs */}
      {buildDialogOpen && <AddBuildDialog open onClose={() => setBuildDialogOpen(false)} releaseId={id!} />}
      {docDialogOpen && <AddDocumentDialog open onClose={() => setDocDialogOpen(false)} releaseId={id!} />}

      <ConfirmDialog
        open={!!deleteBuild}
        title="Delete Build"
        message="Delete this build artifact? The file URL will no longer be accessible through the platform."
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={() => deleteBuildMutation.mutate()}
        onCancel={() => setDeleteBuild(null)}
      />
      <ConfirmDialog
        open={!!deleteDoc}
        title="Delete Document"
        message="Delete this document? This cannot be undone."
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={() => deleteDocMutation.mutate()}
        onCancel={() => setDeleteDoc(null)}
      />
    </Box>
  );
}
