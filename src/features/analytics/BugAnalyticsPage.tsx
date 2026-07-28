import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Grid, FormControl, InputLabel, Select, MenuItem, Typography,
  Card, CardContent, Table, TableHead, TableRow, TableCell, TableBody,
  Chip, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import { analyticsService as svc } from '@/services/analyticsService';
import { projectService } from '@/services/projectService';
import { bugService } from '@/services/bugService';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import {
  StatCard, ChartCard, DonutChart, VerticalBarChart,
  HorizontalBarChart, TrendChart, EmptyChart, CHART_COLORS,
} from '@/components/charts';
import BugReportIcon from '@mui/icons-material/BugReport';
import { SeverityChip } from '@/components/common/SeverityChip';
import { timeAgo } from '@/lib/utils';

export function BugAnalyticsPage() {
  const [projectId, setProjectId] = useState('');
  const [days, setDays] = useState<number>(30);

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectService.list() });

  const { data: bugs = [], isLoading: bugsLoading } = useQuery({
    queryKey: ['bugs-analytics', projectId],
    queryFn: () => bugService.list(projectId),
    enabled: !!projectId,
  });

  const { data: bugTrend = [], isLoading: trendLoading } = useQuery({
    queryKey: ['bug-trend', projectId, days],
    queryFn: () => svc.getBugTrend(projectId, days),
    enabled: !!projectId,
  });

  const { data: bugDist } = useQuery({
    queryKey: ['bug-dist', projectId],
    queryFn: () => svc.getBugDistribution(projectId),
    enabled: !!projectId,
  });

  const { data: byModule = [] } = useQuery({
    queryKey: ['bugs-by-module', projectId],
    queryFn: () => svc.getBugsByModule(projectId),
    enabled: !!projectId,
  });

  const aging = useMemo(() => svc.getBugAging(bugs), [bugs]);

  const openBugs = bugs.filter(b => !['closed','rejected','duplicate','wont_fix','cannot_reproduce','verified'].includes(b.status));
  const closedBugs = bugs.filter(b => ['closed','verified'].includes(b.status));
  const criticalOpen = bugs.filter(b => b.severity === 'critical' && !['closed','rejected'].includes(b.status));

  const avgResolutionDays = useMemo(() => {
    const resolved = bugs.filter(b => b.closed_at);
    if (!resolved.length) return null;
    const totalMs = resolved.reduce((s, b) => s + (new Date(b.closed_at!).getTime() - new Date(b.created_at).getTime()), 0);
    return (totalMs / resolved.length / 86_400_000).toFixed(1);
  }, [bugs]);

  const duplicatePct = useMemo(() => {
    if (!bugs.length) return 0;
    return Math.round((bugs.filter(b => b.status === 'duplicate').length / bugs.length) * 100);
  }, [bugs]);

  // Top reporters and assignees
  const topReporters = useMemo(() => {
    const map: Record<string, { name: string; count: number }> = {};
    bugs.forEach(b => {
      const id = b.reported_by;
      const name = (b.reporter as { full_name?: string } | null)?.full_name ?? 'Unknown';
      if (!map[id]) map[id] = { name, count: 0 };
      map[id].count++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 5)
      .map(r => ({ name: r.name, value: r.count, fill: CHART_COLORS.error }));
  }, [bugs]);

  const topAssignees = useMemo(() => {
    const map: Record<string, { name: string; count: number }> = {};
    bugs.forEach(b => {
      if (!b.assigned_to) return;
      const id = b.assigned_to;
      const name = (b.assignee as { full_name?: string } | null)?.full_name ?? 'Unknown';
      if (!map[id]) map[id] = { name, count: 0 };
      map[id].count++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 5)
      .map(r => ({ name: r.name, value: r.count, fill: CHART_COLORS.primary }));
  }, [bugs]);

  const isLoading = bugsLoading && !!projectId;

  return (
    <Box>
      <PageHeader title="Bug Analytics" subtitle="Trends, distributions, aging, and team insights." />

      {/* Filters */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap" alignItems="center">
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Project</InputLabel>
          <Select label="Project" value={projectId} onChange={e => setProjectId(e.target.value)}>
            <MenuItem value="">— Select project —</MenuItem>
            {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
        </FormControl>
        <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v as number)}>
          <ToggleButton value={7}>7d</ToggleButton>
          <ToggleButton value={14}>14d</ToggleButton>
          <ToggleButton value={30}>30d</ToggleButton>
          <ToggleButton value={90}>90d</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {!projectId ? (
        <EmptyState icon={BugReportIcon} title="Select a project" description="Choose a project to view bug analytics." />
      ) : isLoading ? (
        <LoadingState />
      ) : (
        <>
          {/* KPIs */}
          <Grid container spacing={2} mb={3}>
            {[
              { label: 'Total Bugs',        value: bugs.length,       color: '#4F46E5' },
              { label: 'Open Bugs',         value: openBugs.length,   color: '#EF4444' },
              { label: 'Critical Open',     value: criticalOpen.length, color: '#7C3AED' },
              { label: 'Closed / Verified', value: closedBugs.length, color: '#10B981' },
              { label: 'Avg Resolution',    value: avgResolutionDays ? `${avgResolutionDays}d` : '—', color: '#06B6D4' },
              { label: 'Duplicate %',       value: `${duplicatePct}%`, color: '#F59E0B' },
            ].map(k => (
              <Grid item xs={6} sm={4} md={2} key={k.label}>
                <StatCard label={k.label} value={k.value} color={k.color} />
              </Grid>
            ))}
          </Grid>

          {/* Charts row 1 */}
          <Grid container spacing={3} mb={3}>
            <Grid item xs={12} md={8}>
              <ChartCard title={`Bug Trend (last ${days} days)`} subtitle="Created vs Closed" loading={trendLoading}>
                {bugTrend.length === 0 ? <EmptyChart /> : (
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
            <Grid item xs={12} md={4}>
              <ChartCard title="Severity Distribution">
                {!bugDist?.bySeverity.length ? <EmptyChart /> : (
                  <DonutChart data={bugDist.bySeverity} />
                )}
              </ChartCard>
            </Grid>
          </Grid>

          {/* Charts row 2 */}
          <Grid container spacing={3} mb={3}>
            <Grid item xs={12} md={4}>
              <ChartCard title="Status Distribution">
                {!bugDist?.byStatus.length ? <EmptyChart /> : (
                  <DonutChart data={bugDist.byStatus} innerRadius={40} outerRadius={70} />
                )}
              </ChartCard>
            </Grid>
            <Grid item xs={12} md={4}>
              <ChartCard title="Bug Aging (Open Bugs)" subtitle="Days since creation">
                {aging.every(a => a.count === 0) ? <EmptyChart /> : (
                  <VerticalBarChart
                    data={aging.map(a => ({ name: a.range, value: a.count, fill: a.count > 10 ? CHART_COLORS.error : CHART_COLORS.warning }))}
                    xTickFormatter={(v) => v.split('–')[0]}
                  />
                )}
              </ChartCard>
            </Grid>
            <Grid item xs={12} md={4}>
              <ChartCard title="Bugs by Module (Top 10)">
                {byModule.length === 0 ? <EmptyChart /> : (
                  <HorizontalBarChart
                    data={byModule.map(m => ({ name: m.name.length > 18 ? m.name.slice(0, 16) + '…' : m.name, value: m.open, fill: CHART_COLORS.error }))}
                    color={CHART_COLORS.error}
                  />
                )}
              </ChartCard>
            </Grid>
          </Grid>

          {/* Charts row 3 */}
          <Grid container spacing={3} mb={3}>
            <Grid item xs={12} md={6}>
              <ChartCard title="Top Bug Reporters">
                {topReporters.length === 0 ? <EmptyChart /> : (
                  <HorizontalBarChart data={topReporters} />
                )}
              </ChartCard>
            </Grid>
            <Grid item xs={12} md={6}>
              <ChartCard title="Top Bug Assignees">
                {topAssignees.length === 0 ? <EmptyChart /> : (
                  <HorizontalBarChart data={topAssignees} color={CHART_COLORS.primary} />
                )}
              </ChartCard>
            </Grid>
          </Grid>

          {/* Module breakdown table */}
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={2}>Bug Count by Module</Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Module</TableCell>
                      <TableCell align="right">Total</TableCell>
                      <TableCell align="right">Open</TableCell>
                      <TableCell align="right">Critical</TableCell>
                      <TableCell>Open %</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {byModule.map(m => (
                      <TableRow key={m.name} hover>
                        <TableCell><Typography variant="body2" fontWeight={600}>{m.name}</Typography></TableCell>
                        <TableCell align="right">{m.total}</TableCell>
                        <TableCell align="right">
                          <Chip label={m.open} size="small" color={m.open > 0 ? 'error' : 'default'} sx={{ height: 20, fontSize: 11 }} />
                        </TableCell>
                        <TableCell align="right">
                          {m.critical > 0 && <Chip label={m.critical} size="small" sx={{ height: 20, fontSize: 11, bgcolor: '#EDE9FE', color: '#5B21B6' }} />}
                        </TableCell>
                        <TableCell sx={{ minWidth: 120 }}>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Box sx={{ flex: 1, bgcolor: 'grey.100', borderRadius: 1, height: 6, overflow: 'hidden' }}>
                              <Box sx={{ width: `${m.total > 0 ? (m.open / m.total) * 100 : 0}%`, height: '100%', bgcolor: m.open > m.total / 2 ? 'error.main' : 'warning.main' }} />
                            </Box>
                            <Typography variant="caption">{m.total > 0 ? Math.round((m.open / m.total) * 100) : 0}%</Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                    {byModule.length === 0 && (
                      <TableRow><TableCell colSpan={5} align="center"><Typography variant="body2" color="text.secondary" py={2}>No module data</Typography></TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>

          {/* Critical open bugs table */}
          {criticalOpen.length > 0 && (
            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} mb={2} color="error.main">
                  Critical Open Bugs ({criticalOpen.length})
                </Typography>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Bug ID</TableCell>
                        <TableCell>Title</TableCell>
                        <TableCell>Severity</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Age</TableCell>
                        <TableCell>Assignee</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {criticalOpen.map(b => (
                        <TableRow key={b.id} hover>
                          <TableCell><Typography variant="caption" fontFamily="monospace" color="primary.main">{b.bug_id}</Typography></TableCell>
                          <TableCell><Typography variant="body2" noWrap sx={{ maxWidth: 240 }}>{b.title}</Typography></TableCell>
                          <TableCell><SeverityChip value={b.severity} /></TableCell>
                          <TableCell><Typography variant="caption">{b.status}</Typography></TableCell>
                          <TableCell><Typography variant="caption">{timeAgo(b.created_at)}</Typography></TableCell>
                          <TableCell><Typography variant="caption">{(b.assignee as { full_name?: string } | null)?.full_name ?? '—'}</Typography></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Box>
  );
}
