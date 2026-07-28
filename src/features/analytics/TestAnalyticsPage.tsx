import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Grid, FormControl, InputLabel, Select, MenuItem,
  Card, CardContent, Typography, Table, TableHead, TableRow,
  TableCell, TableBody, LinearProgress, ToggleButtonGroup, ToggleButton, Avatar,
} from '@mui/material';
import { analyticsService } from '@/services/analyticsService';
import { projectService } from '@/services/projectService';
import { testCaseService } from '@/services/testCaseService';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import {
  StatCard, ChartCard, DonutChart, HorizontalBarChart,
  MultiBarChart, EmptyChart, CHART_COLORS,
} from '@/components/charts';
import AssignmentIcon from '@mui/icons-material/Assignment';

export function TestAnalyticsPage() {
  const [projectId, setProjectId] = useState('');
  const [releaseId, setReleaseId] = useState('');
  const [days, setDays] = useState<number>(14);

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectService.list() });

  const { data: testTrend = [], isLoading: trendLoading } = useQuery({
    queryKey: ['test-trend', projectId, days],
    queryFn: () => analyticsService.getTestTrend(projectId, days),
    enabled: !!projectId,
  });

  const { data: moduleCoverage = [], isLoading: coverageLoading } = useQuery({
    queryKey: ['module-coverage', projectId],
    queryFn: () => analyticsService.getModuleCoverage(projectId),
    enabled: !!projectId,
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['assignments-analytics', projectId, releaseId],
    queryFn: () => testCaseService.getAssignments(releaseId || projectId),
    enabled: !!projectId,
  });

  // Derive pass/fail/blocked/skipped from assignments with results
  const executionStats = useMemo(() => {
    if (!testTrend.length) return { pass: 0, fail: 0, blocked: 0, skipped: 0, total: 0 };
    const totals = testTrend.reduce((s, d) => ({
      pass: s.pass + d.pass, fail: s.fail + d.fail,
      blocked: s.blocked + d.blocked, skipped: s.skipped + d.skipped,
    }), { pass: 0, fail: 0, blocked: 0, skipped: 0 });
    const total = totals.pass + totals.fail + totals.blocked + totals.skipped;
    return { ...totals, total };
  }, [testTrend]);

  const passRate = executionStats.total > 0
    ? Math.round((executionStats.pass / executionStats.total) * 100) : 0;

  const executionPie = [
    { name: 'Pass',    value: executionStats.pass,    fill: CHART_COLORS.success },
    { name: 'Fail',    value: executionStats.fail,    fill: CHART_COLORS.error },
    { name: 'Blocked', value: executionStats.blocked, fill: CHART_COLORS.warning },
    { name: 'Skipped', value: executionStats.skipped, fill: CHART_COLORS.muted },
  ].filter(d => d.value > 0);

  // Most failed and least tested modules
  const mostFailed = useMemo(() =>
    [...moduleCoverage].sort((a, b) => b.failed - a.failed).slice(0, 8)
      .map(m => ({ name: m.module_name.length > 18 ? m.module_name.slice(0, 16) + '…' : m.module_name, value: m.failed, fill: CHART_COLORS.error })),
    [moduleCoverage]
  );
  const leastTested = useMemo(() =>
    [...moduleCoverage].sort((a, b) => a.coverage_pct - b.coverage_pct).slice(0, 8)
      .map(m => ({ name: m.module_name.length > 18 ? m.module_name.slice(0, 16) + '…' : m.module_name, value: 100 - m.coverage_pct, fill: CHART_COLORS.warning })),
    [moduleCoverage]
  );

  const isLoading = (trendLoading || assignmentsLoading) && !!projectId;

  return (
    <Box>
      <PageHeader title="Test Analytics" subtitle="Execution trends, coverage, and quality metrics." />

      {/* Filters */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap" alignItems="center">
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Project</InputLabel>
          <Select label="Project" value={projectId} onChange={e => { setProjectId(e.target.value); setReleaseId(''); }}>
            <MenuItem value="">— Select project —</MenuItem>
            {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
        </FormControl>
        <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v as number)}>
          <ToggleButton value={7}>7d</ToggleButton>
          <ToggleButton value={14}>14d</ToggleButton>
          <ToggleButton value={30}>30d</ToggleButton>
          <ToggleButton value={60}>60d</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {!projectId ? (
        <EmptyState icon={AssignmentIcon} title="Select a project" description="Choose a project to view test analytics." />
      ) : isLoading ? (
        <LoadingState />
      ) : (
        <>
          {/* KPIs */}
          <Grid container spacing={2} mb={3}>
            {[
              { label: 'Total Executed', value: executionStats.total,   color: '#4F46E5' },
              { label: 'Passed',         value: executionStats.pass,    color: '#10B981' },
              { label: 'Failed',         value: executionStats.fail,    color: '#EF4444' },
              { label: 'Blocked',        value: executionStats.blocked, color: '#F59E0B' },
              { label: 'Skipped',        value: executionStats.skipped, color: '#9CA3AF' },
              { label: 'Pass Rate',      value: `${passRate}%`,         color: passRate >= 80 ? '#10B981' : '#EF4444' },
            ].map(k => (
              <Grid item xs={6} sm={4} md={2} key={k.label}>
                <StatCard label={k.label} value={k.value} color={k.color} />
              </Grid>
            ))}
          </Grid>

          {/* Charts row 1 */}
          <Grid container spacing={3} mb={3}>
            <Grid item xs={12} md={8}>
              <ChartCard title={`Execution Trend (last ${days} days)`} subtitle="Pass / Fail / Blocked / Skipped" loading={trendLoading}>
                {testTrend.length === 0 ? <EmptyChart /> : (
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
            <Grid item xs={12} md={4}>
              <ChartCard title="Pass / Fail Ratio">
                {executionPie.length === 0 ? <EmptyChart message="No executions yet" /> : (
                  <DonutChart data={executionPie} />
                )}
              </ChartCard>
            </Grid>
          </Grid>

          {/* Charts row 2 */}
          <Grid container spacing={3} mb={3}>
            <Grid item xs={12} md={6}>
              <ChartCard title="Most Failed Modules" subtitle="Modules with the highest failure count" loading={coverageLoading}>
                {mostFailed.every(m => m.value === 0) ? <EmptyChart message="No failures recorded" /> : (
                  <HorizontalBarChart data={mostFailed} color={CHART_COLORS.error} />
                )}
              </ChartCard>
            </Grid>
            <Grid item xs={12} md={6}>
              <ChartCard title="Least Tested Modules" subtitle="% of cases not yet executed" loading={coverageLoading}>
                {leastTested.every(m => m.value === 0) ? <EmptyChart message="Full coverage achieved 🎉" /> : (
                  <HorizontalBarChart data={leastTested} color={CHART_COLORS.warning} />
                )}
              </ChartCard>
            </Grid>
          </Grid>

          {/* Module coverage table */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={2}>Test Coverage by Module</Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Module</TableCell>
                      <TableCell align="right">Cases</TableCell>
                      <TableCell align="right">Assigned</TableCell>
                      <TableCell align="right">Completed</TableCell>
                      <TableCell align="right">Passed</TableCell>
                      <TableCell align="right">Failed</TableCell>
                      <TableCell align="right">Blocked</TableCell>
                      <TableCell sx={{ minWidth: 140 }}>Coverage</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {moduleCoverage.map(m => (
                      <TableRow key={m.module_id} hover>
                        <TableCell><Typography variant="body2" fontWeight={600}>{m.module_name}</Typography></TableCell>
                        <TableCell align="right">{m.total_cases}</TableCell>
                        <TableCell align="right">{m.assigned}</TableCell>
                        <TableCell align="right">{m.completed}</TableCell>
                        <TableCell align="right" sx={{ color: 'success.main', fontWeight: 600 }}>{m.passed}</TableCell>
                        <TableCell align="right" sx={{ color: m.failed > 0 ? 'error.main' : 'text.secondary', fontWeight: m.failed > 0 ? 600 : 400 }}>{m.failed}</TableCell>
                        <TableCell align="right" sx={{ color: m.blocked > 0 ? 'warning.main' : 'text.secondary' }}>{m.blocked}</TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <LinearProgress
                              variant="determinate"
                              value={m.coverage_pct}
                              color={m.coverage_pct >= 80 ? 'success' : m.coverage_pct >= 50 ? 'warning' : 'error'}
                              sx={{ flex: 1, height: 6, borderRadius: 3 }}
                            />
                            <Typography variant="caption" fontWeight={700} sx={{ minWidth: 32 }}>{m.coverage_pct}%</Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                    {moduleCoverage.length === 0 && (
                      <TableRow><TableCell colSpan={8} align="center"><Typography variant="body2" color="text.secondary" py={2}>No module data — apply migration 004 first.</Typography></TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
