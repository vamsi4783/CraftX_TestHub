// ─── RunnerControls ───────────────────────────────────────────────────────────
// Buttons for controlling an autonomous test run.

import {
  Box, Button, ButtonGroup, Divider, Stack, Typography, Tooltip,
} from '@mui/material';
import PlayArrowIcon  from '@mui/icons-material/PlayArrow';
import PauseIcon      from '@mui/icons-material/Pause';
import StopIcon       from '@mui/icons-material/Stop';
import SkipNextIcon   from '@mui/icons-material/SkipNext';
import RefreshIcon    from '@mui/icons-material/Refresh';
import CheckIcon      from '@mui/icons-material/Check';
import ReplayIcon     from '@mui/icons-material/Replay';
import type { RunnerState } from './runnerTypes';

// ─── Props ────────────────────────────────────────────────────────────────────

interface RunnerControlsProps {
  state:            RunnerState;
  currentStepIndex: number;
  onStart:    () => void;
  onPause:    () => void;
  onResume:   () => void;
  onCancel:   () => void;
  onRetry:    () => void;   // SemiAuto: retry failed step
  onSkip:     () => void;   // SemiAuto: skip failed step
  onConfirm:  () => void;   // Manual: confirm / advance to next step
  onReset:    () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RunnerControls({
  state, onStart, onPause, onResume, onCancel,
  onRetry, onSkip, onConfirm, onReset,
}: RunnerControlsProps) {
  const isIdle       = state === 'Idle';
  const isRunning    = state === 'Running';
  const isPaused     = state === 'PausedBeforeStep';
  const isFailPaused = state === 'PausedOnFailure';
  const isTerminal   = state === 'Completed' || state === 'Failed' || state === 'Cancelled';
  const isCancelling = state === 'Cancelling';

  return (
    <Box>
      {/* Idle: show Execute */}
      {isIdle && (
        <Button
          variant="contained"
          color="primary"
          startIcon={<PlayArrowIcon />}
          onClick={onStart}
          fullWidth
        >
          Execute
        </Button>
      )}

      {/* Running: Pause + Cancel */}
      {isRunning && (
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<PauseIcon />}
            onClick={onPause}
            sx={{ flex: 1 }}
          >
            Pause
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<StopIcon />}
            onClick={onCancel}
            sx={{ flex: 1 }}
          >
            Cancel
          </Button>
        </Stack>
      )}

      {/* Paused before step (Manual / user-triggered) */}
      {isPaused && (
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<CheckIcon />}
            onClick={onConfirm}
            sx={{ flex: 1 }}
          >
            Confirm Step
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<StopIcon />}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </Stack>
      )}

      {/* Paused on failure (SemiAuto) */}
      {isFailPaused && (
        <>
          <Typography variant="caption" color="error" display="block" mb={1} fontWeight={600}>
            Step failed — choose an action:
          </Typography>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Retry the failed step">
              <Button
                variant="contained"
                color="warning"
                startIcon={<RefreshIcon />}
                onClick={onRetry}
                sx={{ flex: 1 }}
              >
                Retry
              </Button>
            </Tooltip>
            <Tooltip title="Skip this step and continue">
              <Button
                variant="outlined"
                startIcon={<SkipNextIcon />}
                onClick={onSkip}
                sx={{ flex: 1 }}
              >
                Skip
              </Button>
            </Tooltip>
            <Tooltip title="Abort the run">
              <Button
                variant="outlined"
                color="error"
                startIcon={<StopIcon />}
                onClick={onCancel}
              >
                Abort
              </Button>
            </Tooltip>
          </Stack>
        </>
      )}

      {/* Cancelling */}
      {isCancelling && (
        <Button variant="outlined" disabled fullWidth startIcon={<StopIcon />}>
          Cancelling…
        </Button>
      )}

      {/* Terminal: Run Again + Reset */}
      {isTerminal && (
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={onStart}
            sx={{ flex: 1 }}
          >
            Run Again
          </Button>
          <Button
            variant="outlined"
            startIcon={<ReplayIcon />}
            onClick={onReset}
          >
            Reset
          </Button>
        </Stack>
      )}
    </Box>
  );
}
