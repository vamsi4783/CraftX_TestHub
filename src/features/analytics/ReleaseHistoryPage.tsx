import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Grid, Card, CardContent, Typography, FormControl, InputLabel,
  Select, MenuItem, Chip, Button, Divider, Avatar, LinearProgress,
} from '@mui/material';
import {
  Timeline, TimelineItem, TimelineSeparator, TimelineDot, TimelineConnector,
  TimelineContent, TimelineOppositeContent,
} from '@mui/lab';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import VerifiedIcon from '@mui/icons-material/Verified';
import CancelIcon from '@mui/icons-material/Cancel';
import ArchiveIcon from '@mui/icons-material/Archive';
import HourglassIcon from '@mui/icons-material/HourglassEmpty';
import { projectService } from '@/services/projectService';
import { analyticsService } from '@/services/analyticsService';
import { releaseService } from '@/services/releaseService';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { StatCard, ChartCard, VerticalBarChart, EmptyChart, CHART_COLORS } from '@/components/charts';
import { formatDate } from '@/lib/utils';
import type { ReadinessVerdict } from '@/types';

const STATUS_DOT: Record<string, 'grey' | 'primary' | 'secondary' | 'error' | 'warning' | 'success' | 'inherit'> = {
  planning: 'grey', testing: 'primary', ready: 'warning', released: 'success', archived: 'grey',
};
const STATUS_ICON: Record<string, React.ReactNode> = {
  planning:  <HourglassIcon sx={{ fontSize: 14 }} />,
  testing:   <RocketLaunchIcon sx={{ fontSize: 14 }} />,
  ready:     <CheckCircleIcon sx={{ fontSize: 14 }} />,
  released:  <VerifiedIcon sx={{ fontSize: 14 }} />,
  archived:  <ArchiveIcon sx={{ fontSize: 14 }} />,
};

const QA_ICON: Record<string, React.ReactNode> = {
  approved:           <VerifiedIcon sx={{ fontSize: 14, color: '#10B981' }} />,
  rejected:           <CancelIcon   sx={{ fontSize: 14, color: '#EF4444' }} />,
  needs_more_testing: <HourglassIcon sx={{ fontSize: 14, color: '#F59E0B' }} />,
  pending:            <HourglassIcon sx={{ fontSize: 14, color: '#9CA3AF' }} />,
};

const VERDICT_CONFIG: Record<ReadinessVerdict, { label: string; color: string }> = {
  not_ready:         { label: 'Not Ready',        color: '#EF4444' },
  ready_with_risks:  { label: 'Ready with Risks', color: '#F59E0B' },
  ready_for_release: { label: 'Ready ✓',          color: '#10B981' },
};

export function ReleaseHistoryPage() {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState('');

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectService.list() });

  const { data: releases = [], isLoading } = useQuery({
    queryKey: ['release-history', projectId],
    queryFn: () => analyticsService.getReleaseHistory(projectId),
    enabled: !!projectId,
  });

  const { data: statusBreakdown = [] } = useQuery({
    queryKey: ['release-status', projectId],
    queryFn: () => analyticsService.getReleaseStatusBreakdown(projectId),
    enabled: !!projectId,
  });

  const statusCounts = (releases as Array<{ status: string }>).reduce((m: Record<string, number>, r) => {
    m[r.status] = (m[r.status] ?? 0) + 1; return m;
  }, {});

  return (
    <Box>
      <PageHeader title="Release History" subtitle="Timeline, approvals, and readiness history across all releases." />

      <Box mb={3}>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel>Project</InputLabel>
          <Select label="Project" value={projectId} onChange={e => setProjectId(e.target.value)}>
            <MenuItem value="">— Select project —</MenuItem>
            {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {!projectId ? (
        <EmptyState icon={RocketLaunchIcon} title="Select a project" description="Choose a project to view its release history." />
      ) : isLoading ? (
        <Box><LinearProgress /></Box>
      ) : releases.length === 0 ? (
        <EmptyState icon={RocketLaunchIcon} title="No releases yet" description="Create your first release from the Releases page." />
      ) : (
        <>
          {/* Summary KPIs */}
          <Grid container spacing={2} mb={3}>
            {[
              { label: 'Total Releases', value: releases.length,              color: '#4F46E5' },
              { label: 'Released',        value: statusCounts.released ?? 0,  color: '#10B981' },
              { label: 'In Testing',      value: (statusCounts.testing ?? 0) + (statusCounts.ready ?? 0), color: '#06B6D4' },
              { label: 'Planning',        value: statusCounts.planning ?? 0,  color: '#9CA3AF' },
              { label: 'Archived',        value: statusCounts.archived ?? 0,  color: '#6B7280' },
            ].map(k => (
              <Grid item xs={6} sm={4} md key={k.label}>
                <StatCard label={k.label} value={k.value} color={k.color} />
              </Grid>
            ))}
          </Grid>

          <Grid container spacing={3} mb={3}>
            <Grid item xs={12} md={4}>
              <ChartCard title="Releases by Status">
                {statusBreakdown.length === 0 ? <EmptyChart /> : (
                  <VerticalBarChart data={statusBreakdown} />
                )}
              </ChartCard>
            </Grid>

            {/* Timeline */}
            <Grid item xs={12} md={8}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={700} mb={1}>Release Timeline</Typography>
                  <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
                    <Timeline sx={{ m: 0, p: 0 }}>
                      {(releases as Array<Record<string, unknown>>).map((r, i) => {
                        const qaList = (r.qa_approvals as Array<{ status: string }> | null) ?? [];
                        const qa = qaList[0];
                        return (
                          <TimelineItem key={r.id as string} sx={{ '&::before': { flex: 0, p: 0 } }}>
                            <TimelineOppositeContent sx={{ flex: '0 0 90px', px: 1, py: 0.75 }}>
                              <Typography variant="caption" color="text.secondary">
                                {r.created_at ? formatDate(r.created_at as string) : '—'}
                              </Typography>
                            </TimelineOppositeContent>
                            <TimelineSeparator>
                              <TimelineDot color={STATUS_DOT[r.status as string] ?? 'grey'} sx={{ p: 0.5 }}>
                                {STATUS_ICON[r.status as string]}
                              </TimelineDot>
                              {i < releases.length - 1 && <TimelineConnector />}
                            </TimelineSeparator>
                            <TimelineContent sx={{ py: 0.5, px: 1.5 }}>
                              <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                                <Typography
                                  variant="body2" fontWeight={700} sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                                  onClick={() => navigate(`/releases/${r.id as string}`)}>
                                  {r.name as string}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">v{r.version as string}</Typography>
                                <Chip label={r.status as string} size="small" sx={{ height: 18, fontSize: 10 }} />
                                {qa && (
                                  <Box display="flex" alignItems="center" gap={0.25}>
                                    {QA_ICON[qa.status]}
                                    <Typography variant="caption" color="text.secondary">{qa.status.replace(/_/g, ' ')}</Typography>
                                  </Box>
                                )}
                              </Box>
                              {(r.start_date != null || r.end_date != null) && (
                                <Typography variant="caption" color="text.secondary">
                                  {r.start_date ? formatDate(r.start_date as string) : '—'} → {r.end_date ? formatDate(r.end_date as string) : 'ongoing'}
                                </Typography>
                              )}
                            </TimelineContent>
                          </TimelineItem>
                        );
                      })}
                    </Timeline>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Release cards grid */}
          <Grid container spacing={2}>
            {(releases as Array<Record<string, unknown>>).map(r => {
              const qaList = (r.qa_approvals as Array<{ status: string }> | null) ?? [];
              const qa = qaList[0];
              const creator = r.creator as { full_name?: string } | null;
              return (
                <Grid item xs={12} sm={6} md={4} key={r.id as string}>
                  <Card sx={{ cursor: 'pointer', '&:hover': { boxShadow: 4 } }} onClick={() => navigate(`/releases/${r.id as string}`)}>
                    <CardContent>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                        <Box flex={1} minWidth={0}>
                          <Typography variant="subtitle2" fontWeight={700} noWrap>{r.name as string}</Typography>
                          <Typography variant="caption" color="text.secondary">v{r.version as string}{r.build_number ? ` · Build ${r.build_number as string}` : ''}</Typography>
                        </Box>
                        <Chip label={r.status as string} size="small" sx={{ flexShrink: 0, ml: 1, height: 20, fontSize: 10 }} />
                      </Box>

                      {(r.start_date != null || r.end_date != null) && (
                        <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                          📅 {r.start_date ? formatDate(r.start_date as string) : '—'} → {r.end_date ? formatDate(r.end_date as string) : 'ongoing'}
                        </Typography>
                      )}

                      <Divider sx={{ my: 1 }} />

                      <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Avatar sx={{ width: 20, height: 20, fontSize: 9, bgcolor: 'primary.main' }}>
                            {(creator?.full_name?.[0] ?? '?')}
                          </Avatar>
                          <Typography variant="caption" color="text.secondary">{creator?.full_name ?? '—'}</Typography>
                        </Box>
                        {qa && (
                          <Box display="flex" alignItems="center" gap={0.5}>
                            {QA_ICON[qa.status]}
                            <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>{qa.status.replace(/_/g, ' ')}</Typography>
                          </Box>
                        )}
                      </Box>

                      <Box mt={1.5} display="flex" justifyContent="flex-end">
                        <Button size="small" variant="outlined" onClick={e => { e.stopPropagation(); navigate(`/releases/${r.id as string}`); }}>
                          View Details
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </>
      )}
    </Box>
  );
}
