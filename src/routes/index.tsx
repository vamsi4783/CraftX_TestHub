import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoginPage } from '@/features/auth/LoginPage';
import { SignUpPage } from '@/features/auth/SignUpPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { SearchPage } from '@/features/search/SearchPage';
import { ModulesPage } from '@/features/modules/ModulesPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { ProjectDetailPage } from '@/features/projects/ProjectDetailPage';
import { ReleaseDetailPage } from '@/features/releases/ReleaseDetailPage';
import { TestCasesPage } from '@/features/test-cases/TestCasesPage';
import { TestCaseDetailPage } from '@/features/test-cases/TestCaseDetailPage';
import { TestExecutionPage } from '@/features/test-cases/TestExecutionPage';
import { TestPlansPage } from '@/features/test-plans/TestPlansPage';
import { TestPlanDetailPage } from '@/features/test-plans/TestPlanDetailPage';
import { TestSessionsPage } from '@/features/test-sessions/TestSessionsPage';
import { TestSessionDetailPage } from '@/features/test-sessions/TestSessionDetailPage';
import { TestSessionExecutionPage } from '@/features/test-sessions/TestSessionExecutionPage';
import { BugsPage } from '@/features/bugs/BugsPage';
import { BugDetailPage } from '@/features/bugs/BugDetailPage';
import { FeatureRequestsPage } from '@/features/feature-requests/FeatureRequestsPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { BugAnalyticsPage } from '@/features/analytics/BugAnalyticsPage';
import { TestAnalyticsPage } from '@/features/analytics/TestAnalyticsPage';
import { TeamPerformancePage } from '@/features/analytics/TeamPerformancePage';
import { ReleaseHistoryPage } from '@/features/analytics/ReleaseHistoryPage';
import { UsersPage } from '@/features/users/UsersPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { NotificationsPage } from '@/features/notifications/NotificationsPage';
import { AgentPage } from '@/features/agent/AgentPage';

// My Tests page (inline)
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { testCaseService } from '@/services/testCaseService';
import { PageHeader } from '@/components/common/PageHeader';
import { Box, Card, CardContent, Typography, Button, Chip } from '@mui/material';
import { StatusChip } from '@/components/common/StatusChip';
import { SeverityChip } from '@/components/common/SeverityChip';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import { formatDate } from '@/lib/utils';

function MyTestsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: assignments = [] } = useQuery({
    queryKey: ['my-assignments', profile?.id],
    queryFn: () => testCaseService.getMyAssignments(profile!.id),
    enabled: !!profile,
  });

  return (
    <Box>
      <PageHeader title="My Tests" subtitle="Test cases assigned to you across all releases." />
      {assignments.length === 0 ? (
        <EmptyState icon={PlayCircleIcon} title="No tests assigned" description="No pending test assignments." />
      ) : (
        <Box display="flex" flexDirection="column" gap={2}>
          {assignments.map(a => (
            <Card key={a.id}>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                  <Box flex={1}>
                    <Typography variant="body2" fontWeight={700}>{a.test_case?.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {a.test_case?.test_id} · {(a.release as any)?.project?.name} · {a.release?.name}
                    </Typography>
                  </Box>
                  <SeverityChip value={a.priority} />
                  <StatusChip status={a.status} />
                  {a.deadline && <Typography variant="caption" color={new Date(a.deadline) < new Date() ? 'error.main' : 'text.secondary'}>Due {formatDate(a.deadline)}</Typography>}
                  <Button size="small" variant="contained" onClick={() => navigate(`/test-execution/${a.id}`)}>Execute</Button>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}

// Releases page
import { releaseService } from '@/services/releaseService';
import { projectService } from '@/services/projectService';
import { FormControl, InputLabel, Select, MenuItem, Grid } from '@mui/material';
import { useState } from 'react';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';

function ReleasesPage() {
  const navigate = useNavigate();
  const [filterProject, setFilterProject] = useState('');
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectService.list() });
  const { data: releases = [] } = useQuery({ queryKey: ['releases', filterProject], queryFn: () => releaseService.list(filterProject), enabled: !!filterProject });

  return (
    <Box>
      <PageHeader title="Releases" subtitle="Manage releases across all projects." />
      <Box mb={3}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Select Project</InputLabel>
          <Select label="Select Project" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
            <MenuItem value="">— Pick a project —</MenuItem>
            {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>
      {!filterProject ? (
        <EmptyState icon={RocketLaunchIcon} title="Select a project" description="Choose a project to view its releases." />
      ) : releases.length === 0 ? (
        <EmptyState icon={RocketLaunchIcon} title="No releases" description="No releases for this project." />
      ) : (
        <Grid container spacing={2}>
          {releases.map(r => (
            <Grid item xs={12} sm={6} md={4} key={r.id}>
              <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 4 } }} onClick={() => navigate(`/releases/${r.id}`)}>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="subtitle2" fontWeight={700}>{r.name}</Typography>
                    <StatusChip status={r.status} />
                  </Box>
                  <Typography variant="caption" color="text.secondary">v{r.version}{r.build_number ? ` · Build ${r.build_number}` : ''}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}

const P = ({ children, roles }: { children: React.ReactNode; roles?: Parameters<typeof ProtectedRoute>[0]['roles'] }) =>
  <ProtectedRoute roles={roles}>{children}</ProtectedRoute>;

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignUpPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard',           element: <P><DashboardPage /></P> },
      { path: 'projects',            element: <P><ProjectsPage /></P> },
      { path: 'projects/:id',        element: <P><ProjectDetailPage /></P> },
      { path: 'releases',            element: <P><ReleasesPage /></P> },
      { path: 'releases/:id',        element: <P><ReleaseDetailPage /></P> },
      { path: 'test-cases',                    element: <P><TestCasesPage /></P> },
      { path: 'test-cases/:id',               element: <P><TestCaseDetailPage /></P> },
      { path: 'my-tests',                      element: <P><MyTestsPage /></P> },
      { path: 'test-execution/:id',            element: <P><TestExecutionPage /></P> },
      { path: 'test-plans',                    element: <P><TestPlansPage /></P> },
      { path: 'test-plans/:id',               element: <P><TestPlanDetailPage /></P> },
      { path: 'test-sessions',                 element: <P><TestSessionsPage /></P> },
      { path: 'test-sessions/new',             element: <P><TestSessionsPage /></P> },
      { path: 'test-sessions/:id',             element: <P><TestSessionDetailPage /></P> },
      { path: 'test-sessions/:id/execute',     element: <P><TestSessionExecutionPage /></P> },
      { path: 'bugs',                element: <P><BugsPage /></P> },
      { path: 'bugs/:id',            element: <P><BugDetailPage /></P> },
      { path: 'features',            element: <P><FeatureRequestsPage /></P> },
      { path: 'modules',             element: <P><ModulesPage /></P> },
      { path: 'reports',              element: <P><ReportsPage /></P> },
      { path: 'analytics/bugs',      element: <P><BugAnalyticsPage /></P> },
      { path: 'analytics/tests',     element: <P><TestAnalyticsPage /></P> },
      { path: 'analytics/team',      element: <P><TeamPerformancePage /></P> },
      { path: 'analytics/releases',  element: <P><ReleaseHistoryPage /></P> },
      { path: 'users',               element: <P roles={['administrator']}><UsersPage /></P> },
      { path: 'settings',            element: <P><SettingsPage /></P> },
      { path: 'notifications',       element: <P><NotificationsPage /></P> },
      { path: 'search',              element: <P><SearchPage /></P> },
      { path: 'agent',               element: <P><AgentPage /></P> },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
