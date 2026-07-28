import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box, Tabs, Tab, Grid, Card, CardContent, Typography, Button, Chip, LinearProgress, CircularProgress, Avatar } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PeopleIcon from '@mui/icons-material/People';
import GitHubIcon from '@mui/icons-material/GitHub';
import { projectService } from '@/services/projectService';
import { releaseService } from '@/services/releaseService';
import { bugService } from '@/services/bugService';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingState } from '@/components/common/LoadingState';
import { StatusChip } from '@/components/common/StatusChip';
import { SeverityChip } from '@/components/common/SeverityChip';
import { PLATFORM_ICONS, PLATFORM_LABELS, formatDate } from '@/lib/utils';

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

  if (isLoading || !project) return <LoadingState />;

  const openBugs = bugs.filter(b => !['closed','rejected','duplicate'].includes(b.status));
  const criticalBugs = openBugs.filter(b => b.severity === 'critical');
  const activeReleases = releases.filter(r => r.status === 'testing');

  return (
    <Box>
      <PageHeader
        title={project.name}
        subtitle={`${PLATFORM_ICONS[project.platform]} ${PLATFORM_LABELS[project.platform]} · v${project.version}`}
        breadcrumbs={[{ label: 'Projects', to: '/projects' }, { label: project.name }]}
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
        <Tab label={`Team (${members.length})`} icon={<PeopleIcon />} iconPosition="start" />
      </Tabs>

      {/* Releases tab */}
      {tab === 0 && (
        <Box>
          <Box display="flex" justifyContent="flex-end" mb={2}>
            <Button variant="contained" size="small" startIcon={<RocketLaunchIcon />} onClick={() => navigate(`/projects/${id}/releases/new`)}>
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

      {/* Team tab */}
      {tab === 2 && (
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
    </Box>
  );
}
