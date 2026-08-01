import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import PauseIcon             from '@mui/icons-material/Pause';
import PlayArrowIcon         from '@mui/icons-material/PlayArrow';
import StopIcon              from '@mui/icons-material/Stop';
import CameraAltIcon         from '@mui/icons-material/CameraAlt';
import EditNoteIcon          from '@mui/icons-material/EditNote';
import TouchAppIcon          from '@mui/icons-material/TouchApp';
import ErrorIcon             from '@mui/icons-material/Error';
import type { TimelineEvent, TimelineEventType } from './types';

function fmtOffset(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type EventStyle = { icon: React.ReactNode; color: string };

const EVENT_STYLE: Record<TimelineEventType, EventStyle> = {
  recording_started:   { icon: <FiberManualRecordIcon sx={{ fontSize: 13 }} />, color: '#10B981' },
  recording_paused:    { icon: <PauseIcon sx={{ fontSize: 13 }} />,             color: '#F59E0B' },
  recording_resumed:   { icon: <PlayArrowIcon sx={{ fontSize: 13 }} />,         color: '#3B82F6' },
  recording_stopped:   { icon: <StopIcon sx={{ fontSize: 13 }} />,              color: '#6B7280' },
  recording_cancelled: { icon: <StopIcon sx={{ fontSize: 13 }} />,              color: '#EF4444' },
  action:              { icon: <TouchAppIcon sx={{ fontSize: 13 }} />,           color: '#4F46E5' },
  screenshot:          { icon: <CameraAltIcon sx={{ fontSize: 13 }} />,          color: '#06B6D4' },
  annotation:          { icon: <EditNoteIcon sx={{ fontSize: 13 }} />,           color: '#8B5CF6' },
  error:               { icon: <ErrorIcon sx={{ fontSize: 13 }} />,             color: '#EF4444' },
};

interface Props {
  events:    TimelineEvent[];
  maxHeight?: number;
}

export function TimelineViewer({ events, maxHeight = 420 }: Props) {
  if (events.length === 0) {
    return (
      <Box sx={{ py: 5, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No events yet. Start recording to capture the timeline.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxHeight, overflowY: 'auto', position: 'relative', pr: 0.5 }}>
      {/* Vertical connector line */}
      <Box sx={{
        position: 'absolute', left: 40, top: 12, bottom: 12,
        width: 1, bgcolor: 'divider', zIndex: 0,
      }} />

      {events.map(event => {
        const style = EVENT_STYLE[event.type] ?? EVENT_STYLE.action;
        return (
          <Box
            key={event.id}
            display="flex"
            alignItems="flex-start"
            gap={1.5}
            mb={1.5}
            sx={{ position: 'relative', zIndex: 1 }}
          >
            {/* Timestamp */}
            <Typography
              variant="caption"
              fontFamily="'Roboto Mono', monospace"
              color="text.disabled"
              sx={{ minWidth: 34, pt: 0.4, fontSize: 10.5 }}
            >
              {fmtOffset(event.offsetMs)}
            </Typography>

            {/* Icon bubble */}
            <Box sx={{
              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: `${style.color}18`, color: style.color,
              border: `1px solid ${style.color}40`,
            }}>
              {style.icon}
            </Box>

            {/* Description + metadata */}
            <Box flex={1} sx={{ pt: 0.35 }}>
              <Typography variant="body2" sx={{ lineHeight: 1.45 }}>
                {event.description}
              </Typography>
              {event.metadata && Object.keys(event.metadata).length > 0 && (
                <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.3}>
                  {Object.entries(event.metadata).slice(0, 4).map(([k, v]) => (
                    <Chip
                      key={k}
                      label={`${k}: ${String(v)}`}
                      size="small"
                      sx={{ height: 16, fontSize: 9, '& .MuiChip-label': { px: 0.75 } }}
                    />
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
