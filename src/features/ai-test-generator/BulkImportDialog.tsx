// ─── Bulk Import Dialog (Phase 4 M6) ──────────────────────────────────────────
// Lets the user select a project + module, then imports all accepted suggestions.

import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, FormControl, InputLabel, Select, MenuItem,
  Typography, Alert, LinearProgress, Chip, Stack, Box,
} from '@mui/material';
import { useState, useEffect } from 'react';
import { supabase }            from '@/lib/supabase';
import type { TestSuggestion, GenerationProvenance } from '@/services/aiTestGenerator';
import { aiTestGenerationEngine } from '@/services/aiTestGenerator';
import type { AiGenerationMetadata } from '@/types';

interface Project { id: string; name: string; }
interface Module  { id: string; name: string; project_id: string; }

interface Props {
  open:                   boolean;
  suggestions:            TestSuggestion[];
  onClose:                () => void;
  onImported:             (count: number) => void;
  provenance?:            GenerationProvenance;
  preselectedProjectId?:  string;
}

export function BulkImportDialog({ open, suggestions, onClose, onImported, provenance, preselectedProjectId }: Props) {
  const [projects,   setProjects]   = useState<Project[]>([]);
  const [modules,    setModules]    = useState<Module[]>([]);
  const [projectId,  setProjectId]  = useState('');
  const [moduleId,   setModuleId]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [importing,  setImporting]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);

  const accepted = suggestions.filter(s => s.status === 'accepted');

  // ── Load projects on open ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setImportDone(false);

    supabase
      .from('projects')
      .select('id, name')
      .order('name')
      .then(({ data, error: e }: { data: Project[] | null; error: { message: string } | null }) => {
        if (e) { setError(e.message); }
        else {
          setProjects(data ?? []);
          // Pre-select project when coming from PI mode
          if (preselectedProjectId && data?.some(p => p.id === preselectedProjectId)) {
            setProjectId(preselectedProjectId);
          }
        }
        setLoading(false);
      });
  }, [open, preselectedProjectId]);

  // ── Load modules when project changes ─────────────────────────────────────
  useEffect(() => {
    if (!projectId) { setModules([]); setModuleId(''); return; }
    supabase
      .from('modules')
      .select('id, name, project_id')
      .eq('project_id', projectId)
      .order('name')
      .then(({ data, error: e }: { data: Module[] | null; error: { message: string } | null }) => {
        if (e) { setError(e.message); }
        else   { setModules(data ?? []); setModuleId(''); }
      });
  }, [projectId]);

  const handleImport = async () => {
    if (!projectId) return;
    setImporting(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const metadata: AiGenerationMetadata | undefined = provenance ? {
        source_type:               provenance.source_type,
        project_id:                provenance.project_id,
        generation_mode:           provenance.generation_mode,
        generation_scope:          provenance.generation_scope,
        generated_at:              provenance.generated_at,
        connector_model:           provenance.connector_model,
      } : undefined;
      const result = await aiTestGenerationEngine.importAccepted(
        accepted, projectId, moduleId || null, user?.id ?? 'unknown', metadata,
      );
      if (result.errors.length > 0) {
        setError(`${result.errors.length} error(s): ${result.errors[0]}`);
      }
      onImported(result.saved);
      setImportDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Bulk Import Accepted Tests</DialogTitle>

      <DialogContent>
        {loading && <LinearProgress sx={{ mb: 2 }} />}

        {!loading && (
          <Stack spacing={2} mt={0.5}>
            {importDone ? (
              <Alert severity="success">
                {accepted.length} test case{accepted.length !== 1 ? 's' : ''} imported successfully.
              </Alert>
            ) : (
              <>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip label={`${accepted.length} accepted`} color="success" />
                  <Typography variant="body2" color="text.secondary">
                    test case{accepted.length !== 1 ? 's' : ''} will be imported
                  </Typography>
                </Stack>

                {accepted.length === 0 && (
                  <Alert severity="warning">
                    No accepted suggestions. Accept at least one suggestion before importing.
                  </Alert>
                )}

                <FormControl fullWidth size="small" disabled={accepted.length === 0}>
                  <InputLabel>Project</InputLabel>
                  <Select
                    label="Project"
                    value={projectId}
                    onChange={e => setProjectId(e.target.value)}
                  >
                    {projects.map(p => (
                      <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small" disabled={!projectId || accepted.length === 0}>
                  <InputLabel>Module (optional)</InputLabel>
                  <Select
                    label="Module (optional)"
                    value={moduleId}
                    onChange={e => setModuleId(e.target.value)}
                  >
                    <MenuItem value="">— No module —</MenuItem>
                    {modules.map(m => (
                      <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {error && <Alert severity="error">{error}</Alert>}

                {importing && <LinearProgress />}

                <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Importing creates new test cases in the selected module.
                    Existing tests are never overwritten.
                  </Typography>
                </Box>
              </>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          {importDone ? 'Close' : 'Cancel'}
        </Button>
        {!importDone && (
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={!projectId || importing || accepted.length === 0}
          >
            {importing ? 'Importing…' : `Import ${accepted.length} test${accepted.length !== 1 ? 's' : ''}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
