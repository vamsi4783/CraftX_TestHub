// ─── ExecutionProgress ────────────────────────────────────────────────────────
// Live progress panel shown during an autonomous test run.

import {
  Box, LinearProgress, Typography, Chip, Stack, Paper, Divider,
} from '@mui/material';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import LanguageIcon     from '@mui/icons-material/Language';
import CheckCircleIcon  from '@mui/icons-material/CheckCircle';
import CancelIcon       from '@mui/icons-material/Cancel';
import PendingIcon      from '@mui/icons-material/Pending';
import ImageIcon        from '@mui/icons-material/Image';
import type { RunnerState, StepProgress } from './runnerTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const STATE_COLOR: Record<RunnerState, string> = {
  Idle:             '#6B7280',
  Running:          '#4F46E5',
  PausedBeforeStep: '#F59E0B',
  PausedOnFailure:  '#EF4444',
  Cancelling:       '#F59E0B',
  Completed:        '#10B981',
  Failed:           '#EF4444',
  Cancelled:        '#6B7280',
};

const STATE_LABEL: Record<RunnerState, string> = {
  Idle:             'IDLE',
  Running:          'RUNNING',
  PausedBeforeStep: 'PAUSED',
  PausedOnFailure:  'PAUSED — FAILURE',
  Cancelling:       'CANCELLING',
  Completed:        'COMPLETED',
  Failed:           'FAILED',
  Cancelled:        'CANCELLED',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface ExecutionProgressProps {
  state:            RunnerState;
  currentStepIndex: number;
  stepProgress:     StepProgress[];
  elapsedMs:        number;
  evidenceCount:    number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExecutionProgress({
  state, currentStepIndex, stepProgress, elapsedMs, evidenceCount,
}: ExecutionProgressProps) {
  const total     = stepProgress.length;
  const passed    = stepProgress.filter(p => p.status === 'passed').length;
  const failed    = stepProgress.filter(p => p.status === 'failed').length;
  const skipped   = stepProgress.filter(p => p.status === 'skipped').length;
  const done      = passed + failed + skipped;
  const pct       = total > 0 ? Math.round((done / total) * 100) : 0;
  const current   = stepProgress[currentStepIndex] ?? null;
  const stateColor = STATE_COLOR[state] ?? '#6B7280';
  const isActive  = state === 'Running' || state === 'PausedBeforeStep' || state === 'PausedOnFailure';

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      {/* Header row */}
      <Box display="flex" alignItems="center" gap={1.5} mb={2}>
        <Box
          sx={{
            width: 10, height: 10, borderRadius: '50%',
            bgcolor: stateColor, flexShrink: 0,
            ...(state === 'Running' && {
              animation: 'pulse 1.4s ease-in-out infinite',
              '@keyframes pulse': {
                '0%,100%': { opacity: 1 },
                '50%':     { opacity: 0.3 },
              },
            }),
          }}
        />
        <Typography variant="subtitle2" fontWeight={700} sx={{ color: stateColor }}>
          {STATE_LABEL[state]}
        </Typography>
        <Box flex={1} />
        <Typography
          variant="body2"
          fontWeight={800}
          fontFamily="monospace"
          color="text.secondary"
        >
          {fmtTime(elapsedMs)}
        </Typography>
      </Box>

      {/* Progress bar */}
      <Box mb={2}>
        <Box display="flex" justifyContent="space-between" mb={0.5}>
          <Typography variant="caption" color="text.secondary">
            {done} / {total} steps
          </Typography>
          <Typography variant="caption" color="text.secondary">{pct}%</Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 6, borderRadius: 3,
            '& .MuiLinearProgress-bar': { bgcolor: stateColor },
          }}
        />
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Stats grid */}
      <Stack direction="row" spacing={1.5} mb={2} flexWrap="wrap" useFlexGap>
        <StatChip label="Passed"   value={passed}    color="#10B981" />
        <StatChip label="Failed"   value={failed}    color="#EF4444" />
        <StatChip label="Skipped"  value={skipped}   color="#6B7280" />
        <StatChip label="Remaining" value={total - done} color="#4F46E5" />
        <Box display="flex" alignItems="center" gap={0.5}>
          <ImageIcon sx={{ fontSize: 14, color: '#6B7280' }} />
          <Typography variant="caption" color="text.secondary">
            {evidenceCount} evidence
          </Typography>
        </Box>
      </Stack>

      {/* Current step */}
      {isActive && current && (
        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={0.5}>
            CURRENT STEP
          </Typography>
          <Box display="flex" alignItems="center" gap={1}>
            {current.driverId === 'android'
              ? <PhoneAndroidIcon sx={{ fontSize: 16, color: '#10B981' }} />
              : <LanguageIcon     sx={{ fontSize: 16, color: '#4F46E5' }} />}
            <Typography variant="body2" fontWeight={600}>
              {current.stepNumber}. {current.action.replace(/_/g, ' ')}
            </Typography>
            <Chip
              label={current.status}
              size="small"
              sx={{
                height: 18, fontSize: 10, fontWeight: 700, ml: 'auto',
                bgcolor: current.status === 'running' ? '#4F46E5'
                       : current.status === 'retrying' ? '#F59E0B' : 'default',
                color:   current.status === 'running' || current.status === 'retrying'
                         ? '#fff' : 'inherit',
              }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" mt={0.5} display="block"
            sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {current.description}
          </Typography>
        </Paper>
      )}
    </Paper>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box display="flex" alignItems="center" gap={0.5}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
      <Typography variant="caption" color="text.secondary">
        {label}:&nbsp;<strong>{value}</strong>
      </Typography>
    </Box>
  );
}
