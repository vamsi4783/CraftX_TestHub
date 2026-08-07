// ─── Regression Dashboard (Phase 4 M9) ────────────────────────────────────────
// Input: version strings + changed file list.
// Output: risk heat map, coverage, impact graph, suggested suite, execution plan.

import {
  Box, Container, Typography, Stack, Chip, Button, Paper, Alert, Tab, Tabs,
  TextField, LinearProgress, Accordion, AccordionSummary, AccordionDetails,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  List, ListItem, ListItemText, Divider, CircularProgress, Tooltip,
} from '@mui/material';
import ExpandMoreIcon       from '@mui/icons-material/ExpandMore';
import TrendingUpIcon       from '@mui/icons-material/TrendingUp';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import AccountTreeIcon      from '@mui/icons-material/AccountTree';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import DownloadIcon         from '@mui/icons-material/Download';
import HistoryIcon          from '@mui/icons-material/History';
import PsychologyIcon       from '@mui/icons-material/Psychology';
import { useState, useEffect, useCallback } from 'react';
import { regressionAnalysisEngine } from '@/services/regressionAnalysis/RegressionAnalysisEngine';
import type {
  RegressionReport, RiskScore, RegressionSuggestion, RiskTier,
} from '@/services/regressionAnalysis/RegressionAnalysisTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIER_COLOR: Record<RiskTier, string> = {
  critical: '#b71c1c',
  high:     '#e65100',
  medium:   '#f9a825',
  low:      '#2e7d32',
};

const TIER_BG: Record<RiskTier, string> = {
  critical: '#ffcdd2',
  high:     '#ffe0b2',
  medium:   '#fff9c4',
  low:      '#c8e6c9',
};

function riskColor(score: number): string {
  if (score >= 0.75) return '#b71c1c';
  if (score >= 0.50) return '#e65100';
  if (score >= 0.25) return '#f9a825';
  return '#2e7d32';
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

// ─── Risk Heat Map ────────────────────────────────────────────────────────────

function RiskHeatMap({ scores }: { scores: RiskScore[] }) {
  if (scores.length === 0) {
    return <Typography variant="body2" color="text.secondary">No risk areas detected.</Typography>;
  }
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {scores.map(r => (
        <Tooltip key={r.areaId} title={
          <Box>
            <Typography variant="caption" display="block">{r.areaName}</Typography>
            <Typography variant="caption">Change: {Math.round(r.factors.changeWeight * 100)}%</Typography><br />
            <Typography variant="caption">Failures: {Math.round(r.factors.failureRate * 100)}%</Typography><br />
            <Typography variant="caption">Coverage gap: {Math.round(r.factors.coverageGap * 100)}%</Typography><br />
            <Typography variant="caption">Healing: {Math.round(r.factors.healingRate * 100)}%</Typography>
          </Box>
        } arrow>
          <Box sx={{
            p: 1.5, borderRadius: 1, cursor: 'default', minWidth: 90, textAlign: 'center',
            bgcolor: TIER_BG[r.tier],
            border: `2px solid ${TIER_COLOR[r.tier]}`,
          }}>
            <Typography variant="caption" fontWeight={700} sx={{ color: TIER_COLOR[r.tier], display: 'block' }}>
              {Math.round(r.score * 100)}%
            </Typography>
            <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'block', fontSize: 10, maxWidth: 80 }}>
              {r.areaName.slice(0, 18)}
            </Typography>
            <Chip label={r.tier} size="small" sx={{ mt: 0.5, bgcolor: TIER_COLOR[r.tier], color: '#fff', fontSize: 9, height: 16 }} />
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}

// ─── Suite Table ──────────────────────────────────────────────────────────────

function SuiteTable({ suggestions }: { suggestions: RegressionSuggestion[] }) {
  if (suggestions.length === 0) {
    return <Alert severity="info">No test suggestions yet. Run an analysis to see recommendations.</Alert>;
  }
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Test Case</TableCell>
            <TableCell>Risk</TableCell>
            <TableCell>Tier</TableCell>
            <TableCell>Est. Time</TableCell>
            <TableCell>Coverage Areas</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {suggestions.slice(0, 50).map(s => (
            <TableRow key={`${s.testCaseId || s.testCaseName}-${s.priority}`}
              sx={{ bgcolor: s.testCaseId ? 'inherit' : 'action.hover' }}>
              <TableCell>
                <Typography variant="caption" fontWeight={700}>{s.priority}</Typography>
              </TableCell>
              <TableCell>
                <Typography variant="caption" fontStyle={s.testCaseId ? 'normal' : 'italic'}>
                  {s.testCaseName}
                </Typography>
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <LinearProgress
                    variant="determinate" value={Math.round(s.riskScore * 100)}
                    sx={{ width: 50, height: 6, borderRadius: 3, '& .MuiLinearProgress-bar': { bgcolor: riskColor(s.riskScore) } }}
                  />
                  <Typography variant="caption">{Math.round(s.riskScore * 100)}%</Typography>
                </Stack>
              </TableCell>
              <TableCell>
                <Chip label={s.tier} size="small" sx={{ bgcolor: TIER_COLOR[s.tier], color: '#fff', fontSize: 10 }} />
              </TableCell>
              <TableCell>
                <Typography variant="caption">{s.estimatedTime ? formatTime(s.estimatedTime) : '—'}</Typography>
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                  {s.coverageAreas.slice(0, 2).map((a, i) => (
                    <Chip key={i} label={a.slice(0, 20)} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                  ))}
                  {s.coverageAreas.length > 2 && (
                    <Chip label={`+${s.coverageAreas.length - 2}`} size="small" />
                  )}
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function RegressionDashboard() {
  const [tab,          setTab]          = useState(0);
  const [fromVersion,  setFromVersion]  = useState('');
  const [toVersion,    setToVersion]    = useState('');
  const [filesText,    setFilesText]    = useState('');
  const [analyzing,    setAnalyzing]    = useState(false);
  const [report,       setReport]       = useState<RegressionReport | null>(null);
  const [history,      setHistory]      = useState<RegressionReport[]>([]);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 1) return;
    regressionAnalysisEngine.listReports(20).then(setHistory);
  }, [tab]);

  const handleAnalyze = useCallback(async () => {
    const changedFiles = filesText.split('\n').map(f => f.trim()).filter(Boolean);
    if (!changedFiles.length) { setError('Enter at least one changed file path.'); return; }

    setAnalyzing(true); setError(null); setReport(null);
    try {
      const result = await regressionAnalysisEngine.analyze(
        { fromVersion: fromVersion || 'v-prev', toVersion: toVersion || 'v-next', changedFiles },
        { skipAI: true }, // skipAI in the immediate call; AI runs async in background
      );
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }, [fromVersion, toVersion, filesText]);

  const exportReport = useCallback(() => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `regression-${report.fromVersion}-to-${report.toVersion}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Header */}
      <Stack direction="row" spacing={1.5} alignItems="center" mb={3}>
        <TrendingUpIcon color="primary" />
        <Typography variant="h5" fontWeight={600}>Regression Analysis</Typography>
        <Box flex={1} />
        {report && (
          <Button startIcon={<DownloadIcon />} onClick={exportReport} size="small">
            Export JSON
          </Button>
        )}
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="New Analysis" />
        <Tab label="History" icon={<HistoryIcon fontSize="small" />} iconPosition="end" />
      </Tabs>

      {/* ── Tab 0: New Analysis ─────────────────────────────────────────── */}
      {tab === 0 && (
        <Box>
          {/* Input form */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="From version" size="small" value={fromVersion}
                  onChange={e => setFromVersion(e.target.value)} placeholder="v1.2.0"
                />
                <TextField
                  label="To version" size="small" value={toVersion}
                  onChange={e => setToVersion(e.target.value)} placeholder="v1.3.0"
                />
              </Stack>
              <TextField
                label="Changed file paths (one per line)" multiline rows={5} fullWidth
                value={filesText} onChange={e => setFilesText(e.target.value)}
                placeholder={"src/screens/LoginActivity.kt\nsrc/api/PaymentApiService.kt\nsrc/data/UserRepository.kt"}
                helperText="Paste the output of: git diff --name-only v1.2.0 v1.3.0"
              />
              <Stack direction="row" spacing={2} alignItems="center">
                <Button
                  variant="contained" startIcon={analyzing ? <CircularProgress size={16} color="inherit" /> : <TrendingUpIcon />}
                  onClick={handleAnalyze} disabled={analyzing || !filesText.trim()}
                >
                  {analyzing ? 'Analyzing…' : 'Analyze Regression Impact'}
                </Button>
                {report && <Chip label={`Overall risk: ${Math.round(report.summary.overallRisk * 100)}%`}
                  sx={{ bgcolor: riskColor(report.summary.overallRisk), color: '#fff' }} />}
              </Stack>
            </Stack>
          </Paper>

          {analyzing && <LinearProgress sx={{ mb: 2 }} />}
          {error    && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {!report && !analyzing && (
            <Alert severity="info">
              Enter version identifiers and paste changed file paths to generate a regression impact report.
            </Alert>
          )}

          {report && <ReportView report={report} />}
        </Box>
      )}

      {/* ── Tab 1: History ──────────────────────────────────────────────── */}
      {tab === 1 && (
        <Box>
          {history.length === 0 ? (
            <Alert severity="info">No regression reports found. Run your first analysis above.</Alert>
          ) : (
            history.map(r => (
              <Paper
                key={r.id} variant="outlined"
                sx={{ p: 2, mb: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                onClick={() => { setReport(r); setTab(0); }}
              >
                <Stack direction="row" spacing={2} alignItems="center">
                  <Chip label={`${r.fromVersion} → ${r.toVersion}`} size="small" variant="outlined" />
                  <Chip
                    label={`Risk ${Math.round(r.summary.overallRisk * 100)}%`} size="small"
                    sx={{ bgcolor: riskColor(r.summary.overallRisk), color: '#fff' }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {r.summary.totalChangedFiles} files changed
                  </Typography>
                  <Chip label={`${r.summary.criticalCount} critical`} size="small" color="error" variant="outlined" />
                  <Box flex={1} />
                  <Typography variant="caption" color="text.secondary">
                    {new Date(r.createdAt).toLocaleString()}
                  </Typography>
                </Stack>
              </Paper>
            ))
          )}
        </Box>
      )}
    </Container>
  );
}

// ─── Report view ──────────────────────────────────────────────────────────────

function ReportView({ report }: { report: RegressionReport }) {
  const { summary, riskScores, suggestions, impactedAreas, coverageResults, aiInsights, dependencyGraph } = report;

  return (
    <Stack spacing={2}>
      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap">
        {[
          { label: 'Changed files',    value: summary.totalChangedFiles },
          { label: 'Impacted screens', value: summary.impactedScreens   },
          { label: 'Impacted APIs',    value: summary.impactedAPIs       },
          { label: 'Critical areas',   value: summary.criticalCount      },
          { label: 'High-risk areas',  value: summary.highCount          },
          { label: 'Coverage gap',     value: `${summary.coverageGapPct}%` },
          { label: 'Tests suggested',  value: summary.suggestedTestCount },
          { label: 'Est. run time',    value: formatTime(summary.estimatedTotalTime) },
        ].map(card => (
          <Paper key={card.label} variant="outlined" sx={{ p: 1.5, minWidth: 110, textAlign: 'center' }}>
            <Typography variant="h6" fontWeight={700}>{card.value}</Typography>
            <Typography variant="caption" color="text.secondary">{card.label}</Typography>
          </Paper>
        ))}
      </Stack>

      {/* ── Risk Heat Map ──────────────────────────────────────────────────── */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} alignItems="center">
            <LocalFireDepartmentIcon fontSize="small" color="error" />
            <Typography variant="subtitle2" fontWeight={600}>
              Risk Heat Map ({riskScores.length} areas)
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <RiskHeatMap scores={riskScores} />
        </AccordionDetails>
      </Accordion>

      {/* ── AI Insights ────────────────────────────────────────────────────── */}
      {aiInsights && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
            <PsychologyIcon color="primary" />
            <Typography variant="subtitle1" fontWeight={600}>AI Regression Insights</Typography>
            <Chip label={`${Math.round(aiInsights.confidence * 100)}% confidence`} size="small"
              color={aiInsights.confidence >= 0.7 ? 'success' : 'warning'} />
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Box flex={1}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Developer View</Typography>
              <Typography variant="body2" mt={0.5}>{aiInsights.developerExplanation}</Typography>
            </Box>
            <Box flex={1}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>QA View</Typography>
              <Typography variant="body2" mt={0.5}>{aiInsights.qaExplanation}</Typography>
            </Box>
          </Stack>
          {aiInsights.untestedScenarios.length > 0 && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Untested Scenarios</Typography>
              <List dense sx={{ p: 0 }}>
                {aiInsights.untestedScenarios.map((s, i) => (
                  <ListItem key={i} sx={{ px: 0, py: 0.25 }}>
                    <ListItemText primary={<Typography variant="caption">• {s}</Typography>} />
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </Paper>
      )}

      {/* ── Suggested Regression Suite ─────────────────────────────────────── */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} alignItems="center">
            <PlaylistAddCheckIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" fontWeight={600}>
              Suggested Regression Suite ({suggestions.filter(s => s.testCaseId).length} tests,{' '}
              {formatTime(summary.estimatedTotalTime)} estimated)
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0, overflow: 'auto' }}>
          <SuiteTable suggestions={suggestions} />
        </AccordionDetails>
      </Accordion>

      {/* ── Impact Areas ──────────────────────────────────────────────────── */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} alignItems="center">
            <AccountTreeIcon fontSize="small" color="action" />
            <Typography variant="subtitle2" fontWeight={600}>
              Impact Areas ({impactedAreas.length})
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Risk Factor</TableCell>
                  <TableCell>Files</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {impactedAreas.map(area => (
                  <TableRow key={area.id}>
                    <TableCell><Typography variant="caption" fontWeight={500}>{area.name}</Typography></TableCell>
                    <TableCell><Chip label={area.type} size="small" /></TableCell>
                    <TableCell><Typography variant="caption">{area.category.replace(/_/g, ' ')}</Typography></TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <LinearProgress
                          variant="determinate" value={Math.round(area.riskFactor * 100)}
                          sx={{ width: 50, height: 6, borderRadius: 3, '& .MuiLinearProgress-bar': { bgcolor: riskColor(area.riskFactor) } }}
                        />
                        <Typography variant="caption">{Math.round(area.riskFactor * 100)}%</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 10, color: 'text.secondary' }}>
                        {area.files[0]?.replace(/^.*\//, '') ?? '—'}
                        {area.files.length > 1 ? ` +${area.files.length - 1}` : ''}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </AccordionDetails>
      </Accordion>

      {/* ── Coverage Visualization ─────────────────────────────────────────── */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2" fontWeight={600}>
            Coverage Analysis ({coverageResults.filter(c => c.covered).length}/{coverageResults.length} areas covered)
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          {coverageResults.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No coverage data.</Typography>
          ) : (
            <Stack spacing={1}>
              {coverageResults.map(c => (
                <Box key={c.areaId}>
                  <Stack direction="row" spacing={1} alignItems="center" mb={0.25}>
                    <Typography variant="caption" sx={{ minWidth: 160 }} noWrap>{c.areaName}</Typography>
                    <LinearProgress
                      variant="determinate" value={Math.round(c.coverageScore * 100)}
                      sx={{ flex: 1, height: 8, borderRadius: 4 }}
                      color={c.covered ? 'success' : 'error'}
                    />
                    <Typography variant="caption" sx={{ minWidth: 35 }}>
                      {Math.round(c.coverageScore * 100)}%
                    </Typography>
                    <Chip label={`${c.testCaseCount} tests`} size="small"
                      color={c.covered ? 'success' : 'error'} variant="outlined" />
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </AccordionDetails>
      </Accordion>

      {/* ── Dependency Graph summary ───────────────────────────────────────── */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2" fontWeight={600}>
            Dependency Graph ({dependencyGraph.filter(n => n.impacted).length}/{dependencyGraph.length} nodes impacted)
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {dependencyGraph.map(node => (
              <Chip
                key={node.id}
                label={node.name.slice(0, 25)}
                size="small"
                variant={node.impacted ? 'filled' : 'outlined'}
                color={node.impacted ? (node.type === 'api' ? 'warning' : 'error') : 'default'}
              />
            ))}
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}
