// ─── JSON Import Dialog (M12 Phase C) ────────────────────────────────────────
// Allows users to import test cases from a JSON file. Goes through the canonical
// TestCaseNormalizer → testCaseService.create() path (same as all other sources).

import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Alert, LinearProgress, Stack, Chip,
  Box, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { parseJsonInput, dryRunJsonImport, importJsonTestCases } from '@/services/jsonImportService';
import type { DryRunResult } from '@/services/jsonImportService';

interface Project { id: string; name: string; }
interface Module  { id: string; name: string; project_id: string; }

interface Props {
  open:       boolean;
  onClose:    () => void;
  onImported: (result: { imported: number; duplicates: number; invalid: number }) => void;
}

type Phase = 'pick' | 'preview' | 'target' | 'importing' | 'done';

export function JsonImportDialog({ open, onClose, onImported }: Props) {
  const fileRef     = useRef<HTMLInputElement>(null);
  const [phase, setPhase]       = useState<Phase>('pick');
  const [error, setError]       = useState<string | null>(null);
  const [rawItems, setRawItems] = useState<unknown[]>([]);
  const [preview,  setPreview]  = useState<DryRunResult | null>(null);

  const [projects,  setProjects]  = useState<Project[]>([]);
  const [modules,   setModules]   = useState<Module[]>([]);
  const [projectId, setProjectId] = useState('');
  const [moduleId,  setModuleId]  = useState('');
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [result, setResult] = useState<{ imported: number; duplicates: number; invalid: number } | null>(null);

  const reset = () => {
    setPhase('pick');
    setError(null);
    setRawItems([]);
    setPreview(null);
    setProjectId('');
    setModuleId('');
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) { setError('File must be a .json file'); return; }

    const text = await file.text().catch(() => null);
    if (!text) { setError('Could not read file'); return; }

    const items = parseJsonInput(text);
    if (!items) { setError('File does not contain valid JSON test case data. Expected an array or a { test_cases: [...] } object.'); return; }
    if (items.length === 0) { setError('JSON file contains no test cases.'); return; }

    const dry = dryRunJsonImport(items);
    setRawItems(items);
    setPreview(dry);
    setPhase('preview');
  };

  const handleContinueToTarget = async () => {
    setLoadingProjects(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.from('projects').select('id, name').order('name');
      if (e) throw e;
      setProjects(data ?? []);
      setPhase('target');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleProjectChange = async (pid: string) => {
    setProjectId(pid);
    setModuleId('');
    if (!pid) { setModules([]); return; }
    const { data } = await supabase.from('modules').select('id, name, project_id').eq('project_id', pid).order('name');
    setModules(data ?? []);
  };

  const handleImport = async () => {
    if (!projectId) { setError('Select a project'); return; }
    setPhase('importing');
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const res = await importJsonTestCases(rawItems, {
        projectId,
        moduleId:        moduleId || null,
        createdBy:       user?.id ?? 'unknown',
        checkDuplicates: true,
      });
      setResult({ imported: res.imported, duplicates: res.duplicates, invalid: res.invalid });
      setPhase('done');
      onImported({ imported: res.imported, duplicates: res.duplicates, invalid: res.invalid });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('target');
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Import Test Cases from JSON</DialogTitle>

      <DialogContent>
        <Stack spacing={2} mt={0.5}>

          {/* Phase: pick file */}
          {phase === 'pick' && (
            <>
              <Typography variant="body2" color="text.secondary">
                Select a JSON file containing test cases. Supports arrays, wrapped objects
                ({`{ test_cases: [...] }`}), or a single test case object.
              </Typography>
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => fileRef.current?.click()}
                fullWidth
              >
                Choose JSON file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </>
          )}

          {/* Phase: preview / dry run */}
          {phase === 'preview' && preview && (
            <>
              <Typography variant="subtitle2">File Preview</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip label={`${preview.total} total`}    size="small" />
                <Chip label={`${preview.valid} valid`}    size="small" color="success" />
                {preview.invalid > 0 && (
                  <Chip label={`${preview.invalid} invalid`} size="small" color="error" />
                )}
              </Stack>

              {preview.valid > 0 && (
                <Box sx={{ maxHeight: 180, overflowY: 'auto', bgcolor: 'action.hover', borderRadius: 1, p: 1 }}>
                  {preview.previews.slice(0, 20).map((p, i) => (
                    <Typography key={i} variant="caption" display="block" sx={{ py: 0.25 }}>
                      {i + 1}. {p.title}
                      {p.category && <Chip label={p.category} size="small" sx={{ ml: 0.5, height: 16, fontSize: '0.65rem' }} />}
                    </Typography>
                  ))}
                  {preview.previews.length > 20 && (
                    <Typography variant="caption" color="text.secondary">… and {preview.previews.length - 20} more</Typography>
                  )}
                </Box>
              )}

              {preview.errors.length > 0 && (
                <Alert severity="warning">
                  <Typography variant="caption" fontWeight={600}>Validation errors (will be skipped):</Typography>
                  {preview.errors.slice(0, 3).map(e => (
                    <Typography key={e.index} variant="caption" display="block">
                      Item {e.index + 1}: {e.errors.join('; ')}
                    </Typography>
                  ))}
                </Alert>
              )}

              {preview.valid === 0 && (
                <Alert severity="error">No valid test cases found in this file.</Alert>
              )}
            </>
          )}

          {/* Phase: target project/module */}
          {phase === 'target' && (
            <>
              {loadingProjects && <LinearProgress />}
              <FormControl fullWidth size="small">
                <InputLabel>Project *</InputLabel>
                <Select
                  label="Project *"
                  value={projectId}
                  onChange={e => handleProjectChange(e.target.value)}
                >
                  {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small" disabled={!projectId}>
                <InputLabel>Module (optional)</InputLabel>
                <Select
                  label="Module (optional)"
                  value={moduleId}
                  onChange={e => setModuleId(e.target.value)}
                >
                  <MenuItem value="">— None —</MenuItem>
                  {modules.map(m => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
                </Select>
              </FormControl>
              <Alert severity="info" sx={{ fontSize: 12 }}>
                Duplicate detection is enabled. Test cases with titles similar to existing ones will be skipped.
              </Alert>
            </>
          )}

          {/* Phase: importing */}
          {phase === 'importing' && (
            <>
              <LinearProgress />
              <Typography variant="body2" color="text.secondary">Importing test cases…</Typography>
            </>
          )}

          {/* Phase: done */}
          {phase === 'done' && result && (
            <Alert severity="success">
              <Typography variant="subtitle2" gutterBottom>Import complete</Typography>
              <Stack spacing={0.5}>
                <Typography variant="body2">Imported: <strong>{result.imported}</strong></Typography>
                <Typography variant="body2">Duplicates skipped: <strong>{result.duplicates}</strong></Typography>
                <Typography variant="body2">Invalid skipped: <strong>{result.invalid}</strong></Typography>
              </Stack>
            </Alert>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>{phase === 'done' ? 'Close' : 'Cancel'}</Button>

        {phase === 'preview' && (
          <>
            <Button onClick={reset}>← Change file</Button>
            <Button
              variant="contained"
              onClick={handleContinueToTarget}
              disabled={(preview?.valid ?? 0) === 0}
            >
              Continue →
            </Button>
          </>
        )}

        {phase === 'target' && (
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={!projectId}
          >
            Import {preview?.valid ?? 0} test{(preview?.valid ?? 0) !== 1 ? 's' : ''}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
