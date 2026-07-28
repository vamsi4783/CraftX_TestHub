import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Grid, Card, CardContent, Typography, Button, FormControl,
  InputLabel, Select, MenuItem, Divider, List, ListItem, ListItemIcon,
  ListItemText, CircularProgress, Alert, Chip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import TableViewIcon from '@mui/icons-material/TableView';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import AssessmentIcon from '@mui/icons-material/Assessment';
import BugReportIcon from '@mui/icons-material/BugReport';
import AssignmentIcon from '@mui/icons-material/Assignment';
import VerifiedIcon from '@mui/icons-material/Verified';
import SummarizeIcon from '@mui/icons-material/Summarize';
import { projectService } from '@/services/projectService';
import { releaseService } from '@/services/releaseService';
import { analyticsService } from '@/services/analyticsService';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { downloadCSV, downloadExcel, printReport, rowsToHTMLTable } from '@/lib/export';

interface ReportDef {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  formats: ('csv' | 'excel' | 'pdf')[];
  needsRelease?: boolean;
}

const REPORTS: ReportDef[] = [
  {
    id: 'bug_summary',
    label: 'Bug Summary Report',
    description: 'All bugs with severity, status, assignee, module, and resolution details.',
    icon: <BugReportIcon color="error" />,
    formats: ['csv', 'excel', 'pdf'],
  },
  {
    id: 'test_results',
    label: 'Test Execution Report',
    description: 'Test results with executor, status, duration, and environment.',
    icon: <AssignmentIcon color="primary" />,
    formats: ['csv', 'excel', 'pdf'],
  },
  {
    id: 'release_readiness',
    label: 'Release Readiness Report',
    description: 'Readiness score breakdown for a specific release.',
    icon: <AssessmentIcon color="warning" />,
    formats: ['csv', 'pdf'],
    needsRelease: true,
  },
  {
    id: 'qa_signoff',
    label: 'QA Sign-off Report',
    description: 'QA approval checklist and decision for a release.',
    icon: <VerifiedIcon color="success" />,
    formats: ['csv', 'pdf'],
    needsRelease: true,
  },
  {
    id: 'executive',
    label: 'Executive Summary',
    description: 'High-level overview: bug counts, pass rates, open critical issues.',
    icon: <SummarizeIcon color="action" />,
    formats: ['pdf'],
  },
];

export function ReportsPage() {
  const [projectId, setProjectId]   = useState('');
  const [releaseId, setReleaseId]   = useState('');
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectService.list() });
  const { data: releases = [] } = useQuery({
    queryKey: ['releases', projectId],
    queryFn: () => releaseService.list(projectId),
    enabled: !!projectId,
  });
  const { data: readiness } = useQuery({
    queryKey: ['release-readiness', releaseId],
    queryFn: () => releaseService.getReadiness(releaseId),
    enabled: !!releaseId,
  });
  const { data: approval } = useQuery({
    queryKey: ['qa-approval', releaseId],
    queryFn: () => releaseService.getApproval(releaseId),
    enabled: !!releaseId,
  });

  const selectedProject = projects.find(p => p.id === projectId);
  const selectedRelease = releases.find(r => r.id === releaseId);

  async function generate(reportId: string, format: 'csv' | 'excel' | 'pdf') {
    if (!projectId) { setError('Select a project first.'); return; }
    setError(null);
    setGenerating(`${reportId}-${format}`);
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const pName = selectedProject?.name ?? 'project';

      if (reportId === 'bug_summary') {
        const rows = await analyticsService.exportBugs(projectId);
        if (!rows.length) throw new Error('No bugs found for this project.');
        if (format === 'csv')   downloadCSV(rows, `bug-summary-${pName}-${timestamp}.csv`);
        if (format === 'excel') downloadExcel({ 'Bug Summary': rows }, `bug-summary-${pName}-${timestamp}.xlsx`);
        if (format === 'pdf')   printReport(`Bug Summary — ${pName}`, rowsToHTMLTable(rows));
      }

      if (reportId === 'test_results') {
        const rows = await analyticsService.exportTestResults(projectId);
        if (!rows.length) throw new Error('No test results found.');
        if (format === 'csv')   downloadCSV(rows, `test-results-${pName}-${timestamp}.csv`);
        if (format === 'excel') downloadExcel({ 'Test Results': rows }, `test-results-${pName}-${timestamp}.xlsx`);
        if (format === 'pdf')   printReport(`Test Execution Report — ${pName}`, rowsToHTMLTable(rows));
      }

      if (reportId === 'release_readiness') {
        if (!releaseId || !readiness) throw new Error('Select a release first.');
        const rName = selectedRelease?.name ?? 'release';
        const rows = [{
          'Release':            rName,
          'Version':            selectedRelease?.version ?? '',
          'Status':             selectedRelease?.status ?? '',
          'Verdict':            readiness.verdict.replace(/_/g, ' '),
          'Testing %':          `${readiness.testing_percentage}%`,
          'Pass Rate':          `${readiness.pass_rate}%`,
          'Total Tests':        readiness.total_tests,
          'Completed Tests':    readiness.completed_tests,
          'Total Bugs':         readiness.total_bugs,
          'Critical Bugs':      readiness.critical_bugs,
          'Open Bugs':          readiness.open_bugs,
        }];
        if (format === 'csv') downloadCSV(rows, `readiness-${rName}-${timestamp}.csv`);
        if (format === 'pdf') printReport(`Release Readiness — ${rName}`, rowsToHTMLTable(rows));
      }

      if (reportId === 'qa_signoff') {
        if (!releaseId) throw new Error('Select a release first.');
        const rName = selectedRelease?.name ?? 'release';
        const cl = (approval?.checklist ?? {}) as Record<string, boolean>;
        const rows = Object.entries({
          'Critical Bugs Closed':       cl.critical_bugs_closed,
          'Required Tests Executed':    cl.required_tests_executed,
          'Coverage Target Reached':    cl.coverage_target_reached,
          'No Blocked Tests':           cl.no_blocked_tests,
          'Release Notes Completed':    cl.release_notes_completed,
          'Known Issues Documented':    cl.known_issues_documented,
          'Regression Passed':          cl.regression_passed,
        }).map(([item, done]) => ({
          'Checklist Item': item,
          'Status':         done ? '✅ Complete' : '❌ Incomplete',
        }));
        rows.push({ 'Checklist Item': 'QA DECISION', 'Status': (approval?.status ?? 'pending').toUpperCase() });
        if (format === 'csv') downloadCSV(rows, `qa-signoff-${rName}-${timestamp}.csv`);
        if (format === 'pdf') printReport(`QA Sign-off — ${rName}`, rowsToHTMLTable(rows));
      }

      if (reportId === 'executive') {
        const bugs = await analyticsService.exportBugs(projectId);
        const openBugs   = bugs.filter(b => !['Closed','Verified','Rejected'].includes(String(b['Status'])));
        const closedBugs = bugs.filter(b => ['Closed','Verified'].includes(String(b['Status'])));
        const critical   = bugs.filter(b => b['Severity'] === 'critical' && !['Closed','Verified','Rejected'].includes(String(b['Status'])));
        const summary = [{
          'Project':             pName,
          'Report Date':         new Date().toLocaleDateString(),
          'Total Bugs':          bugs.length,
          'Open Bugs':           openBugs.length,
          'Closed / Verified':   closedBugs.length,
          'Critical Open':       critical.length,
          'Release':             selectedRelease?.name ?? 'N/A',
          'Readiness Verdict':   readiness?.verdict.replace(/_/g, ' ') ?? 'N/A',
          'Testing %':           readiness ? `${readiness.testing_percentage}%` : 'N/A',
          'Pass Rate':           readiness ? `${readiness.pass_rate}%` : 'N/A',
          'QA Approval':         approval?.status?.replace(/_/g, ' ') ?? 'N/A',
        }];
        const html = `
          <h2 style="margin-bottom:16px">Executive QA Summary — ${pName}</h2>
          ${rowsToHTMLTable(summary)}
          <h3 style="margin:20px 0 8px">Open Bugs</h3>
          ${rowsToHTMLTable(openBugs.slice(0, 50))}
        `;
        printReport(`Executive QA Summary — ${pName}`, html);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Report generation failed.');
    } finally {
      setGenerating(null);
    }
  }

  const isGenerating = (id: string) => generating === id;

  return (
    <Box>
      <PageHeader title="Reports & Exports" subtitle="Generate PDF, Excel, and CSV reports from live data." />

      {/* Filters */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Project *</InputLabel>
          <Select label="Project *" value={projectId} onChange={e => { setProjectId(e.target.value); setReleaseId(''); }}>
            <MenuItem value="">— Select project —</MenuItem>
            {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Release (optional)</InputLabel>
          <Select label="Release (optional)" value={releaseId} onChange={e => setReleaseId(e.target.value)} disabled={!projectId}>
            <MenuItem value="">— All releases —</MenuItem>
            {releases.map(r => <MenuItem key={r.id} value={r.id}>{r.name} v{r.version}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}

      {!projectId ? (
        <EmptyState icon={AssessmentIcon} title="Select a project" description="Choose a project to generate reports." />
      ) : (
        <Grid container spacing={3}>
          {REPORTS.map(report => {
            const disabled = !!(report.needsRelease && !releaseId);
            return (
              <Grid item xs={12} md={6} key={report.id}>
                <Card sx={{ height: '100%', border: disabled ? undefined : '1px solid transparent', '&:hover': disabled ? {} : { borderColor: 'primary.main', boxShadow: 4 } }}>
                  <CardContent>
                    <Box display="flex" alignItems="flex-start" gap={1.5} mb={1.5}>
                      {report.icon}
                      <Box flex={1}>
                        <Typography variant="subtitle2" fontWeight={700}>{report.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{report.description}</Typography>
                      </Box>
                      {disabled && <Chip label="Select release" size="small" color="warning" sx={{ height: 20, fontSize: 10 }} />}
                    </Box>

                    <Divider sx={{ mb: 1.5 }} />

                    <Box display="flex" gap={1} flexWrap="wrap">
                      {report.formats.includes('csv') && (
                        <Button
                          size="small" variant="outlined" startIcon={isGenerating(`${report.id}-csv`) ? <CircularProgress size={14} /> : <TableViewIcon />}
                          disabled={disabled || !!generating}
                          onClick={() => generate(report.id, 'csv')}
                        >
                          CSV
                        </Button>
                      )}
                      {report.formats.includes('excel') && (
                        <Button
                          size="small" variant="outlined" color="success"
                          startIcon={isGenerating(`${report.id}-excel`) ? <CircularProgress size={14} /> : <DownloadIcon />}
                          disabled={disabled || !!generating}
                          onClick={() => generate(report.id, 'excel')}
                        >
                          Excel
                        </Button>
                      )}
                      {report.formats.includes('pdf') && (
                        <Button
                          size="small" variant="outlined" color="error"
                          startIcon={isGenerating(`${report.id}-pdf`) ? <CircularProgress size={14} /> : <PictureAsPdfIcon />}
                          disabled={disabled || !!generating}
                          onClick={() => generate(report.id, 'pdf')}
                        >
                          PDF / Print
                        </Button>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Export notes */}
      <Box mt={4}>
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5} fontWeight={600}>Notes:</Typography>
        <List dense sx={{ py: 0 }}>
          {[
            'CSV and Excel exports download instantly and contain live data.',
            'PDF uses your browser\'s print dialog — choose "Save as PDF" as the destination.',
            'Release-specific reports require a release to be selected above.',
            'Executive Summary includes the top 50 open bugs in the print view.',
          ].map((note, i) => (
            <ListItem key={i} sx={{ py: 0 }}>
              <ListItemIcon sx={{ minWidth: 20 }}><Typography variant="caption" color="text.secondary">•</Typography></ListItemIcon>
              <ListItemText primary={<Typography variant="caption" color="text.secondary">{note}</Typography>} />
            </ListItem>
          ))}
        </List>
      </Box>
    </Box>
  );
}
