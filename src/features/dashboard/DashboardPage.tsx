import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Grid, Card, CardContent, Typography, Button,
  List, ListItem, ListItemAvatar, ListItemText, Divider, LinearProgress, Avatar,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import BugReportIcon from '@mui/icons-material/BugReport';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { dashboardService } from '@/services/dashboardService';
import { useAuth } from '@/hooks/useAuth';
import { SeverityChip } from '@/components/common/SeverityChip';
import { StatusChip } from '@/components/common/StatusChip';
import { timeAgo } from '@/lib/utils';

const STAT_CARDS = [
  { key: 'total_projects',   label: 'Projects',     icon: <FolderIcon />,       color: '#4F46E5', path: '/projects' },
  { key: 'assigned_tests',   label: 'My Tests',     icon: <PlayCircleIcon />,   color: '#06B6D4', path: '/my-tests' },
  { key: 'completed_tests',  label: 'Completed',    icon: <CheckCircleIcon />,  color: '#10B981', path: '/my-tests' },
  { key: 'open_bugs',        label: 'Open Bugs',    icon: <BugReportIcon />,    color: '#EF4444', path: '/bugs' },
  { key: 'critical_bugs',    label: 'Critical',     icon: <WarningAmberIcon />, color: '#F59E0B', path: '/bugs' },
  { key: 'feature_requests', label: 'Features',     icon: <LightbulbIcon />,    color: '#7C3AED', path: '/features' },
];

const SEV_COLORS: Record<string, string> = { Critical: '#7C3AED', High: '#EF4444', Medium: '#F59E0B', Low: '#10B981' };

export function DashboardPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats', profile?.id],
    queryFn: () => dashboardService.getStats(profile!.id),
    enabled: !!profile,
    refetchInterval: 60_000,
  });

  const { data: recentBugs = [] } = useQuery({
    queryKey: ['dashboard-recent-bugs'],
    queryFn: () => dashboardService.getRecentBugs(5),
  });

  const { data: myTests = [] } = useQuery({
    queryKey: ['dashboard-my-tests', profile?.id],
    queryFn: () => dashboardService.getMyTests(profile!.id, 5),
    enabled: !!profile,
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const severityData = stats ? [
    { name: 'Critical', value: stats.critical_bugs },
    { name: 'High', value: Math.max(0, stats.open_bugs - stats.critical_bugs) },
  ].filter(d => d.value > 0) : [];

  const testData = [
    { name: 'Pending', value: stats?.assigned_tests ?? 0 },
    { name: 'Done', value: stats?.completed_tests ?? 0 },
  ];

  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h5" fontWeight={800}>{greeting}, {profile?.full_name?.split(' ')[0] ?? 'there'} 👋</Typography>
        <Typography variant="body2" color="text.secondary">Here's what's happening across your projects today.</Typography>
      </Box>

      <Grid container spacing={2} mb={3}>
        {STAT_CARDS.map(card => (
          <Grid item xs={6} sm={4} md={2} key={card.key}>
            <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 4 } }} onClick={() => navigate(card.path)}>
              <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
                      {card.label}
                    </Typography>
                    <Typography variant="h4" fontWeight={800} color={card.color} lineHeight={1.2} mt={0.5}>
                      {stats ? (stats as unknown as Record<string, number>)[card.key] : '—'}
                    </Typography>
                  </Box>
                  <Box sx={{ color: card.color, opacity: 0.7 }}>{card.icon}</Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={2}>Bug Severity</Typography>
              {severityData.length === 0 ? (
                <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={4}>
                  <CheckCircleIcon sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">No open bugs!</Typography>
                </Box>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={severityData} dataKey="value" cx="50%" cy="50%" outerRadius={70}>
                      {severityData.map((entry, i) => <Cell key={i} fill={SEV_COLORS[entry.name] ?? '#9CA3AF'} />)}
                    </Pie>
                    <ReTooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={2}>Testing Progress</Typography>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={testData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.2)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <ReTooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#4F46E5" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={2}>My Pass Rate</Typography>
              {stats && stats.completed_tests > 0 ? (
                <Box>
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="body2" color="text.secondary">Tests passed</Typography>
                    <Typography variant="body2" fontWeight={700} color="success.main">
                      {Math.round((stats.passed_tests / stats.completed_tests) * 100)}%
                    </Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={(stats.passed_tests / stats.completed_tests) * 100}
                    color="success" sx={{ height: 10, borderRadius: 5, mb: 2 }} />
                  <Box display="flex" justifyContent="space-around">
                    {[
                      { label: 'Passed', val: stats.passed_tests, color: 'success.main' },
                      { label: 'Total', val: stats.completed_tests, color: 'text.primary' },
                      { label: 'Failed', val: stats.completed_tests - stats.passed_tests, color: 'error.main' },
                    ].map(item => (
                      <Box key={item.label} textAlign="center">
                        <Typography variant="h5" fontWeight={800} color={item.color}>{item.val}</Typography>
                        <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ) : (
                <Box display="flex" alignItems="center" justifyContent="center" height={150}>
                  <Typography variant="body2" color="text.secondary">No test results yet</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent sx={{ pb: 0 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="subtitle2" fontWeight={700}>Recent Bugs</Typography>
                <Button size="small" onClick={() => navigate('/bugs')}>View all</Button>
              </Box>
            </CardContent>
            {recentBugs.length === 0 ? (
              <Box px={2} pb={2}><Typography variant="body2" color="text.secondary">No bugs reported yet.</Typography></Box>
            ) : (
              <List dense>
                {recentBugs.map((bug: any, i: number) => (
                  <Box key={bug.id}>
                    {i > 0 && <Divider />}
                    <ListItem button onClick={() => navigate(`/bugs/${bug.id}`)} sx={{ py: 1.5 }}>
                      <ListItemAvatar>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: bug.project?.color ?? '#4F46E5', fontSize: 12 }}>
                          {bug.project?.name?.[0] ?? 'B'}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={<Typography variant="body2" fontWeight={600} noWrap>{bug.title}</Typography>}
                        secondary={<Typography variant="caption" color="text.secondary">{bug.bug_id} · {timeAgo(bug.created_at)}</Typography>}
                      />
                      <Box display="flex" gap={1} flexShrink={0}>
                        <SeverityChip value={bug.severity} />
                        <StatusChip status={bug.status} />
                      </Box>
                    </ListItem>
                  </Box>
                ))}
              </List>
            )}
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent sx={{ pb: 0 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="subtitle2" fontWeight={700}>My Pending Tests</Typography>
                <Button size="small" onClick={() => navigate('/my-tests')}>View all</Button>
              </Box>
            </CardContent>
            {myTests.length === 0 ? (
              <Box px={2} pb={2}><Typography variant="body2" color="text.secondary">No pending tests assigned.</Typography></Box>
            ) : (
              <List dense>
                {myTests.map((a: any, i: number) => (
                  <Box key={a.id}>
                    {i > 0 && <Divider />}
                    <ListItem button onClick={() => navigate(`/test-execution/${a.id}`)} sx={{ py: 1.5 }}>
                      <ListItemText
                        primary={<Typography variant="body2" fontWeight={600} noWrap>{a.test_case?.title}</Typography>}
                        secondary={<Typography variant="caption" color="text.secondary">{a.test_case?.test_id} · {a.release?.name}</Typography>}
                      />
                      <Box display="flex" gap={1} flexShrink={0}>
                        <SeverityChip value={a.priority} />
                        <Button size="small" variant="outlined" onClick={e => { e.stopPropagation(); navigate(`/test-execution/${a.id}`); }}>
                          Execute
                        </Button>
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
