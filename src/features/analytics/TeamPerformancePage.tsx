import { useQuery } from '@tanstack/react-query';
import {
  Box, Grid, Card, CardContent, Typography, Table, TableHead,
  TableRow, TableCell, TableBody, LinearProgress, Avatar, Chip, Tabs, Tab,
} from '@mui/material';
import { useState } from 'react';
import { analyticsService } from '@/services/analyticsService';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingState } from '@/components/common/LoadingState';
import { StatCard, ChartCard, HorizontalBarChart, DonutChart, EmptyChart, CHART_COLORS } from '@/components/charts';
import PeopleIcon from '@mui/icons-material/People';
import { getInitials } from '@/lib/utils';

function SLAChip({ pct }: { pct: number }) {
  const color = pct >= 90 ? 'success' : pct >= 70 ? 'warning' : 'error';
  return <Chip label={`${pct}%`} size="small" color={color} sx={{ height: 20, fontSize: 11, fontWeight: 700 }} />;
}

export function TeamPerformancePage() {
  const [tab, setTab] = useState(0);

  const { data: testers = [], isLoading: testersLoading } = useQuery({
    queryKey: ['tester-performance'],
    queryFn: () => analyticsService.getTesterPerformance(),
    staleTime: 5 * 60_000,
  });

  const { data: developers = [], isLoading: devsLoading } = useQuery({
    queryKey: ['developer-performance'],
    queryFn: () => analyticsService.getDeveloperPerformance(),
    staleTime: 5 * 60_000,
  });

  if (testersLoading || devsLoading) return <LoadingState />;

  // Tester summary stats
  const totalExecuted  = testers.reduce((s, t) => s + t.executed, 0);
  const totalPassed    = testers.reduce((s, t) => s + t.passed,   0);
  const totalFailed    = testers.reduce((s, t) => s + t.failed,   0);
  const totalBlocked   = testers.reduce((s, t) => s + t.blocked,  0);
  const avgEfficiency  = testers.length ? Math.round(testers.reduce((s, t) => s + t.efficiency_pct, 0) / testers.length) : 0;

  // Dev summary stats
  const totalAssigned  = developers.reduce((s, d) => s + d.assigned_bugs,  0);
  const totalResolved  = developers.reduce((s, d) => s + d.resolved,        0);

  const testerBars = [...testers].sort((a, b) => b.executed - a.executed).slice(0, 8)
    .map(t => ({ name: (t.full_name || 'Unknown').split(' ')[0], value: t.executed, fill: CHART_COLORS.primary }));

  const devBars = [...developers].sort((a, b) => b.resolved - a.resolved).slice(0, 8)
    .map(d => ({ name: (d.full_name || 'Unknown').split(' ')[0], value: d.resolved, fill: CHART_COLORS.success }));

  const resultPie = [
    { name: 'Passed',  value: totalPassed,  fill: CHART_COLORS.success },
    { name: 'Failed',  value: totalFailed,  fill: CHART_COLORS.error   },
    { name: 'Blocked', value: totalBlocked, fill: CHART_COLORS.warning },
  ].filter(d => d.value > 0);

  return (
    <Box>
      <PageHeader title="Team Performance" subtitle="Tester efficiency, developer resolution metrics, and SLA tracking." />

      <Tabs value={tab} onChange={(_, v) => setTab(v as number)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label={`QA Testers (${testers.length})`} />
        <Tab label={`Developers (${developers.length})`} />
      </Tabs>

      {/* ── QA Testers tab ─────────────────────────────────────────────────── */}
      {tab === 0 && (
        <>
          <Grid container spacing={2} mb={3}>
            {[
              { label: 'Team Size',       value: testers.length,  color: '#4F46E5' },
              { label: 'Total Executed',  value: totalExecuted,   color: '#06B6D4' },
              { label: 'Total Passed',    value: totalPassed,     color: '#10B981' },
              { label: 'Total Failed',    value: totalFailed,     color: '#EF4444' },
              { label: 'Total Blocked',   value: totalBlocked,    color: '#F59E0B' },
              { label: 'Avg Efficiency',  value: `${avgEfficiency}%`, color: avgEfficiency >= 80 ? '#10B981' : '#F59E0B' },
            ].map(k => (
              <Grid item xs={6} sm={4} md={2} key={k.label}>
                <StatCard label={k.label} value={k.value} color={k.color} />
              </Grid>
            ))}
          </Grid>

          <Grid container spacing={3} mb={3}>
            <Grid item xs={12} md={7}>
              <ChartCard title="Tests Executed per Tester">
                {testerBars.length === 0 ? <EmptyChart message="No data — apply migration 004" /> : (
                  <HorizontalBarChart data={testerBars} color={CHART_COLORS.primary} />
                )}
              </ChartCard>
            </Grid>
            <Grid item xs={12} md={5}>
              <ChartCard title="Team Pass / Fail / Blocked Ratio">
                {resultPie.length === 0 ? <EmptyChart message="No executions yet" /> : (
                  <DonutChart data={resultPie} />
                )}
              </ChartCard>
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={2}>Tester Leaderboard</Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Tester</TableCell>
                      <TableCell align="right">Assigned</TableCell>
                      <TableCell align="right">Executed</TableCell>
                      <TableCell align="right">Passed</TableCell>
                      <TableCell align="right">Failed</TableCell>
                      <TableCell align="right">Blocked</TableCell>
                      <TableCell align="right">Skipped</TableCell>
                      <TableCell align="right">Avg Time (min)</TableCell>
                      <TableCell align="right">Efficiency</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {testers.length === 0 ? (
                      <TableRow><TableCell colSpan={10} align="center">
                        <Typography variant="body2" color="text.secondary" py={2}>No data — apply migration 004 to enable this view.</Typography>
                      </TableCell></TableRow>
                    ) : [...testers].sort((a, b) => b.executed - a.executed).map((t, i) => (
                      <TableRow key={t.user_id} hover>
                        <TableCell>
                          <Typography variant="body2" color={i === 0 ? 'warning.main' : 'text.secondary'} fontWeight={700}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: 11 }}>{getInitials(t.full_name)}</Avatar>
                            <Typography variant="body2" fontWeight={600}>{t.full_name || 'Unknown'}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">{t.assigned}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{t.executed}</TableCell>
                        <TableCell align="right" sx={{ color: 'success.main' }}>{t.passed}</TableCell>
                        <TableCell align="right" sx={{ color: t.failed > 0 ? 'error.main' : 'text.secondary' }}>{t.failed}</TableCell>
                        <TableCell align="right" sx={{ color: t.blocked > 0 ? 'warning.main' : 'text.secondary' }}>{t.blocked}</TableCell>
                        <TableCell align="right">{t.skipped}</TableCell>
                        <TableCell align="right">{t.avg_duration_minutes ?? '—'}</TableCell>
                        <TableCell align="right">
                          <Box display="flex" alignItems="center" gap={1} justifyContent="flex-end">
                            <LinearProgress variant="determinate" value={t.efficiency_pct}
                              color={t.efficiency_pct >= 80 ? 'success' : t.efficiency_pct >= 60 ? 'warning' : 'error'}
                              sx={{ width: 50, height: 6, borderRadius: 3 }} />
                            <SLAChip pct={t.efficiency_pct} />
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Developers tab ─────────────────────────────────────────────────── */}
      {tab === 1 && (
        <>
          <Grid container spacing={2} mb={3}>
            {[
              { label: 'Team Size',       value: developers.length,       color: '#4F46E5' },
              { label: 'Total Assigned',  value: totalAssigned,           color: '#F59E0B' },
              { label: 'Total Resolved',  value: totalResolved,           color: '#10B981' },
              { label: 'Resolution Rate', value: totalAssigned > 0 ? `${Math.round((totalResolved / totalAssigned) * 100)}%` : '—', color: '#06B6D4' },
            ].map(k => (
              <Grid item xs={6} sm={3} key={k.label}>
                <StatCard label={k.label} value={k.value} color={k.color} />
              </Grid>
            ))}
          </Grid>

          <Grid container spacing={3} mb={3}>
            <Grid item xs={12} md={7}>
              <ChartCard title="Bugs Resolved per Developer">
                {devBars.length === 0 ? <EmptyChart message="No data — apply migration 004" /> : (
                  <HorizontalBarChart data={devBars} color={CHART_COLORS.success} />
                )}
              </ChartCard>
            </Grid>
            <Grid item xs={12} md={5}>
              <ChartCard title="Resolution vs In-Progress">
                {developers.length === 0 ? <EmptyChart /> : (
                  <DonutChart data={[
                    { name: 'Resolved',    value: totalResolved,   fill: CHART_COLORS.success },
                    { name: 'In Progress', value: developers.reduce((s, d) => s + d.in_progress, 0), fill: CHART_COLORS.primary },
                    { name: 'Unresolved',  value: Math.max(0, totalAssigned - totalResolved), fill: CHART_COLORS.muted },
                  ].filter(d => d.value > 0)} />
                )}
              </ChartCard>
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} mb={2}>Developer Performance</Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Developer</TableCell>
                      <TableCell align="right">Assigned Bugs</TableCell>
                      <TableCell align="right">Resolved</TableCell>
                      <TableCell align="right">In Progress</TableCell>
                      <TableCell align="right">Regression Bugs</TableCell>
                      <TableCell align="right">Avg Resolution</TableCell>
                      <TableCell align="right">Resolution Rate</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {developers.length === 0 ? (
                      <TableRow><TableCell colSpan={8} align="center">
                        <Typography variant="body2" color="text.secondary" py={2}>No data — apply migration 004 to enable this view.</Typography>
                      </TableCell></TableRow>
                    ) : [...developers].sort((a, b) => b.resolved - a.resolved).map((d, i) => {
                      const rate = d.assigned_bugs > 0 ? Math.round((d.resolved / d.assigned_bugs) * 100) : 0;
                      return (
                        <TableRow key={d.user_id} hover>
                          <TableCell>
                            <Typography variant="body2" color={i === 0 ? 'warning.main' : 'text.secondary'} fontWeight={700}>
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Box display="flex" alignItems="center" gap={1}>
                              <Avatar sx={{ width: 28, height: 28, bgcolor: 'secondary.main', fontSize: 11 }}>{getInitials(d.full_name)}</Avatar>
                              <Typography variant="body2" fontWeight={600}>{d.full_name || 'Unknown'}</Typography>
                            </Box>
                          </TableCell>
                          <TableCell align="right">{d.assigned_bugs}</TableCell>
                          <TableCell align="right" sx={{ color: 'success.main', fontWeight: 600 }}>{d.resolved}</TableCell>
                          <TableCell align="right">{d.in_progress}</TableCell>
                          <TableCell align="right" sx={{ color: d.reopened > 0 ? 'error.main' : 'text.secondary' }}>{d.reopened}</TableCell>
                          <TableCell align="right">
                            {d.avg_resolution_hours != null ? `${d.avg_resolution_hours}h` : '—'}
                          </TableCell>
                          <TableCell align="right">
                            <Box display="flex" alignItems="center" gap={1} justifyContent="flex-end">
                              <LinearProgress variant="determinate" value={rate}
                                color={rate >= 80 ? 'success' : rate >= 50 ? 'warning' : 'error'}
                                sx={{ width: 50, height: 6, borderRadius: 3 }} />
                              <SLAChip pct={rate} />
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
