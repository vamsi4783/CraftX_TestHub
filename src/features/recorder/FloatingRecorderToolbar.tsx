import React, { useState } from 'react';
import {
  Box, Paper, IconButton, Typography, Tooltip, CircularProgress,
  Fade, Chip, Collapse, Button,
} from '@mui/material';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import PauseIcon              from '@mui/icons-material/Pause';
import PlayArrowIcon          from '@mui/icons-material/PlayArrow';
import StopIcon               from '@mui/icons-material/Stop';
import CloseIcon              from '@mui/icons-material/Close';
import PhoneAndroidIcon       from '@mui/icons-material/PhoneAndroid';
import StorageIcon            from '@mui/icons-material/Storage';
import CameraAltIcon          from '@mui/icons-material/CameraAlt';
import CheckCircleIcon        from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon       from '@mui/icons-material/ErrorOutline';
import AddCircleOutlineIcon   from '@mui/icons-material/AddCircleOutline';
import RateReviewIcon         from '@mui/icons-material/RateReview';
import { useRecorderContext }  from './RecorderContext';
import { useAutomationRecorder } from './useAutomationRecorder';
import { RecordActionDialog }  from './RecordActionDialog';
import { ReviewScreen }        from './ReviewScreen';
import { useAuth }             from '@/hooks/useAuth';
import type { RecordingState } from './types';
import type { RecordableDriver, RecordableAction, RecordedParams } from './recorderTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ─── Recording indicator dot ──────────────────────────────────────────────────

function RecordingDot({ state }: { state: RecordingState }) {
  if (state === 'RECORDING') {
    return (
      <Box sx={{
        width: 10, height: 10, borderRadius: '50%', bgcolor: '#EF4444', flexShrink: 0,
        animation: 'rec-pulse 1.3s ease-in-out infinite',
        '@keyframes rec-pulse': {
          '0%, 100%': { opacity: 1, transform: 'scale(1)' },
          '50%':      { opacity: 0.25, transform: 'scale(0.75)' },
        },
      }} />
    );
  }
  if (state === 'PAUSED') {
    return <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#F59E0B', flexShrink: 0 }} />;
  }
  if (state === 'STOPPING' || state === 'SAVING') {
    return <CircularProgress size={10} thickness={6} sx={{ color: '#4F46E5' }} />;
  }
  return null;
}

// ─── State badge ─────────────────────────────────────────────────────────────

const STATE_BADGE: Record<RecordingState, { label: string; color: string; bg: string }> = {
  IDLE:      { label: 'IDLE',      color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
  READY:     { label: 'READY',     color: '#4F46E5', bg: 'rgba(79,70,229,0.12)'  },
  RECORDING: { label: 'REC',       color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
  PAUSED:    { label: 'PAUSED',    color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  STOPPING:  { label: 'STOPPING',  color: '#4F46E5', bg: 'rgba(79,70,229,0.12)'  },
  SAVING:    { label: 'SAVING',    color: '#4F46E5', bg: 'rgba(79,70,229,0.12)'  },
  COMPLETED: { label: 'DONE',      color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  CANCELLED: { label: 'CANCELLED', color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
  ERROR:     { label: 'ERROR',     color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
};

// ─── Runner status dot ────────────────────────────────────────────────────────

const RUNNER_COLOR = {
  connected:    '#10B981',
  connecting:   '#F59E0B',
  disconnected: '#6B7280',
  error:        '#EF4444',
} as const;

// ─── Toolbar border color by state ───────────────────────────────────────────

function borderColor(state: RecordingState): string {
  if (state === 'RECORDING') return 'rgba(239,68,68,0.45)';
  if (state === 'PAUSED')    return 'rgba(245,158,11,0.45)';
  if (state === 'READY')     return 'rgba(79,70,229,0.35)';
  return 'rgba(79,70,229,0.2)';
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FloatingRecorderToolbar({ projectId = '' }: { projectId?: string }) {
  const {
    state, session, elapsedMs, runnerStatus, storageEstimate,
    startRecording, pause, resume, stop, cancel, reset, captureScreenshot,
  } = useRecorderContext();

  const { profile } = useAuth();
  const automationRecorder = useAutomationRecorder(profile?.id ?? 'unknown');

  const [confirmCancel,  setConfirmCancel]  = useState(false);
  const [logActionOpen,  setLogActionOpen]  = useState(false);
  const [reviewOpen,     setReviewOpen]     = useState(false);

  const handleLogAction = (driver: RecordableDriver, action: RecordableAction, params: RecordedParams) => {
    automationRecorder.record(driver, action, params);
  };

  const visible = state !== 'IDLE' && state !== 'CANCELLED';

  const isReady     = state === 'READY';
  const isRecording = state === 'RECORDING';
  const isPaused    = state === 'PAUSED';
  const isBusy      = state === 'STOPPING' || state === 'SAVING';
  const isCompleted = state === 'COMPLETED';
  const isError     = state === 'ERROR';

  const badge = STATE_BADGE[state];

  return (
    <>
    <Fade in={visible} unmountOnExit>
      <Paper
        elevation={10}
        sx={{
          position: 'fixed',
          bottom: 28,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1500,
          borderRadius: 3,
          overflow: 'hidden',
          minWidth: 460,
          maxWidth: '92vw',
          border: `1.5px solid ${borderColor(state)}`,
          bgcolor: 'background.paper',
        }}
      >
        {/* Saving / Stopping progress stripe */}
        {isBusy && (
          <Box sx={{
            height: 3,
            background: 'linear-gradient(90deg, #4F46E5 0%, #818CF8 50%, #4F46E5 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s linear infinite',
            '@keyframes shimmer': { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
          }} />
        )}

        <Box sx={{ px: 2, pt: 1.5, pb: 1.5 }}>

          {/* ── Row 1: Status info ──────────────────────────────────────── */}
          <Box display="flex" alignItems="center" gap={1.5} mb={1.25}>

            <RecordingDot state={state} />

            {/* Timer */}
            <Typography
              variant="body2"
              fontWeight={800}
              fontFamily="'Roboto Mono', monospace"
              sx={{
                fontSize: '1.05rem',
                minWidth: 54,
                letterSpacing: '-0.5px',
                color: isRecording ? '#EF4444' : isPaused ? '#F59E0B' : 'text.primary',
              }}
            >
              {fmtTime(elapsedMs)}
            </Typography>

            {/* State badge */}
            <Chip
              label={badge.label}
              size="small"
              sx={{
                height: 20, fontSize: 10, fontWeight: 800, letterSpacing: '0.05em',
                color: badge.color, bgcolor: badge.bg, border: 'none',
              }}
            />

            <Box flex={1} />

            {/* Device name */}
            {session?.deviceName && (
              <Tooltip title={`Device: ${session.deviceName}${session.deviceOs ? ` · ${session.deviceOs}` : ''}`}>
                <Box display="flex" alignItems="center" gap={0.5} sx={{ cursor: 'default' }}>
                  <PhoneAndroidIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 110 }}>
                    {session.deviceName}
                  </Typography>
                </Box>
              </Tooltip>
            )}

            {/* Runner status */}
            <Tooltip title={`Automation Runner: ${runnerStatus}`}>
              <Box display="flex" alignItems="center" gap={0.5} sx={{ cursor: 'default' }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: RUNNER_COLOR[runnerStatus] }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                  Runner
                </Typography>
              </Box>
            </Tooltip>

            {/* Storage estimate */}
            <Tooltip title={`~${storageEstimate.estimatedMb} MB estimated (${storageEstimate.screenshotCount} screenshots)`}>
              <Box display="flex" alignItems="center" gap={0.5} sx={{ cursor: 'default' }}>
                <StorageIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                  {storageEstimate.estimatedMb} MB
                </Typography>
              </Box>
            </Tooltip>
          </Box>

          {/* ── Row 2: Build info ────────────────────────────────────────── */}
          {session?.buildVersion && (
            <Typography variant="caption" color="text.disabled" sx={{ mb: 1, display: 'block', fontSize: 10 }}>
              Build {session.buildVersion}
              {session.localFolder && ` · ${session.localFolder}`}
            </Typography>
          )}

          {/* ── Row 3: Controls ──────────────────────────────────────────── */}

          {/* Cancel confirmation inline */}
          <Collapse in={confirmCancel}>
            <Box display="flex" alignItems="center" gap={1} mb={confirmCancel ? 1 : 0}>
              <Typography variant="caption" color="error.main" flex={1} fontWeight={600}>
                Cancel recording? All video, screenshots and logs will be deleted.
              </Typography>
              <Chip
                label="Yes, delete all"
                color="error"
                size="small"
                clickable
                onClick={() => { setConfirmCancel(false); cancel(); }}
                sx={{ fontWeight: 700, fontSize: 11 }}
              />
              <Chip
                label="Keep recording"
                size="small"
                clickable
                onClick={() => setConfirmCancel(false)}
                sx={{ fontWeight: 700, fontSize: 11 }}
              />
            </Box>
          </Collapse>

          {/* Completed banner */}
          {isCompleted && (
            <Box display="flex" alignItems="center" gap={1.5}>
              <CheckCircleIcon sx={{ color: '#10B981', fontSize: 20 }} />
              <Typography variant="body2" fontWeight={600} color="success.main" flex={1}>
                Recording saved.
                {automationRecorder.stepCount > 0 && ` ${automationRecorder.stepCount} step${automationRecorder.stepCount !== 1 ? 's' : ''} recorded.`}
              </Typography>
              {automationRecorder.stepCount > 0 && (
                <Chip
                  label="Review Steps"
                  icon={<RateReviewIcon sx={{ fontSize: 14 }} />}
                  size="small"
                  color="primary"
                  clickable
                  onClick={() => setReviewOpen(true)}
                  sx={{ fontWeight: 700 }}
                />
              )}
              <Chip label="Dismiss" size="small" clickable onClick={() => { reset(); automationRecorder.clear(); }} sx={{ fontWeight: 700 }} />
            </Box>
          )}

          {/* Error banner */}
          {isError && (
            <Box display="flex" alignItems="center" gap={1.5}>
              <ErrorOutlineIcon sx={{ color: '#EF4444', fontSize: 20 }} />
              <Typography variant="body2" fontWeight={600} color="error.main" flex={1}>
                Recording error. Session data may be incomplete.
              </Typography>
              <Chip label="Dismiss" size="small" clickable onClick={reset} sx={{ fontWeight: 700 }} />
            </Box>
          )}

          {/* Normal controls */}
          {!isCompleted && !isError && (
            <Box display="flex" alignItems="center" gap={0.75}>

              {/* ● Record — only when READY */}
              {isReady && (
                <Tooltip title="Start Recording">
                  <IconButton
                    onClick={startRecording}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(239,68,68,0.1)', color: '#EF4444',
                      '&:hover': { bgcolor: 'rgba(239,68,68,0.2)' },
                    }}
                  >
                    <FiberManualRecordIcon />
                  </IconButton>
                </Tooltip>
              )}

              {/* ⏸ Pause — only when RECORDING */}
              {isRecording && (
                <Tooltip title="Pause — timer and video pause, logcat continues">
                  <IconButton
                    onClick={pause}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(245,158,11,0.1)', color: '#F59E0B',
                      '&:hover': { bgcolor: 'rgba(245,158,11,0.22)' },
                    }}
                  >
                    <PauseIcon />
                  </IconButton>
                </Tooltip>
              )}

              {/* ▶ Resume — only when PAUSED */}
              {isPaused && (
                <Tooltip title="Resume recording">
                  <IconButton
                    onClick={resume}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(16,185,129,0.1)', color: '#10B981',
                      '&:hover': { bgcolor: 'rgba(16,185,129,0.22)' },
                    }}
                  >
                    <PlayArrowIcon />
                  </IconButton>
                </Tooltip>
              )}

              {/* 📷 Screenshot — when RECORDING or PAUSED */}
              {(isRecording || isPaused) && (
                <Tooltip title="Manual screenshot">
                  <IconButton
                    onClick={() => captureScreenshot('manual')}
                    size="small"
                    sx={{ color: 'text.secondary', '&:hover': { color: '#4F46E5' } }}
                  >
                    <CameraAltIcon sx={{ fontSize: 19 }} />
                  </IconButton>
                </Tooltip>
              )}

              {/* ➕ Log Action — when RECORDING or PAUSED */}
              {(isRecording || isPaused) && (
                <Tooltip title={`Log action · ${automationRecorder.stepCount} logged`}>
                  <Box display="flex" alignItems="center">
                    <IconButton
                      onClick={() => setLogActionOpen(true)}
                      size="small"
                      sx={{ color: '#4F46E5', '&:hover': { bgcolor: 'rgba(79,70,229,0.1)' } }}
                    >
                      <AddCircleOutlineIcon sx={{ fontSize: 19 }} />
                    </IconButton>
                    {automationRecorder.stepCount > 0 && (
                      <Typography variant="caption" fontWeight={700} color="primary" sx={{ ml: -0.5 }}>
                        {automationRecorder.stepCount}
                      </Typography>
                    )}
                  </Box>
                </Tooltip>
              )}

              {/* ■ Stop — when RECORDING or PAUSED */}
              {(isRecording || isPaused) && (
                <Tooltip title="Stop — saves all data">
                  <IconButton
                    onClick={stop}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(107,114,128,0.1)', color: '#6B7280',
                      '&:hover': { bgcolor: 'rgba(107,114,128,0.22)' },
                    }}
                  >
                    <StopIcon />
                  </IconButton>
                </Tooltip>
              )}

              {/* Saving spinner */}
              {isBusy && (
                <Box display="flex" alignItems="center" gap={1}>
                  <CircularProgress size={18} thickness={5} sx={{ color: '#4F46E5' }} />
                  <Typography variant="caption" color="text.secondary">
                    {state === 'STOPPING' ? 'Flushing…' : 'Saving metadata…'}
                  </Typography>
                </Box>
              )}

              <Box flex={1} />

              {/* ✖ Cancel — not shown when busy */}
              {!isBusy && !confirmCancel && (
                <Tooltip title="Cancel — deletes everything, no record saved">
                  <IconButton
                    onClick={() => setConfirmCancel(true)}
                    size="small"
                    sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                  >
                    <CloseIcon sx={{ fontSize: 17 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          )}
        </Box>
      </Paper>
    </Fade>

    <RecordActionDialog
      open={logActionOpen}
      onClose={() => setLogActionOpen(false)}
      onLog={handleLogAction}
    />

    <ReviewScreen
      open={reviewOpen}
      onClose={() => setReviewOpen(false)}
      steps={automationRecorder.steps}
      recordingId={session?.id ?? null}
      projectId={projectId}
      onRemoveStep={automationRecorder.removeStep}
      onUpdateParams={automationRecorder.updateParams}
      onReorder={automationRecorder.reorder}
      onClear={automationRecorder.clear}
    />
    </>
  );
}
