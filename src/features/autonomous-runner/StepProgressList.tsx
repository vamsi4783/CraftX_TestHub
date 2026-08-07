// ─── StepProgressList ─────────────────────────────────────────────────────────
// Scrollable list of step statuses during / after a run.

import {
  Box, List, ListItem, ListItemIcon, ListItemText,
  Typography, Chip, Tooltip, LinearProgress,
} from '@mui/material';
import CheckCircleIcon    from '@mui/icons-material/CheckCircle';
import CancelIcon         from '@mui/icons-material/Cancel';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import SkipNextIcon       from '@mui/icons-material/SkipNext';
import RefreshIcon        from '@mui/icons-material/Refresh';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import PhoneAndroidIcon   from '@mui/icons-material/PhoneAndroid';
import LanguageIcon       from '@mui/icons-material/Language';
import type { StepProgress, StepRunStatus } from './runnerTypes';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StepRunStatus, {
  icon: React.ReactNode;
  color: string;
  label: string;
}> = {
  pending:  { icon: <RadioButtonUncheckedIcon sx={{ fontSize: 18 }} />, color: '#9CA3AF', label: 'Pending'  },
  running:  { icon: <HourglassEmptyIcon       sx={{ fontSize: 18 }} />, color: '#4F46E5', label: 'Running'  },
  passed:   { icon: <CheckCircleIcon          sx={{ fontSize: 18 }} />, color: '#10B981', label: 'Passed'   },
  failed:   { icon: <CancelIcon               sx={{ fontSize: 18 }} />, color: '#EF4444', label: 'Failed'   },
  skipped:  { icon: <SkipNextIcon             sx={{ fontSize: 18 }} />, color: '#6B7280', label: 'Skipped'  },
  retrying: { icon: <RefreshIcon              sx={{ fontSize: 18 }} />, color: '#F59E0B', label: 'Retrying' },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface StepProgressListProps {
  steps:            StepProgress[];
  currentStepIndex: number;
  maxHeight?:       number | string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StepProgressList({
  steps, currentStepIndex, maxHeight = 360,
}: StepProgressListProps) {
  if (steps.length === 0) {
    return (
      <Box py={4} textAlign="center">
        <Typography variant="body2" color="text.secondary">
          No automation steps configured.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxHeight, overflowY: 'auto' }}>
      <List disablePadding dense>
        {steps.map((step, idx) => {
          const cfg    = STATUS_CONFIG[step.status];
          const active = idx === currentStepIndex && (step.status === 'running' || step.status === 'retrying');

          return (
            <ListItem
              key={step.stepId}
              alignItems="flex-start"
              sx={{
                py: 0.75,
                borderLeft: `3px solid ${active ? cfg.color : 'transparent'}`,
                bgcolor: active ? 'action.hover' : 'transparent',
                transition: 'border-color 0.2s, background-color 0.2s',
              }}
            >
              {/* Status icon */}
              <ListItemIcon sx={{ minWidth: 32, color: cfg.color, mt: 0.25 }}>
                {cfg.icon}
              </ListItemIcon>

              {/* Main text */}
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                    <Typography variant="body2" fontWeight={active ? 700 : 400}>
                      {step.stepNumber}. {step.description}
                    </Typography>

                    {/* Driver chip */}
                    <Chip
                      icon={step.driverId === 'android'
                        ? <PhoneAndroidIcon sx={{ fontSize: 12 }} />
                        : <LanguageIcon     sx={{ fontSize: 12 }} />}
                      label={step.driverId}
                      size="small"
                      sx={{ height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.75 } }}
                    />

                    {/* Action badge */}
                    <Chip
                      label={step.action.replace(/_/g, ' ')}
                      size="small"
                      variant="outlined"
                      sx={{ height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.75 } }}
                    />

                    {/* Status chip */}
                    <Chip
                      label={cfg.label}
                      size="small"
                      sx={{
                        height: 18, fontSize: 10, fontWeight: 700, ml: 'auto',
                        bgcolor: cfg.color + '22',
                        color: cfg.color,
                        border: `1px solid ${cfg.color}44`,
                      }}
                    />
                  </Box>
                }
                secondary={
                  <>
                    {/* Running progress bar */}
                    {active && (
                      <LinearProgress
                        sx={{ mt: 0.5, height: 2, borderRadius: 1,
                          '& .MuiLinearProgress-bar': { bgcolor: cfg.color } }}
                      />
                    )}

                    {/* Error message */}
                    {step.status === 'failed' && step.error && (
                      <Tooltip title={step.error} placement="bottom-start">
                        <Typography
                          variant="caption"
                          color="error"
                          sx={{
                            display: 'block', mt: 0.25,
                            maxWidth: 380, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                        >
                          {step.error}
                        </Typography>
                      </Tooltip>
                    )}

                    {/* Duration / retry info */}
                    {step.status === 'passed' && (
                      <Typography variant="caption" color="text.secondary">
                        {step.duration_ms}ms
                        {step.retryCount > 0 && ` · ${step.retryCount} retr${step.retryCount === 1 ? 'y' : 'ies'}`}
                      </Typography>
                    )}

                    {step.status === 'retrying' && (
                      <Typography variant="caption" sx={{ color: '#F59E0B' }}>
                        Retry {step.retryCount}…
                      </Typography>
                    )}
                  </>
                }
              />
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
}
