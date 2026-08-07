// ─── ExecutionReport ──────────────────────────────────────────────────────────
// End-of-run summary with result, timeline, and step breakdown.

import {
  Box, Paper, Typography, Divider, Stack, Chip, List, ListItem,
  ListItemIcon, ListItemText, Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import CheckCircleIcon       from '@mui/icons-material/CheckCircle';
import CancelIcon            from '@mui/icons-material/Cancel';
import WarningAmberIcon      from '@mui/icons-material/WarningAmber';
import ExpandMoreIcon        from '@mui/icons-material/ExpandMore';
import TimelineIcon          from '@mui/icons-material/Timeline';
import ListAltIcon           from '@mui/icons-material/ListAlt';
import type { RunnerReport, RunnerTimelineEvent } from './runnerTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtOffset(ms: number): string {
  return `+${(ms / 1000).toFixed(2)}s`;
}

const KIND_COLOR: Record<string, string> = {
  RunStarted:       '#4F46E5',
  RunCompleted:     '#10B981',
  RunFailed:        '#EF4444',
  Cancelled:        '#6B7280',
  StepStarted:      '#6B7280',
  StepPassed:       '#10B981',
  StepFailed:       '#EF4444',
  StepSkipped:      '#9CA3AF',
  StepRetrying:     '#F59E0B',
  PausedBeforeStep: '#F59E0B',
  PausedOnFailure:  '#EF4444',
  Resumed:          '#4F46E5',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function TimelineRow({ ev }: { ev: RunnerTimelineEvent }) {
  const color = KIND_COLOR[ev.kind] ?? '#6B7280';
  return (
    <ListItem dense disableGutters sx={{ py: 0.25 }}>
      <ListItemIcon sx={{ minWidth: 28 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, mt: 0.5 }} />
      </ListItemIcon>
      <ListItemText
        primary={
          <Box display="flex" alignItems="baseline" gap={1}>
            <Typography
              variant="caption"
              fontFamily="monospace"
              color="text.secondary"
              sx={{ minWidth: 52, flexShrink: 0 }}
            >
              {fmtOffset(ev.offsetMs)}
            </Typography>
            <Typography variant="caption" fontWeight={600} sx={{ color }}>
              {ev.kind}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {ev.message}
            </Typography>
          </Box>
        }
      />
    </ListItem>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ExecutionReportProps {
  report: RunnerReport;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExecutionReport({ report }: ExecutionReportProps) {
  const success  = report.state === 'Completed';
  const failed   = report.state === 'Failed';
  const colour   = success ? '#10B981' : failed ? '#EF4444' : '#6B7280';
  const Icon     = success ? CheckCircleIcon : failed ? CancelIcon : WarningAmberIcon;
  const passRate = report.totalSteps > 0
    ? Math.round((report.passedSteps / report.totalSteps) * 100)
    : 0;

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      {/* Result header */}
      <Box display="flex" alignItems="center" gap={1.5} mb={2.5}>
        <Icon sx={{ color: colour, fontSize: 28 }} />
        <Box>
          <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
            {success ? 'Run Completed' : failed ? 'Run Failed' : 'Run Cancelled'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {fmtTime(report.duration_ms)} · Mode: {report.mode}
          </Typography>
        </Box>
        <Chip
          label={`${passRate}% pass rate`}
          size="small"
          sx={{ ml: 'auto', bgcolor: colour + '22', color: colour, fontWeight: 700 }}
        />
      </Box>

      {/* Stats row */}
      <Stack direction="row" spacing={3} mb={2.5}>
        <StatItem label="Total"   value={report.totalSteps}   color="#4F46E5" />
        <StatItem label="Passed"  value={report.passedSteps}  color="#10B981" />
        <StatItem label="Failed"  value={report.failedSteps}  color="#EF4444" />
        <StatItem label="Skipped" value={report.skippedSteps} color="#6B7280" />
      </Stack>

      {(report.error || report.cancelReason) && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: '#FEF2F2' }}>
          <Typography variant="caption" color="error" fontWeight={600}>
            {report.error ?? report.cancelReason}
          </Typography>
        </Paper>
      )}

      <Divider sx={{ mb: 2 }} />

      {/* Timeline accordion */}
      <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40 }}>
          <Box display="flex" alignItems="center" gap={1}>
            <TimelineIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography variant="body2" fontWeight={600}>
              Timeline ({report.timelineEvents.length} events)
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0, maxHeight: 260, overflowY: 'auto' }}>
          <List disablePadding sx={{ px: 1, pb: 1 }}>
            {report.timelineEvents.map(ev => (
              <TimelineRow key={ev.id} ev={ev} />
            ))}
          </List>
        </AccordionDetails>
      </Accordion>

      {/* Step breakdown accordion */}
      <Accordion
        disableGutters elevation={0}
        sx={{ border: '1px solid', borderColor: 'divider', borderTop: 'none', mt: 0 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40 }}>
          <Box display="flex" alignItems="center" gap={1}>
            <ListAltIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography variant="body2" fontWeight={600}>
              Step Results ({report.totalSteps} steps)
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0, maxHeight: 280, overflowY: 'auto' }}>
          <List disablePadding dense>
            {report.stepProgress.map(s => {
              const ok = s.status === 'passed';
              const c  = ok ? '#10B981' : s.status === 'failed' ? '#EF4444'
                        : s.status === 'skipped' ? '#6B7280' : '#4F46E5';
              return (
                <ListItem key={s.stepId} dense sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="caption" fontWeight={600}>
                        {s.stepNumber}. {s.description}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        {s.action.replace(/_/g, ' ')} · {s.status}
                        {s.duration_ms > 0 && ` · ${s.duration_ms}ms`}
                        {s.retryCount > 0 && ` · ${s.retryCount} retr${s.retryCount === 1 ? 'y' : 'ies'}`}
                        {s.error && ` — ${s.error}`}
                      </Typography>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        </AccordionDetails>
      </Accordion>
    </Paper>
  );
}

function StatItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box textAlign="center">
      <Typography variant="h5" fontWeight={800} sx={{ color }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}
