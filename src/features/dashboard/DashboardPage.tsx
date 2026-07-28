import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Grid, Card, CardContent, Typography, List, ListItem, ListItemAvatar,
  ListItemText, Divider, Avatar, Chip, LinearProgress, FormControl,
  InputLabel, Select, MenuItem, Skeleton, Button,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import BugReportIcon from '@mui/icons-material/BugReport';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import LayersIcon from '@mui/icons-material/Layers';
import VerifiedIcon from '@mui/icons-material/Verified';
import AssignmentIcon from '@mui/icons-material/Assignment';
import BlockIcon from '@mui/icons-material/Block';
import ReplayIcon from '@mui/icons-material/Replay';
import PendingIcon from '@mui/icons-material/Pending';
import { analyticsService } from '@/services/analyticsService';
import { projectService } from '@/services/projectService';
import { useAuth } from '@/hooks/useAuth';
import { SeverityChip } from '@/components/common/SeverityChip';
import { StatusChip } from '@/components/common/StatusChip';
import { StatCard, ChartCard, TrendChart, DonutChart, VerticalBarChart, MultiBarChart, EmptyChart, CHART_COLORS } from '@/components/charts';
import { timeAgo, getInitials } from '@/lib/utils';

const ACTION_ICON: Record<string, React.ReactNode> = {
  created:   <BugReportIcon sx={{ fontSize: 16 }} />,
  approved:  <VerifiedIcon  sx={{ fontSize: 16 }} />,
  completed: <CheckCircleIcon sx={{ fontSize: 16 }} />,
  assigned:  <AssignmentIcon sx={{ fontSize: 16 }} />,
  updated:   <LayersIcon    sx={{ fontSize: 16 }} />,
};

export function DashboardPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [bugProject, setBugProject] = useState('');

  // ── Data ────────────────────────────────────────────────────────────────────

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectService.list() });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats-v2', profile?.id],
    queryFn: () => analyticsService.getDashboardStatsV2(profile!.id),
    enabled: !!profile,
    refetchInterval: 60_000,
  });

  const { data: bugTrend = [], isLoading: trendLoading } = useQuery({
    queryKey: ['bug-trend-dash', bugProject],
    queryFn: () => analyticsService.getBugTrend(bugProject, 30),
    enabled: !!bugProject,
  });

  const { data: bugDist, isLoading: distLoading } = useQuery({
    queryKey: ['bug-dist-dash', bugProject],
    queryFn: () => analyticsService.getBugDistribution(bugProject),
    enabled: !!bugProject,
  });

  const { data: releaseStatus = [], isLoading: releaseLoading } = useQuery({
    queryKey: ['release-status-dash', bugProject],
    queryFn: () => analyticsService.getReleaseStatusBreakdown(bugProject),
    enabled: !!bugProject,
  });

  const { data: testTrend = [], isLoading: testTrendLoading } = useQuery({
    queryKey: ['test-trend-dash', bugProject],
    queryFn: () => analyticsService.getTestTrend(bugProject, 14),
    enabled: !!bugProject,
  });

  const { data: activity = [], isLoading: activityLoading } = useQuery({
    queryKey: ['activity-feed'],
    queryFn: () => analyticsService.getActivityFeed(20),
    refetchInterval: 30_000,
  });

  const { data: myBugs = [] } = useQuery({
    queryKey: ['my-bugs-dash', profile?.id],
    queryFn: () => import('@/services/bugService').then(m => m.bugService.getMyBugs(profile!.id)),
    enabled: !!profile,
  });

  const { data: myRetests = [] } = useQuery({
    queryKey: ['my-retests-dash', profile?.id],
    queryFn: () => import('@/services/bugService').then(m => m.bugService.getRetestQueue(profile!.id)),
    enabled: !!profile,
  });

  // ── Derived ─────────────────────────────────────────────────────────────────

  const passRate = useMemo(() => {
    if (!stats || !stats.completed_tests) return 0;
    return Math.round((stats.passed_tests / stats.completed_tests) * 100);
  }, [stats]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const KPI_CARDS = [
    { label: 'Projects',       value: stats?.total_projects,    color: '#4F46E5', icon: <FolderIcon />,        path: '/projects' },
    { label: 'Active Releases',value: stats?.active_releases,   color: '#7C3AED', icon: <RocketLaunchIcon />,  path: '/releases' },
    { label: 'Active Sessions',value: stats?.active_sessions,   color: '#06B6D4', icon: <LayersIcon />,        path: '/test-sessions' },
    { label: 'Open Bugs',      value: stats?.open_bugs,         color: '#EF4444', icon: <BugReportIcon />,     path: '/bugs' },
    { label: 'Critical Bugs',  value: stats?.critical_bugs,     color: '#7C3AED', icon: <WarningAmberIcon />,  path: '/bugs' },
    { label: 'My Open Bugs',   value: stats?.my_open_bugs,      color: '#F59E0B', icon: <BugReportIcon />,     path: '/bugs' },
    { label: 'My Tests',       value: stats?.assigned_tests,    color: '#4F46E5', icon: <PlayCircleIcon />,    path: '/my-tests' },
    { label: 'Completed Tests',value: stats?.completed_tests,   color: '#10B981', icon: <CheckCircleIcon />,   path: '/my-tests' },
    { label: 'Blocked Tests',  value: stats?.blocked_tests,     color: '#EF4444', icon: <BlockIcon />,         path: '/my-tests' },
    { label: 'My Retest Queue',value: stats?.my_retest_queue,   color: '#F59E0B', icon: <ReplayIcon />,        path: '/bugs' },
    { label: 'QA Approvals',   value: stats?.qa_pending,        color: '#7C3AED', icon: <VerifiedIcon />,      path: '/releases' },
    { label: 'Pass Rate',      value: `${passRate}%`,           color: passRate >= 80 ? '#10B981' : '#F59E0B', icon: <CheckCircleIcon />, path: '/my-tests' },
  ];

  return (
    <Box>
      {/* Greeting */}
      <Box mb={3} display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5" fontWeight={800}>{greeting}, {profile?.full_name?.split(' ')[0] ?? 'there'} 👋</Typography>
          <Typography variant="body2" color="text.secondary">Real-time QA overview across all your projects.</Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Project filter</InputLabel>
          <Select label="Project filter" value={bugProject} onChange={e => setBugProject(e.target.value)}>
            <MenuItem value="">— All projects —</MenuItem>
            {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {/* 12-KPI row */}
      <Grid container spacing={2} mb={3}>
        {KPI_CARDS.map(card => (
          <Grid item xs={6} sm={4} md={2} key={card.label}>
            <StatCard
              label={card.label}
              value={card.value}
              color={card.color}
              icon={card.icon}
              loading={statsLoading}
              onClick={() => navigate(card.path)}
            />
          </Grid>
        ))}
      </Grid>

      {/* Charts row 1 */}
      <Grid container spacing={3} mb={3}>
        {/* Bug Trend */}
        <Grid item xs={12} md={8}>
          <ChartCard title="Bug Trend (last 30 days)" subtitle="Created vs Closed" loading={trendLoading && !!bugProject}>
            {!bugProject ? (
              <EmptyChart message="Select a project to view bug trend" />
            ) : bugTrend.length === 0 ? (
              <EmptyChart message="No bug data for selected period" />
            ) : (
              <TrendChart
                data={bugTrend as unknown as Record<string, unknown>[]}
                xKey="day"
                series={[
                  { key: 'created', label: 'Created', color: CHART_COLORS.error },
                  { key: 'closed',  label: 'Closed',  color: CHART_COLORS.success },
                ]}
              />
            )}
          </ChartCard>
        </Grid>

        {/* Bugs by Severity */}
        <Grid item xs={12} md={4}>
          <ChartCard title="Bugs by Severity" loading={distLoading && !!bugProject}>
            {!bugProject || !bugDist?.bySeverity.length ? (
              <EmptyChart message={bugProject ? 'No bugs found' : 'Select a project'} />
            ) : (
              <DonutChart data={bugDist.bySeverity} />
            )}
          </ChartCard>
        </Grid>
      </Grid>

      {/* Charts row 2 */}
      <Grid container spacing={3} mb={3}>
        {/* Test Execution Trend */}
        <Grid item xs={12} md={6}>
          <ChartCard title="Test Execution (last 14 days)" subtitle="Pass / Fail / Blocked / Skipped" loading={testTrendLoading && !!bugProject}>
            {!bugProject ? (
              <EmptyChart message="Select a project" />
            ) : (
              <MultiBarChart
                data={testTrend as unknown as Record<string, unknown>[]}
                xKey="day"
                series={[
                  { key: 'pass',    label: 'Pass',    color: CHART_COLORS.success },
                  { key: 'fail',    label: 'Fail',    color: CHART_COLORS.error },
                  { key: 'blocked', label: 'Blocked', color: CHART_COLORS.warning },
                  { key: 'skipped', label: 'Skipped', color: CHART_COLORS.muted },
                ]}
                stacked
              />
            )}
          </ChartCard>
        </Grid>

        {/* Bug Status Distribution */}
        <Grid item xs={12} md={3}>
          <ChartCard title="Bugs by Status" loading={distLoading && !!bugProject}>
            {!bugProject || !bugDist?.byStatus.length ? (
              <EmptyChart message={bugProject ? 'No bugs' : 'Select a project'} />
            ) : (
              <DonutChart data={bugDist.byStatus} innerRadius={40} outerRadius={70} />
            )}
          </ChartCard>
        </Grid>

        {/* Releases by Status */}
        <Grid item xs={12} md={3}>
          <ChartCard title="Releases by Status" loading={releaseLoading && !!bugProject}>
            {!bugProject || !releaseStatus.length ? (
              <EmptyChart message={bugProject ? 'No releases' : 'Select a project'} />
            ) : (
              <VerticalBarChart data={releaseStatus} />
            )}
          </ChartCard>
        </Grid>
      </Grid>

      {/* Bottom row */}
      <Grid container spacing={3}>
        {/* My Open Bugs */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ pb: 0 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="subtitle2" fontWeight={700}>My Assigned Bugs</Typography>
                <Button size="small" onClick={() => navigate('/bugs')}>View all</Button>
              </Box>
            </CardContent>
            {myBugs.length === 0 ? (
              <Box px={2} pb={2} display="flex" alignItems="center" gap={1}>
                <CheckCircleIcon color="success" fontSize="small" />
                <Typography variant="body2" color="text.secondary">No open bugs assigned to you.</Typography>
              </Box>
            ) : (
              <List dense disablePadding>
                {myBugs.slice(0, 5).map((bug, i) => (
                  <Box key={bug.id}>
                    {i > 0 && <Divider />}
                    <ListItem button onClick={() => navigate(`/bugs/${bug.id}`)} sx={{ py: 1 }}>
                      <ListItemAvatar>
                        <Avatar sx={{ width: 28, height: 28, bgcolor: (bug.project as { color?: string } | null)?.color ?? '#4F46E5', fontSize: 11 }}>
                          {(bug.project as { name?: string } | null)?.name?.[0] ?? 'B'}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={<Typography variant="caption" fontWeight={600} noWrap display="block">{bug.title}</Typography>}
                        secondary={<Typography variant="caption" color="text.secondary">{bug.bug_id}</Typography>}
                      />
                      <SeverityChip value={bug.severity} />
                    </ListItem>
                  </Box>
                ))}
              </List>
            )}
          </Card>
        </Grid>

        {/* My Retest Queue */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ pb: 0 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="subtitle2" fontWeight={700}>My Retest Queue</Typography>
                <Chip label={myRetests.length} size="small" color={myRetests.length > 0 ? 'warning' : 'default'} />
              </Box>
            </CardContent>
            {myRetests.length === 0 ? (
              <Box px={2} pb={2} display="flex" alignItems="center" gap={1}>
                <CheckCircleIcon color="success" fontSize="small" />
                <Typography variant="body2" color="text.secondary">No bugs waiting for your retest.</Typography>
              </Box>
            ) : (
              <List dense disablePadding>
                {myRetests.slice(0, 5).map((bug, i) => (
                  <Box key={bug.id}>
                    {i > 0 && <Divider />}
                    <ListItem button onClick={() => navigate(`/bugs/${bug.id}`)} sx={{ py: 1 }}>
                      <ListItemText
                        primary={<Typography variant="caption" fontWeight={600} noWrap display="block">{bug.title}</Typography>}
                        secondary={<Typography variant="caption" color="text.secondary">{bug.bug_id}</Typography>}
                      />
                      <StatusChip status={bug.status} />
                    </ListItem>
                  </Box>
                ))}
              </List>
            )}
          </Card>
        </Grid>

        {/* Activity Feed */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ pb: 0 }}>
              <Typography variant="subtitle2" fontWeight={700} mb={1}>Activity Feed</Typography>
            </CardContent>
            {activityLoading ? (
              <Box px={2} pb={2}>{[...Array(4)].map((_, i) => <Skeleton key={i} variant="text" height={40} />)}</Box>
            ) : activity.length === 0 ? (
              <Box px={2} pb={2}>
                <Typography variant="body2" color="text.secondary">No recent activity.</Typography>
              </Box>
            ) : (
              <List dense disablePadding sx={{ maxHeight: 280, overflowY: 'auto' }}>
                {activity.map((a, i) => (
                  <Box key={a.id}>
                    {i > 0 && <Divider />}
                    <ListItem sx={{ py: 0.75, alignItems: 'flex-start' }}>
                      <ListItemAvatar sx={{ minWidth: 36, mt: 0.25 }}>
                        <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: 11 }}>
                          {getInitials(a.user?.full_name ?? '')}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={0.5} flexWrap="wrap">
                            <Typography variant="caption" fontWeight={600}>{a.user?.full_name ?? 'Someone'}</Typography>
                            <Typography variant="caption" color="text.secondary">{a.action}</Typography>
                            {a.entity_name && <Typography variant="caption" fontWeight={600} noWrap>{a.entity_name}</Typography>}
                          </Box>
                        }
                        secondary={<Typography variant="caption" color="text.disabled">{timeAgo(a.created_at)}</Typography>}
                      />
                      <Box sx={{ color: 'text.disabled', flexShrink: 0, mt: 0.25 }}>
                        {ACTION_ICON[a.action?.split(' ')[0]?.toLowerCase()] ?? <PendingIcon sx={{ fontSize: 16 }} />}
                      </Box>
                    </ListItem>
                  </Box>
                ))}
              </List>
            )}
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
