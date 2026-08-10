import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Tabs, Tab, Grid, Card, CardContent, Typography, Button, Chip, LinearProgress, CircularProgress, Avatar, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, InputLabel, FormControl } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PeopleIcon from '@mui/icons-material/People';
import GitHubIcon from '@mui/icons-material/GitHub';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { projectService } from '@/services/projectService';
import { releaseService } from '@/services/releaseService';
import { bugService } from '@/services/bugService';
import { testCaseService } from '@/services/testCaseService';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingState } from '@/components/common/LoadingState';
import { StatusChip } from '@/components/common/StatusChip';
import { SeverityChip } from '@/components/common/SeverityChip';
import { PLATFORM_ICONS, PLATFORM_LABELS, formatDate } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

function StatBadge({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Box textAlign="center" p={2}>
      <Typography variant="h4" fontWeight={800} color={color ?? 'text.primary'}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);
  const [releaseSaving, setReleaseSaving] = useState(false);
  const [releaseForm, setReleaseForm] = useState({ name: '', version: '', build_number: '', status: 'planning', description: '', start_date: '', end_date: '' });

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectService.get(id!),
    enabled: !!id,
  });

  const { data: releases = [] } = useQuery({
    queryKey: ['releases', id],
    queryFn: () => releaseService.list(id!),
    enabled: !!id,
  });

  const { data: bugs = [] } = useQuery({
    queryKey: ['bugs', id],
    queryFn: () => bugService.list(id!),
    enabled: !!id,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['project-members', id],
    queryFn: () => projectService.getMembers(id!),
    enabled: !!id,
  });

  const { data: testCases = [] } = useQuery({
    queryKey: ['test-cases', id],
    queryFn: () => testCaseService.list(id!),
    enabled: !!id,
  });

  if (isLoading || !project) return <LoadingState />;

  async function handleCreateRelease() {
    if (!releaseForm.name || !releaseForm.version) return;
    setReleaseSaving(true);
    try {
      await releaseService.create({
        project_id: id!,
        name: releaseForm.name,
        version: releaseForm.version,
        build_number: releaseForm.build_number || undefined,
        description: releaseForm.description || undefined,
        start_date: releaseForm.start_date || undefined,
        end_date: releaseForm.end_date || undefined,
        created_by: user!.id,
      });
      await queryClient.invalidateQueries({ queryKey: ['releases', id] });
      setReleaseDialogOpen(false);
      setReleaseForm({ name: '', version: '', build_number: '', status: 'planning', description: '', start_date: '', end_date: '' });
    } finally {
      setReleaseSaving(false);
    }
  }

  const openBugs = bugs.filter(b => !['closed','rejected','duplicate'].includes(b.status));
  const criticalBugs = openBugs.filter(b => b.severity === 'critical');
  const activeReleases = releases.filter(r => r.status === 'testing');

  return (
    <Box>
      <PageHeader
        title={project.name}
        subtitle={`${PLATFORM_ICONS[project.platform]} ${PLATFORM_LABELS[project.platform]} · v${project.version}`}
        breadcrumbs={[{ label: 'Projects', to: '/projects' }, { label: project.name }]}
        showBack
        actions={
          <>
            {project.repository_url && (
              <Button variant="outlined" size="small" startIcon={<GitHubIcon />} href={project.repository_url} target="_blank">
                Repository
              </Button>
            )}
            <Button variant="contained" size="small" startIcon={<RocketLaunchIcon />} onClick={() => navigate(`/projects/${id}/releases`)}>
              Releases
            </Button>
          </>
        }
      />

      {/* Color header */}
      <Box sx={{ height: 6, borderRadius: 3, bgcolor: project.color, mb: 3 }} />

      {/* Quick stats */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={8}>
          <Card>
            <Box display="flex" flexWrap="wrap">
              <StatBadge label="Total Releases"  value={releases.length} />
              <StatBadge label="Active Releases" value={activeReleases.length} color="primary.main" />
              <StatBadge label="Open Bugs"       value={openBugs.length}   color="error.main" />
              <StatBadge label="Critical Bugs"   value={criticalBugs.length} color="#7C3AED" />
              <StatBadge label="Team Members"    value={members.length} />
            </Box>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>Project Info</Typography>
              <Box display="flex" flexDirection="column" gap={0.75}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">Status</Typography>
                  <StatusChip status={project.status} />
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">Platform</Typography>
                  <Typography variant="caption">{PLATFORM_LABELS[project.platform]}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">Owner</Typography>
                  <Typography variant="caption">{project.owner?.full_name}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label={`Releases (${releases.length})`} icon={<RocketLaunchIcon />} iconPosition="start" />
        <Tab label={`Bugs (${openBugs.length})`} icon={<BugReportIcon />} iconPosition="start" />
        <Tab label={`Testing (${testCases.length})`} icon={<AssignmentIcon />} iconPosition="start" />
        <Tab label={`Team (${members.length})`} icon={<PeopleIcon />} iconPosition="start" />
      </Tabs>

      {/* Releases tab */}
      {tab === 0 && (
        <Box>
          <Box display="flex" justifyContent="flex-end" mb={2}>
            <Button variant="contained" size="small" startIcon={<RocketLaunchIcon />} onClick={() => setReleaseDialogOpen(true)}>
              New Release
            </Button>
          </Box>
          {releases.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>No releases yet.</Typography>
          ) : (
            <Grid container spacing={2}>
              {releases.map(r => (
                <Grid item xs={12} sm={6} md={4} key={r.id}>
                  <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 4 } }} onClick={() => navigate(`/releases/${r.id}`)}>
                    <CardContent>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                        <Box>
                          <Typography variant="subtitle2" fontWeight={700}>{r.name}</Typography>
                          <Typography variant="caption" color="text.secondary">v{r.version}{r.build_number ? ` · Build ${r.build_number}` : ''}</Typography>
                        </Box>
                        <StatusChip status={r.status} />
                      </Box>
                      {r.start_date && <Typography variant="caption" color="text.secondary">{formatDate(r.start_date)} — {formatDate(r.end_date)}</Typography>}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* Bugs tab */}
      {tab === 1 && (
        <Box>
          <Box display="flex" justifyContent="flex-end" mb={2}>
            <Button variant="contained" color="error" size="small" startIcon={<BugReportIcon />} onClick={() => navigate(`/bugs/new?project=${id}`)}>
              Report Bug
            </Button>
          </Box>
          {openBugs.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>No open bugs 🎉</Typography>
          ) : (
            <Box display="flex" flexDirection="column" gap={1}>
              {openBugs.slice(0, 10).map(bug => (
                <Card key={bug.id} sx={{ cursor: 'pointer', '&:hover': { boxShadow: 2 } }} onClick={() => navigate(`/bugs/${bug.id}`)}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box display="flex" alignItems="center" gap={1.5}>
                      <Typography variant="caption" color="text.disabled" fontWeight={700} sx={{ minWidth: 80 }}>{bug.bug_id}</Typography>
                      <Typography variant="body2" fontWeight={500} flex={1} noWrap>{bug.title}</Typography>
                      <SeverityChip value={bug.severity} />
                      <StatusChip status={bug.status} />
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Testing tab */}
      {tab === 2 && (
        <Box>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
            <Box>
              <Typography variant="h6" fontWeight={700}>Testing Hub</Typography>
              <Typography variant="body2" color="text.secondary">
                {testCases.length === 0
                  ? 'No test cases yet. Index this project and generate tests to get started.'
                  : `${testCases.length} test case${testCases.length !== 1 ? 's' : ''} · Use the actions below to grow your test suite.`}
              </Typography>
            </Box>
            {testCases.length > 0 && (
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                onClick={() => navigate(`/test-executions/new?project=${id}`)}
              >
                Run Tests
              </Button>
            )}
          </Box>

          <Grid container spacing={2} mb={3}>
            <Grid item xs={12} sm={6} md={3}>
              <Card
                sx={{ cursor: 'pointer', '&:hover': { boxShadow: 4 }, height: '100%' }}
                onClick={() => navigate(`/project-intelligence/${id}`)}
              >
                <CardContent sx={{ textAlign: 'center', py: 3 }}>
                  <AccountTreeIcon sx={{ fontSize: 36, color: 'primary.main', mb: 1 }} />
                  <Typography variant="subtitle2" fontWeight={700}>Understand Project</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Index source code to enable AI-powered analysis
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card
                sx={{ cursor: 'pointer', '&:hover': { boxShadow: 4 }, height: '100%' }}
                onClick={() => navigate(`/ai-test-generator?project=${id}`)}
              >
                <CardContent sx={{ textAlign: 'center', py: 3 }}>
                  <AutoAwesomeIcon sx={{ fontSize: 36, color: 'secondary.main', mb: 1 }} />
                  <Typography variant="subtitle2" fontWeight={700}>Generate Tests</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Use AI to generate test cases from project intelligence
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card
                sx={{ cursor: 'pointer', '&:hover': { boxShadow: 4 }, height: '100%' }}
                onClick={() => navigate(`/ai-test-generator?project=${id}&mode=import`)}
              >
                <CardContent sx={{ textAlign: 'center', py: 3 }}>
                  <UploadFileIcon sx={{ fontSize: 36, color: 'info.main', mb: 1 }} />
                  <Typography variant="subtitle2" fontWeight={700}>Import JSON</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Bulk import test cases from a JSON file
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card
                sx={{ cursor: 'pointer', '&:hover': { boxShadow: 4 }, height: '100%' }}
                onClick={() => navigate(`/test-cases?project=${id}`)}
              >
                <CardContent sx={{ textAlign: 'center', py: 3 }}>
                  <AssignmentIcon sx={{ fontSize: 36, color: 'success.main', mb: 1 }} />
                  <Typography variant="subtitle2" fontWeight={700}>View Test Cases</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {testCases.length} test case{testCases.length !== 1 ? 's' : ''} in this project
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {testCases.length > 0 && (
            <Box>
              <Typography variant="subtitle2" fontWeight={600} mb={1.5}>Recent Test Cases</Typography>
              <Box display="flex" flexDirection="column" gap={1}>
                {testCases.slice(0, 5).map(tc => (
                  <Card
                    key={tc.id}
                    sx={{ cursor: 'pointer', '&:hover': { boxShadow: 2 } }}
                    onClick={() => navigate(`/test-cases/${tc.id}`)}
                  >
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box display="flex" alignItems="center" gap={1.5}>
                        <Typography variant="body2" fontWeight={500} flex={1} noWrap>{tc.title}</Typography>
                        <Chip label={tc.priority} size="small" color={tc.priority === 'high' ? 'error' : tc.priority === 'medium' ? 'warning' : 'default'} variant="outlined" />
                        <StatusChip status={tc.status} />
                      </Box>
                    </CardContent>
                  </Card>
                ))}
                {testCases.length > 5 && (
                  <Button variant="text" size="small" onClick={() => navigate(`/test-cases?project=${id}`)}>
                    View all {testCases.length} test cases →
                  </Button>
                )}
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* Team tab */}
      {tab === 3 && (
        <Grid container spacing={2}>
          {members.map(m => (
            <Grid item xs={12} sm={6} md={3} key={m.id}>
              <Card>
                <CardContent sx={{ textAlign: 'center', py: 3 }}>
                  <Avatar sx={{ width: 48, height: 48, bgcolor: 'primary.main', mx: 'auto', mb: 1.5, fontWeight: 700 }}>
                    {(m.profile?.full_name ?? 'U')[0].toUpperCase()}
                  </Avatar>
                  <Typography variant="subtitle2" fontWeight={700}>{m.profile?.full_name}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">{m.profile?.email}</Typography>
                  <Chip label={m.role.replace('_',' ')} size="small" sx={{ mt: 1, textTransform: 'capitalize' }} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* New Release dialog */}
      <Dialog open={releaseDialogOpen} onClose={() => setReleaseDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Release</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} pt={1}>
            <TextField label="Release Name *" value={releaseForm.name} onChange={e => setReleaseForm(f => ({ ...f, name: e.target.value }))} fullWidth size="small" placeholder="e.g. Release Candidate 2" />
            <TextField label="Version *" value={releaseForm.version} onChange={e => setReleaseForm(f => ({ ...f, version: e.target.value }))} fullWidth size="small" placeholder="e.g. 2.1.0" />
            <TextField label="Build Number" value={releaseForm.build_number} onChange={e => setReleaseForm(f => ({ ...f, build_number: e.target.value }))} fullWidth size="small" placeholder="e.g. 200101" />
            <TextField label="Description" value={releaseForm.description} onChange={e => setReleaseForm(f => ({ ...f, description: e.target.value }))} fullWidth size="small" multiline rows={2} />
            <Box display="flex" gap={2}>
              <TextField label="Start Date" type="date" value={releaseForm.start_date} onChange={e => setReleaseForm(f => ({ ...f, start_date: e.target.value }))} fullWidth size="small" InputLabelProps={{ shrink: true }} />
              <TextField label="End Date" type="date" value={releaseForm.end_date} onChange={e => setReleaseForm(f => ({ ...f, end_date: e.target.value }))} fullWidth size="small" InputLabelProps={{ shrink: true }} />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReleaseDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateRelease} disabled={!releaseForm.name || !releaseForm.version || releaseSaving}>
            {releaseSaving ? 'Creating…' : 'Create Release'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
