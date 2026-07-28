import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Card, CardContent, Typography, Button, IconButton, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Select, MenuItem, FormControl, InputLabel, Grid, Tooltip, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExtensionIcon from '@mui/icons-material/Extension';
import { moduleService } from '@/services/moduleService';
import { projectService } from '@/services/projectService';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { toastSuccess, toastError } from '@/lib/errors';
import type { Module } from '@/types';

function ModuleDialog({ open, onClose, projectId, existing }: {
  open: boolean; onClose: () => void; projectId: string; existing?: Module;
}) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [name, setName] = useState(existing?.name ?? '');
  const [desc, setDesc] = useState(existing?.description ?? '');

  const { mutate, isPending } = useMutation({
    mutationFn: () => existing
      ? moduleService.update(existing.id, { name, description: desc || null })
      : moduleService.create({ project_id: projectId, name, description: desc || undefined, created_by: profile!.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modules'] });
      toastSuccess(existing ? 'Module updated' : 'Module created');
      onClose();
    },
    onError: err => toastError(err),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{existing ? 'Edit Module' : 'New Module'}</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} pt={1}>
          <TextField label="Module Name *" value={name} onChange={e => setName(e.target.value)} fullWidth autoFocus />
          <TextField label="Description" value={desc} onChange={e => setDesc(e.target.value)} fullWidth multiline rows={2} />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => mutate()} disabled={!name.trim() || isPending}>
          {isPending ? <CircularProgress size={18} color="inherit" /> : (existing ? 'Save' : 'Create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ModulesPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Module | undefined>();
  const [deleting, setDeleting] = useState<Module | undefined>();

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectService.list() });
  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['modules', projectId],
    queryFn: () => moduleService.list(projectId),
    enabled: !!projectId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => moduleService.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['modules'] }); toastSuccess('Module deleted'); setDeleting(undefined); },
    onError: err => toastError(err),
  });

  return (
    <Box>
      <PageHeader
        title="Modules"
        subtitle="Organize test cases and bugs by feature module."
        actions={isAdmin && projectId ? (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
            Add Module
          </Button>
        ) : undefined}
      />

      <FormControl sx={{ minWidth: 240, mb: 3 }}>
        <InputLabel>Select Project</InputLabel>
        <Select label="Select Project" value={projectId} onChange={e => setProjectId(e.target.value)}>
          {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </Select>
      </FormControl>

      {!projectId ? (
        <EmptyState icon={ExtensionIcon} title="Select a project" description="Choose a project to view and manage its modules." />
      ) : isLoading ? null : modules.length === 0 ? (
        <EmptyState icon={ExtensionIcon} title="No modules yet" description="Create modules to organize test cases by feature area."
          actionLabel={isAdmin ? 'Add Module' : undefined} onAction={isAdmin ? () => setDialogOpen(true) : undefined} />
      ) : (
        <Grid container spacing={2}>
          {modules.map(m => (
            <Grid item xs={12} sm={6} md={4} key={m.id}>
              <Card sx={{ height: '100%', opacity: m.is_active ? 1 : 0.5 }}>
                <CardContent>
                  <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={1}>
                    <Box flex={1}>
                      <Typography variant="subtitle1" fontWeight={700}>{m.name}</Typography>
                      {m.description && <Typography variant="body2" color="text.secondary" mt={0.5}>{m.description}</Typography>}
                    </Box>
                    {isAdmin && (
                      <Box display="flex" gap={0.5} flexShrink={0}>
                        <Tooltip title="Edit"><IconButton size="small" onClick={() => { setEditing(m); setDialogOpen(true); }}><EditIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleting(m)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                      </Box>
                    )}
                  </Box>
                  <Box display="flex" gap={1} mt={1.5} flexWrap="wrap">
                    {(m.test_case_count ?? 0) > 0 && <Chip label={`${m.test_case_count} tests`} size="small" variant="outlined" />}
                    {(m.open_bug_count ?? 0) > 0 && <Chip label={`${m.open_bug_count} bugs`} size="small" color="error" variant="outlined" />}
                    {!m.is_active && <Chip label="Inactive" size="small" />}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {dialogOpen && projectId && (
        <ModuleDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(undefined); }} projectId={projectId} existing={editing} />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete Module"
        message={`Delete "${deleting?.name}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(undefined)}
        loading={deleteMutation.isPending}
        confirmColor="error"
      />
    </Box>
  );
}
