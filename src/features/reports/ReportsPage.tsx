import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Grid, Card, CardContent, Typography, Button, FormControl,
  InputLabel, Select, MenuItem, Divider, Chip, LinearProgress,
} from '@mui/material';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
  AreaChart, Area,
} from 'recharts';
import DownloadIcon from '@mui/icons-material/Download';
import BarChartIcon from '@mui/icons-material/BarChart';
import { projectService } from '@/services/projectService';
import { releaseService } from '@/services/releaseService';
import { bugService } from '@/services/bugService';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingState } from '@/components/common/LoadingState';
import type { ReadinessVerdict } from '@/types';

const COLORS = { critical: '#7C3AED', high: '#EF4444', medium: '#F59E0B', low: '#10B981' };
const STATUS_COLORS: Record<string, string> = {
  new: '#EF4444', triaged: '#F59E0B', assigned: '#3B82F6', in_progress: '#4F46E5',
  ready_for_qa: '#06B6D4', verified: '#10B981', closed: '#6B7280',
};

const VERDICT_LABEL: Record<ReadinessVerdict, string> = {
  not_ready: '🔴 Not Ready', ready_with_risks: '🟡 Ready with Risks', ready_for_release: '🟢 Ready',
};

export function ReportsPage() {
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedRelease, setSelectedRelease] = useState('');

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectService.list() });
  const { data: releases = [] } = useQuery({
    queryKey: ['releases', selectedProject], queryFn: () => releaseService.list(selectedProject), enabled: !!selectedProject,
  });
  const { data: readiness } = useQuery({
    queryKey: ['readiness', selectedRelease], queryFn: () => releaseService.getReadiness(selectedRelease), enabled: !!selectedRelease,
  });
  const { data: bugStats } = useQuery({
    queryKey: ['bug-stats', selectedProject], queryFn: () => bugService.getStats(selectedProject), enabled: !!selectedProject,
  });
  const { data: bugs = [] } = useQuery({
    queryKey: ['bugs-report', selectedProject], queryFn: () => bugService.list(selectedProject), enabled: !!selectedProject,
  });

  const sev = bugStats?.bySeverity as Record<string, number> | undefined;
  const sta = bugStats?.byStatus as Record<string, number> | undefined;

  const severityData = ['critical','high','medium','low'].map(s => ({
    name: s.charAt(0).toUpperCase() + s.slice(1),
    value: sev?.[s] ?? 0,
  })).filter(d => d.value > 0);

  const statusData = Object.keys(STATUS_COLORS).map(status => ({
    name: status.replace(/_/g,' '),
    value: sta?.[status] ?? 0,
  })).filter(d => d.value > 0);

  // Trend: count bugs by week (last 8 weeks)
  const weekTrend = Array.from({ length: 8 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (7 - i) * 7);
    const label = `W${i + 1}`;
    const count = bugs.filter(b => new Date(b.created_at) <= d).length;
    return { name: label, bugs: count };
  });

  return (
    <Box>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Quality insights, trends, and release readiness across your projects."
        actions={
          <Button variant="outlined" startIcon={<DownloadIcon />} disabled>Export PDF</Button>
        }
      />

      {/* Filters */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Project</InputLabel>
          <Select label="Project" value={selectedProject} onChange={e => { setSelectedProject(e.target.value); setSelectedRelease(''); }}>
            <MenuItem value="">— Select Project —</MenuItem>
            {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
        </FormControl>
        {selectedProject && (
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Release</InputLabel>
            <Select label="Release" value={selectedRelease} onChange={e => setSelectedRelease(e.target.value)}>
              <MenuItem value="">— All Releases —</MenuItem>
              {releases.map(r => <MenuItem key={r.id} value={r.id}>{r.name} v{r.version}</MenuItem>)}
            </Select>
          </FormControl>
        )}
      </Box>

      {!selectedProject ? (
        <Box textAlign="center" py={8}>
          <BarChartIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">Select a project to view reports</Typography>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {/* Release Readiness */}
          {readiness && (
            <Grid item xs={12}>
              <Card sx={{ border: `2px solid ${readiness.verdict === 'ready_for_release' ? '#10B981' : readiness.verdict === 'ready_with_risks' ? '#F59E0B' : '#EF4444'}` }}>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={2} mb={2}>
                    <Typography variant="h6" fontWeight={800}>{VERDICT_LABEL[readiness.verdict as ReadinessVerdict]}</Typography>
                    <Typography variant="body2" color="text.secondary">Release Readiness Score</Typography>
                  </Box>
                  <Grid container spacing={3}>
                    {[
                      { label: 'Testing %',     value: readiness.testing_percentage, suffix: '%', color: '#4F46E5' },
                      { label: 'Pass Rate',     value: readiness.pass_rate,         suffix: '%', color: '#10B981' },
                      { label: 'Open Bugs',     value: readiness.open_bugs,         suffix: '',  color: '#EF4444' },
                      { label: 'Critical Bugs', value: readiness.critical_bugs,     suffix: '',  color: '#7C3AED' },
                    ].map(m => (
                      <Grid item xs={6} sm={3} key={m.label}>
                        <Box textAlign="center">
                          <Typography variant="h4" fontWeight={800} color={m.color}>{m.value}{m.suffix}</Typography>
                          <Typography variant="caption" color="text.secondary">{m.label}</Typography>
                          {m.suffix === '%' && <LinearProgress variant="determinate" value={m.value as number} sx={{ mt: 1, height: 6, borderRadius: 3 }} />}
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          )}

          {/* Bug severity */}
          <Grid item xs={12} md={4}>
            <Card sx={{ height: 320 }}>
              <CardContent sx={{ height: '100%' }}>
                <Typography variant="subtitle1" fontWeight={700} mb={1}>Bug Severity Distribution</Typography>
                {severityData.length === 0 ? (
                  <Box display="flex" alignItems="center" justifyContent="center" height="80%">
                    <Typography variant="body2" color="text.secondary">No open bugs 🎉</Typography>
                  </Box>
                ) : (
                  <ResponsiveContainer width="100%" height="85%">
                    <PieChart>
                      <Pie data={severityData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                        {severityData.map(entry => (
                          <Cell key={entry.name} fill={COLORS[entry.name.toLowerCase() as keyof typeof COLORS] ?? '#9CA3AF'} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend iconType="circle" iconSize={10} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Bug status */}
          <Grid item xs={12} md={4}>
            <Card sx={{ height: 320 }}>
              <CardContent sx={{ height: '100%' }}>
                <Typography variant="subtitle1" fontWeight={700} mb={1}>Bug Status Breakdown</Typography>
                <ResponsiveContainer width="100%" height="85%">
                  <BarChart data={statusData} layout="vertical" barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.1)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[0,4,4,0]}>
                      {statusData.map(entry => (
                        <Cell key={entry.name} fill={STATUS_COLORS[entry.name.replace(/ /g,'_')] ?? '#9CA3AF'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          {/* Bug trend */}
          <Grid item xs={12} md={4}>
            <Card sx={{ height: 320 }}>
              <CardContent sx={{ height: '100%' }}>
                <Typography variant="subtitle1" fontWeight={700} mb={1}>Bug Trend (8 weeks)</Typography>
                <ResponsiveContainer width="100%" height="85%">
                  <AreaChart data={weekTrend}>
                    <defs>
                      <linearGradient id="bugGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.1)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="bugs" stroke="#EF4444" strokeWidth={2} fill="url(#bugGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
