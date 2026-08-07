// ─── ReviewScreen ─────────────────────────────────────────────────────────────
// Full-screen overlay showing recorded steps after a session ends.
// Users can inspect, edit params, delete, reorder, then merge into a test case.
// Nothing is auto-saved.

import { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogContent, Divider, IconButton,
  Paper, Stack, TextField, Tooltip, Typography, Alert,
  Collapse,
} from '@mui/material';
import ArrowUpwardIcon    from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon  from '@mui/icons-material/ArrowDownward';
import DeleteOutlineIcon  from '@mui/icons-material/DeleteOutline';
import EditIcon           from '@mui/icons-material/Edit';
import CheckIcon          from '@mui/icons-material/Check';
import CloseIcon          from '@mui/icons-material/Close';
import MergeIcon          from '@mui/icons-material/CallMerge';
import PhoneAndroidIcon   from '@mui/icons-material/PhoneAndroid';
import LanguageIcon       from '@mui/icons-material/Language';
import { MergeDialog }    from './MergeDialog';
import { ACTION_UI_META } from './recorderTypes';
import type { RecordedStep, RecordedParams, RecordableAction } from './recorderTypes';

// ─── Driver icon ──────────────────────────────────────────────────────────────

function DriverIcon({ driver }: { driver: RecordedStep['driver'] }) {
  return driver === 'android'
    ? <PhoneAndroidIcon sx={{ fontSize: 14, color: '#10B981' }} />
    : <LanguageIcon     sx={{ fontSize: 14, color: '#4F46E5' }} />;
}

// ─── Inline param editor ──────────────────────────────────────────────────────

function ParamEditor({
  action,
  params,
  onChange,
}: {
  action:   RecordableAction;
  params:   RecordedParams;
  onChange: (p: RecordedParams) => void;
}) {
  const meta    = ACTION_UI_META[action];
  const hints   = meta?.paramHints ?? [];

  if (hints.length === 0) {
    return (
      <Alert severity="info" sx={{ py: 0.5, fontSize: 12 }}>
        No parameters for this action.
      </Alert>
    );
  }

  const set = (key: string, val: string) => {
    const num = ['x','y','x2','y2','duration_ms','amount','timeout_ms'].includes(key);
    onChange({ ...params, [key]: num ? (val ? Number(val) : undefined) : val });
  };

  return (
    <Box display="flex" flexWrap="wrap" gap={1}>
      {hints.map(key => (
        <TextField
          key={key}
          label={key}
          size="small"
          value={(params as Record<string, unknown>)[key] ?? ''}
          onChange={e => set(key, e.target.value)}
          sx={{ width: 140 }}
          type={['x','y','x2','y2','duration_ms','amount','timeout_ms'].includes(key) ? 'number' : 'text'}
        />
      ))}
    </Box>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────

interface StepCardProps {
  step:        RecordedStep;
  index:       number;
  total:       number;
  onDelete:    (id: string) => void;
  onUpdate:    (id: string, params: RecordedParams) => void;
  onMoveUp:    (id: string) => void;
  onMoveDown:  (id: string) => void;
}

function StepCard({ step, index, total, onDelete, onUpdate, onMoveUp, onMoveDown }: StepCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState<RecordedParams>(step.params);

  const meta     = ACTION_UI_META[step.action];
  const hasParams = Object.keys(step.params).length > 0;

  const commit = () => {
    onUpdate(step.id, draft);
    setEditing(false);
  };

  const discard = () => {
    setDraft(step.params);
    setEditing(false);
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, position: 'relative' }}>
      <Box display="flex" alignItems="flex-start" gap={1}>
        {/* Step number */}
        <Box
          sx={{
            width: 24, height: 24, borderRadius: '50%',
            bgcolor: 'primary.main', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, flexShrink: 0, mt: 0.25,
          }}
        >
          {index + 1}
        </Box>

        <Box flex={1} minWidth={0}>
          {/* Action + driver */}
          <Box display="flex" alignItems="center" gap={0.75} flexWrap="wrap">
            <DriverIcon driver={step.driver} />
            <Typography variant="body2" fontWeight={700} sx={{ textTransform: 'capitalize' }}>
              {meta?.label ?? step.action}
            </Typography>
            <Chip
              label={step.driver}
              size="small"
              sx={{ height: 18, fontSize: 10, fontWeight: 600 }}
            />
            {meta && (
              <Typography variant="caption" color="text.secondary">
                {meta.description}
              </Typography>
            )}
          </Box>

          {/* Params display / editor */}
          <Collapse in={!editing} unmountOnExit>
            {hasParams && (
              <Box mt={0.75} sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.secondary', bgcolor: 'action.hover', borderRadius: 1, px: 1, py: 0.5 }}>
                {Object.entries(step.params)
                  .filter(([, v]) => v !== undefined)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join('  ·  ')}
              </Box>
            )}
          </Collapse>

          <Collapse in={editing} unmountOnExit>
            <Box mt={1}>
              <ParamEditor action={step.action} params={draft} onChange={setDraft} />
              <Box display="flex" gap={1} mt={1}>
                <Button size="small" variant="contained" startIcon={<CheckIcon />} onClick={commit} sx={{ py: 0.25 }}>Save</Button>
                <Button size="small" startIcon={<CloseIcon />} onClick={discard} sx={{ py: 0.25 }}>Discard</Button>
              </Box>
            </Box>
          </Collapse>

          {/* Metadata footer */}
          <Typography variant="caption" color="text.disabled" display="block" mt={0.5}>
            {new Date(step.metadata.created_at).toLocaleTimeString()} · v{step.schema_version}
          </Typography>
        </Box>

        {/* Controls */}
        <Box display="flex" flexDirection="column" alignItems="center" gap={0.25}>
          <Tooltip title="Move up">
            <span>
              <IconButton size="small" disabled={index === 0} onClick={() => onMoveUp(step.id)}>
                <ArrowUpwardIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Move down">
            <span>
              <IconButton size="small" disabled={index === total - 1} onClick={() => onMoveDown(step.id)}>
                <ArrowDownwardIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={editing ? 'Cancel edit' : 'Edit params'}>
            <IconButton size="small" color={editing ? 'warning' : 'default'} onClick={() => editing ? discard() : setEditing(true)}>
              <EditIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete step">
            <IconButton size="small" color="error" onClick={() => onDelete(step.id)}>
              <DeleteOutlineIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Paper>
  );
}

// ─── ReviewScreen ─────────────────────────────────────────────────────────────

interface ReviewScreenProps {
  open:        boolean;
  onClose:     () => void;
  steps:       RecordedStep[];
  recordingId: string | null;
  projectId:   string;
  onRemoveStep:  (id: string) => void;
  onUpdateParams:(id: string, params: RecordedParams) => void;
  onReorder:   (ids: string[]) => void;
  onClear:     () => void;
}

export function ReviewScreen({
  open, onClose, steps, recordingId, projectId,
  onRemoveStep, onUpdateParams, onReorder, onClear,
}: ReviewScreenProps) {
  const [mergeOpen, setMergeOpen] = useState(false);

  const moveUp = (id: string) => {
    const idx = steps.findIndex(s => s.id === id);
    if (idx <= 0) return;
    const ids = steps.map(s => s.id);
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    onReorder(ids);
  };

  const moveDown = (id: string) => {
    const idx = steps.findIndex(s => s.id === id);
    if (idx < 0 || idx >= steps.length - 1) return;
    const ids = steps.map(s => s.id);
    [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    onReorder(ids);
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
        PaperProps={{ sx: { height: '85vh', display: 'flex', flexDirection: 'column' } }}>

        {/* Header */}
        <Box sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box flex={1}>
            <Typography variant="h6" fontWeight={700}>Review Recorded Steps</Typography>
            <Typography variant="caption" color="text.secondary">
              Inspect, edit, reorder, or delete steps before merging into a test case.
              Nothing is saved until you click Merge.
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Box>

        {/* Body */}
        <DialogContent sx={{ flex: 1, overflowY: 'auto', py: 2 }}>
          {steps.length === 0 ? (
            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%" gap={1}>
              <Typography color="text.secondary">No steps recorded yet.</Typography>
            </Box>
          ) : (
            <Stack spacing={1}>
              {steps.map((step, i) => (
                <StepCard
                  key={step.id}
                  step={step}
                  index={i}
                  total={steps.length}
                  onDelete={onRemoveStep}
                  onUpdate={onUpdateParams}
                  onMoveUp={moveUp}
                  onMoveDown={moveDown}
                />
              ))}
            </Stack>
          )}
        </DialogContent>

        <Divider />

        {/* Footer */}
        <Box sx={{ px: 3, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip label={`${steps.length} step${steps.length !== 1 ? 's' : ''}`} size="small" />
          <Box flex={1} />
          <Button
            size="small"
            color="error"
            variant="outlined"
            disabled={steps.length === 0}
            startIcon={<DeleteOutlineIcon />}
            onClick={onClear}
          >
            Clear All
          </Button>
          <Button
            size="small"
            variant="contained"
            disabled={steps.length === 0}
            startIcon={<MergeIcon />}
            onClick={() => setMergeOpen(true)}
          >
            Merge into Test Case
          </Button>
        </Box>
      </Dialog>

      <MergeDialog
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        steps={steps}
        recordingId={recordingId}
        projectId={projectId}
        onMerged={() => {
          setMergeOpen(false);
          onClear();
          onClose();
        }}
      />
    </>
  );
}
