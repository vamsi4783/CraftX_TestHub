// ─── Healing Review Page (Phase 4 M7) ────────────────────────────────────────
// Lists healing events from the current session (or fetched from DB).
// Users can: review healed steps, compare locators, accept/reject, export.

import {
  Box, Container, Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Button, Stack, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Divider, LinearProgress, Tooltip, IconButton, Snackbar,
} from '@mui/material';
import CheckCircleIcon    from '@mui/icons-material/CheckCircle';
import CancelIcon         from '@mui/icons-material/Cancel';
import CompareIcon        from '@mui/icons-material/Compare';
import DownloadIcon       from '@mui/icons-material/Download';
import AutoFixHighIcon    from '@mui/icons-material/AutoFixHigh';
import { useState, useEffect } from 'react';
import { supabase }            from '@/lib/supabase';

// ─── Local types (mirrors DB shape) ──────────────────────────────────────────

interface HealingRow {
  id:                          string;
  run_id:                      string;
  session_id:                  string;
  step_id:                     string;
  step_number:                 number;
  outcome:                     'healed' | 'failed' | 'not_applicable';
  strategy_used:               string | null;
  confidence:                  number | null;
  original_error:              string;
  original_locator_strategy:   string | null;
  original_locator_value:      string | null;
  resolved_locator_strategy:   string | null;
  resolved_locator_value:      string | null;
  explanation:                 string | null;
  retry_count:                 number;
  reviewed:                    boolean;
  user_decision:               'accepted' | 'rejected' | null;
  user_notes:                  string | null;
  created_at:                  string;
}

const OUTCOME_COLOR: Record<string, 'success' | 'error' | 'default'> = {
  healed:         'success',
  failed:         'error',
  not_applicable: 'default',
};

const OUTCOME_LABEL: Record<string, string> = {
  healed:         'Healed',
  failed:         'Failed',
  not_applicable: 'N/A',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function HealingReviewPage() {
  const [rows,        setRows]        = useState<HealingRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [selected,    setSelected]    = useState<HealingRow | null>(null);
  const [notes,       setNotes]       = useState('');
  const [saving,      setSaving]      = useState(false);
  const [snackbar,    setSnackbar]    = useState<string | null>(null);

  // ── Load events from DB ────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    supabase
      .from('healing_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        else   setRows((data as HealingRow[]) ?? []);
        setLoading(false);
      });
  }, []);

  // ── Accept / reject ────────────────────────────────────────────────────────
  const decide = async (row: HealingRow, decision: 'accepted' | 'rejected') => {
    setSaving(true);
    const { error: e } = await supabase
      .from('healing_events')
      .update({
        reviewed:      true,
        user_decision: decision,
        user_notes:    notes || null,
        reviewed_at:   new Date().toISOString(),
      })
      .eq('id', row.id);

    if (e) {
      setSnackbar(`Error: ${e.message}`);
    } else {
      setRows(prev => prev.map(r => r.id === row.id
        ? { ...r, reviewed: true, user_decision: decision, user_notes: notes || null }
        : r,
      ));
      if (decision === 'accepted' && row.resolved_locator_value) {
        // Record the accepted proposal for future locator update
        await supabase.from('healing_accepted_proposals').insert({
          healing_event_id:  row.id,
          step_id:           row.step_id,
          original_selector: row.original_locator_value,
          proposed_selector: row.resolved_locator_value,
          locator_strategy:  row.resolved_locator_strategy,
          confidence:        row.confidence,
        });
      }
      setSnackbar(decision === 'accepted' ? 'Healing accepted.' : 'Healing rejected.');
      setSelected(null);
      setNotes('');
    }
    setSaving(false);
  };

  // ── Export ─────────────────────────────────────────────────────────────────
  const exportReport = () => {
    const lines = [
      'id,run_id,step_number,outcome,strategy_used,confidence,original_locator,resolved_locator,reviewed,user_decision,created_at',
      ...rows.map(r => [
        r.id, r.run_id, r.step_number, r.outcome,
        r.strategy_used ?? '', r.confidence ?? '',
        r.original_locator_value ?? '', r.resolved_locator_value ?? '',
        r.reviewed, r.user_decision ?? '', r.created_at,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'healing-report.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const healed  = rows.filter(r => r.outcome === 'healed').length;
  const failed  = rows.filter(r => r.outcome === 'failed').length;
  const pending = rows.filter(r => r.outcome === 'healed' && !r.reviewed).length;

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Header */}
      <Stack direction="row" spacing={1.5} alignItems="center" mb={3}>
        <AutoFixHighIcon color="primary" />
        <Typography variant="h5" fontWeight={600}>Healing Review</Typography>
        <Box flex={1} />
        <Button startIcon={<DownloadIcon />} onClick={exportReport} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </Stack>

      {/* Summary chips */}
      <Stack direction="row" spacing={1.5} mb={2} flexWrap="wrap">
        <Chip label={`${rows.length} total events`} />
        <Chip label={`${healed} healed`}  color="success" />
        <Chip label={`${failed} failed`}  color="error"   variant="outlined" />
        <Chip label={`${pending} pending review`} color="warning" variant="outlined" />
      </Stack>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error   && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && rows.length === 0 && (
        <Alert severity="info">No healing events recorded yet. Run an automated test with self-healing enabled to see events here.</Alert>
      )}

      {rows.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Step</TableCell>
                <TableCell>Outcome</TableCell>
                <TableCell>Strategy</TableCell>
                <TableCell>Confidence</TableCell>
                <TableCell>Original locator</TableCell>
                <TableCell>Resolved locator</TableCell>
                <TableCell>Review</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(row => (
                <TableRow
                  key={row.id}
                  hover
                  sx={{ opacity: row.user_decision === 'rejected' ? 0.5 : 1 }}
                >
                  <TableCell>
                    <Typography variant="caption" fontWeight={600}>#{row.step_number}</Typography>
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 10 }}>
                      {row.step_id.slice(0, 8)}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Chip
                      label={OUTCOME_LABEL[row.outcome] ?? row.outcome}
                      color={OUTCOME_COLOR[row.outcome] ?? 'default'}
                      size="small"
                    />
                  </TableCell>

                  <TableCell>
                    <Typography variant="caption">
                      {row.strategy_used?.replace(/_/g, ' ') ?? '—'}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    {row.confidence != null ? (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <LinearProgress
                          variant="determinate"
                          value={Math.round(row.confidence * 100)}
                          sx={{ width: 60, height: 6, borderRadius: 3 }}
                          color={row.confidence >= 0.7 ? 'success' : row.confidence >= 0.5 ? 'warning' : 'error'}
                        />
                        <Typography variant="caption">{Math.round(row.confidence * 100)}%</Typography>
                      </Stack>
                    ) : '—'}
                  </TableCell>

                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 11, maxWidth: 200, wordBreak: 'break-all' }}>
                    {row.original_locator_value ?? row.original_error.slice(0, 60)}
                  </TableCell>

                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 11, maxWidth: 200, wordBreak: 'break-all', color: row.resolved_locator_value ? 'success.main' : 'text.disabled' }}>
                    {row.resolved_locator_value ?? '—'}
                  </TableCell>

                  <TableCell>
                    {row.reviewed ? (
                      <Chip
                        label={row.user_decision === 'accepted' ? 'Accepted' : 'Rejected'}
                        color={row.user_decision === 'accepted' ? 'success' : 'default'}
                        size="small"
                        icon={row.user_decision === 'accepted' ? <CheckCircleIcon /> : <CancelIcon />}
                      />
                    ) : (
                      <Chip label="Pending" color="warning" size="small" />
                    )}
                  </TableCell>

                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title="Compare locators">
                        <IconButton size="small" onClick={() => { setSelected(row); setNotes(row.user_notes ?? ''); }}>
                          <CompareIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── Compare dialog ── */}
      <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="md" fullWidth>
        {selected && (
          <>
            <DialogTitle>
              Healing Event — Step #{selected.step_number}
              <Chip
                label={OUTCOME_LABEL[selected.outcome]}
                color={OUTCOME_COLOR[selected.outcome]}
                size="small"
                sx={{ ml: 1 }}
              />
            </DialogTitle>

            <DialogContent>
              <Stack spacing={2} mt={0.5}>
                {/* Error */}
                <Box>
                  <Typography variant="caption" color="text.secondary">Original error</Typography>
                  <Box sx={{ p: 1, bgcolor: 'error.light', borderRadius: 1, mt: 0.5 }}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12, color: 'error.contrastText' }}>
                      {selected.original_error}
                    </Typography>
                  </Box>
                </Box>

                <Divider />

                {/* Locator comparison */}
                <Stack direction="row" spacing={2}>
                  <Box flex={1}>
                    <Typography variant="caption" color="text.secondary" gutterBottom>
                      Original locator
                    </Typography>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                        <strong>{selected.original_locator_strategy ?? 'unknown'}</strong>
                        <br />
                        {selected.original_locator_value ?? '(empty)'}
                      </Typography>
                    </Box>
                  </Box>
                  <Box flex={1}>
                    <Typography variant="caption" color="text.secondary" gutterBottom>
                      Resolved locator
                    </Typography>
                    <Box sx={{ p: 1, bgcolor: selected.resolved_locator_value ? 'success.light' : 'action.hover', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12, color: selected.resolved_locator_value ? 'success.contrastText' : 'text.secondary' }}>
                        <strong>{selected.resolved_locator_strategy ?? '—'}</strong>
                        <br />
                        {selected.resolved_locator_value ?? '(not resolved)'}
                      </Typography>
                    </Box>
                  </Box>
                </Stack>

                {/* Strategy + explanation */}
                {selected.strategy_used && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Strategy</Typography>
                    <Stack direction="row" spacing={1} alignItems="center" mt={0.5}>
                      <Chip label={selected.strategy_used.replace(/_/g, ' ')} size="small" />
                      {selected.explanation && (
                        <Typography variant="caption" color="text.secondary">{selected.explanation}</Typography>
                      )}
                    </Stack>
                  </Box>
                )}

                {/* Notes */}
                <TextField
                  label="Review notes (optional)"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  multiline
                  rows={2}
                  fullWidth
                  size="small"
                  disabled={selected.reviewed}
                />

                {selected.reviewed && (
                  <Alert severity={selected.user_decision === 'accepted' ? 'success' : 'info'}>
                    Already reviewed: {selected.user_decision?.toUpperCase()}
                    {selected.user_notes ? ` — "${selected.user_notes}"` : ''}
                  </Alert>
                )}
              </Stack>
            </DialogContent>

            <DialogActions>
              <Button onClick={() => setSelected(null)}>Close</Button>
              {!selected.reviewed && (
                <>
                  <Button
                    color="error"
                    startIcon={<CancelIcon />}
                    onClick={() => decide(selected, 'rejected')}
                    disabled={saving}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<CheckCircleIcon />}
                    onClick={() => decide(selected, 'accepted')}
                    disabled={saving || !selected.resolved_locator_value}
                  >
                    {saving ? 'Saving…' : 'Accept healing'}
                  </Button>
                </>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
        message={snackbar}
      />
    </Container>
  );
}
