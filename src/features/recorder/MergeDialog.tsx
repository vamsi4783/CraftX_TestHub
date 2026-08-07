// ─── MergeDialog ─────────────────────────────────────────────────────────────
// Lets the user pick a test case and merge recorded steps into it.
// Creates new test_case_steps rows with automation_config populated.
// Nothing is saved until the user confirms here.

import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Box, List, ListItem,
  ListItemButton, ListItemText, Chip, CircularProgress,
  Alert, Divider, InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import MergeIcon  from '@mui/icons-material/CallMerge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth }            from '@/hooks/useAuth';
import { testCaseService }    from '@/services/testCaseService';
import { recorderService }    from '@/services/recorderService';
import { toastSuccess, toastError } from '@/lib/errors';
import type { RecordedStep }  from './recorderTypes';
import type { TestCase }      from '@/types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface MergeDialogProps {
  open:        boolean;
  onClose:     () => void;
  steps:       RecordedStep[];
  recordingId: string | null;
  projectId:   string;
  onMerged:    () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MergeDialog({ open, onClose, steps, recordingId, projectId, onMerged }: MergeDialogProps) {
  const { profile }  = useAuth();
  const qc           = useQueryClient();
  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState<TestCase | null>(null);
  const [mergeMode,  setMergeMode]  = useState<'append' | 'replace'>('append');

  const { data: testCases = [], isLoading } = useQuery({
    queryKey:  ['test-cases', projectId],
    queryFn:   () => testCaseService.list(projectId),
    enabled:   open && !!projectId,
  });

  const filtered = testCases.filter(tc =>
    !search ||
    tc.title.toLowerCase().includes(search.toLowerCase()) ||
    tc.test_id.toLowerCase().includes(search.toLowerCase())
  );

  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (!selected || !profile) throw new Error('No test case selected');

      // Fetch existing steps to know the current max step_number
      const existing = await testCaseService.get(selected.id);
      const baseNumber = mergeMode === 'append'
        ? (existing.steps?.length ?? 0)
        : 0;

      // Convert RecordedStep[] → TestCaseStep rows (no id, let DB generate)
      const newSteps = steps.map((rs, i) => ({
        test_case_id:      selected.id,
        step_number:       baseNumber + i + 1,
        description:       `${rs.action.replace(/_/g, ' ')} (recorded)`,
        expected_result:   '',
        notes:             null as string | null,
        automation_config: {
          driver_id: rs.driver,
          action:    rs.action,
          params:    rs.params,
        },
      }));

      if (mergeMode === 'replace') {
        // Delete existing steps first, then insert
        await testCaseService.saveSteps(selected.id, newSteps);
      } else {
        // Append — insert only new rows
        const { error } = await (await import('@/lib/supabase')).supabase
          .from('test_case_steps')
          .insert(newSteps);
        if (error) throw error;
      }

      // Persist automation steps to DB if we have a recording id
      if (recordingId) {
        await recorderService.bulkSaveAutomationSteps(recordingId, steps);
      }

      qc.invalidateQueries({ queryKey: ['test-case', selected.id] });
    },
    onSuccess: () => {
      toastSuccess(`${steps.length} step${steps.length !== 1 ? 's' : ''} merged into "${selected!.title}"`);
      onMerged();
      onClose();
    },
    onError: err => toastError(err),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Box display="flex" alignItems="center" gap={1}>
          <MergeIcon color="primary" />
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Merge into Test Case</Typography>
            <Typography variant="caption" color="text.secondary">
              {steps.length} recorded step{steps.length !== 1 ? 's' : ''} will be added as automation configs.
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {/* Merge mode */}
        <Box mb={2}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={0.75}>
            MERGE MODE
          </Typography>
          <Box display="flex" gap={1}>
            {(['append', 'replace'] as const).map(mode => (
              <Chip
                key={mode}
                label={mode === 'append' ? 'Append to existing steps' : 'Replace all steps'}
                size="small"
                color={mergeMode === mode ? 'primary' : 'default'}
                variant={mergeMode === mode ? 'filled' : 'outlined'}
                onClick={() => setMergeMode(mode)}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Box>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Test case picker */}
        <TextField
          size="small" fullWidth placeholder="Search test cases…"
          value={search} onChange={e => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ mb: 1.5 }}
        />

        {isLoading ? (
          <Box display="flex" justifyContent="center" py={3}>
            <CircularProgress size={24} />
          </Box>
        ) : filtered.length === 0 ? (
          <Alert severity="info">No test cases found{search ? ' matching your search' : ''}.</Alert>
        ) : (
          <List dense disablePadding sx={{ maxHeight: 300, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
            {filtered.map(tc => (
              <ListItem key={tc.id} disablePadding>
                <ListItemButton
                  selected={selected?.id === tc.id}
                  onClick={() => setSelected(tc)}
                  sx={{ '&.Mui-selected': { bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' } } }}
                >
                  <ListItemText
                    primary={tc.title}
                    secondary={
                      <Typography variant="caption" sx={{ color: selected?.id === tc.id ? 'rgba(255,255,255,0.7)' : 'text.disabled' }}>
                        {tc.test_id} · {tc.module?.name ?? 'No module'}
                      </Typography>
                    }
                  />
                  <Chip label={tc.priority} size="small" sx={{ ml: 1, fontSize: 10 }} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} size="small" disabled={mergeMutation.isPending}>Cancel</Button>
        <Button
          variant="contained"
          size="small"
          disabled={!selected || mergeMutation.isPending}
          onClick={() => mergeMutation.mutate()}
          startIcon={mergeMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <MergeIcon />}
        >
          {mergeMutation.isPending ? 'Merging…' : 'Merge Steps'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
