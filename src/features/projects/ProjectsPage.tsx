import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Grid, Card, CardContent, Typography, Button, IconButton, Chip, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions, Select, MenuItem, FormControl,
  InputLabel, InputAdornment, Tooltip, CircularProgress, Avatar, Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderIcon from '@mui/icons-material/Folder';
import { projectService } from '@/services/projectService';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { StatusChip } from '@/components/common/StatusChip';
import { useAuth } from '@/hooks/useAuth';
import { toastSuccess, toastError } from '@/lib/errors';
import { PLATFORM_ICONS, PLATFORM_LABELS } from '@/lib/utils';
import type { Project, ProjectPlatform } from '@/types';

const COLORS = ['#4F46E5','#7C3AED','#EF4444','#F59E0B','#10B981','#06B6D4','#EC4899','#8B5CF6'];
const PLATFORMS: ProjectPlatform[] = ['android','ios','web','desktop','backend','cross_platform'];

function ProjectDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: Project }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: existing?.name ?? '',
    description: existing?.description ?? '',
    platform: (existing?.platform ?? 'android') as ProjectPlatform,
    version: existing?.version ?? '1.0.0',
    repository_url: existing?.repository_url ?? '',
    color: existing?.color ?? COLORS[0],
    tags: existing?.tags?.join(', ') ?? '',
  });

  const { mutate, isPending } = useMutation({
    mutationFn: () => existing
      ? projectService.update(existing.id, {
          name: form.name, description: form.description || null,
          platform: form.platform, version: form.version,
          repository_url: form.repository_url || null, color: form.color,
          tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        })
      : projectService.create({
          name: form.name, description: form.description || undefined,
          platform: form.platform, owner_id: profile!.id, color: form.color,
          version: form.version, repository_url: form.repository_url || undefined,
          tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toastSuccess(existing ? 'Project updated' : 'Project created');
      onClose();
    },
    onError: err => toastError(err),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{existing ? 'Edit Project' : 'New Project'}</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} pt={1}>
          <TextField label="Project Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} fullWidth autoFocus />
          <TextField label="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} fullWidth multiline rows={2} />
          <Box display="flex" gap={2}>
            <FormControl fullWidth>
              <InputLabel>Platform *</InputLabel>
              <Select label="Platform *" value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value as ProjectPlatform }))}>
                {PLATFORMS.map(p => <MenuItem key={p} value={p}>{PLATFORM_ICONS[p]} {PLATFORM_LABELS[p]}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Version" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} sx={{ width: 140 }} />
          </Box>
          <TextField label="Repository URL" value={form.repository_url} onChange={e => setForm(f => ({ ...f, repository_url: e.target.value }))} fullWidth placeholder="https://github.com/org/repo" />
          <TextField label="Tags (comma separated)" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} fullWidth placeholder="mobile, b2b, core" />
          <Box>
            <Typography variant="caption" color="text.secondary" mb={1} display="block">Project Color</Typography>
            <Box display="flex" gap={1} flexWrap="wrap">
              {COLORS.map(c => (
                <Box key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                    border: form.color === c ? '3px solid white' : '3px solid transparent',
                    outline: form.color === c ? `2px solid ${c}` : 'none' }} />
              ))}
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => mutate()} disabled={!form.name.trim() || isPending}>
          {isPending ? <CircularProgress size={18} color="inherit" /> : (existing ? 'Save Changes' : 'Create Project')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | undefined>();
  const [confirm, setConfirm] = useState<{ action: 'archive'|'restore'|'delete'; project: Project } | null>(null);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', search, statusFilter],
    queryFn: () => projectService.list({ search: search || undefined, status: statusFilter || undefined }),
  });

  const actionMutation = useMutation({
    mutationFn: async () => {
      if (!confirm) return;
      if (confirm.action === 'archive') return projectService.archive(confirm.project.id);
      if (confirm.action === 'restore') return projectService.restore(confirm.project.id);
      return projectService.delete(confirm.project.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toastSuccess(`Project ${confirm?.action}d`);
      setConfirm(null);
    },
    onError: err => toastError(err),
  });

  return (
    <Box>
      <PageHeader
        title="Projects"
        subtitle="Manage all your software products across the platform."
        actions={isAdmin ? (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
            New Project
          </Button>
        ) : undefined}
      />

      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <TextField
          placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)} size="small"
          sx={{ flex: 1, minWidth: 200 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Status</InputLabel>
          <Select label="Status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <MenuItem value="">All Active</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
            <MenuItem value="archived">Archived</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {!isLoading && projects.length === 0 ? (
        <EmptyState icon={FolderIcon} title="No projects found"
          description={search ? 'Try a different search term.' : 'Create your first project to get started.'}
          actionLabel={isAdmin && !search ? 'New Project' : undefined}
          onAction={isAdmin && !search ? () => setDialogOpen(true) : undefined} />
      ) : (
        <Grid container spacing={2}>
          {projects.map(p => (
            <Grid item xs={12} sm={6} md={4} key={p.id}>
              <Card
                sx={{ cursor: 'pointer', height: '100%', '&:hover': { boxShadow: 4 }, borderTop: `3px solid ${p.color}` }}
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <CardContent>
                  <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={1} mb={1.5}>
                    <Box display="flex" alignItems="center" gap={1.5}>
                      <Avatar sx={{ width: 36, height: 36, bgcolor: p.color, fontSize: 18 }}>
                        {PLATFORM_ICONS[p.platform] ?? '📁'}
                      </Avatar>
                      <Box>
                        <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>{p.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{PLATFORM_LABELS[p.platform]} · v{p.version}</Typography>
                      </Box>
                    </Box>
                    {isAdmin && (
                      <Box display="flex" gap={0.25} flexShrink={0} onClick={e => e.stopPropagation()}>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => { setEditing(p); setDialogOpen(true); }}><EditIcon fontSize="small" /></IconButton>
                        </Tooltip>
                        {p.status !== 'archived' ? (
                          <Tooltip title="Archive">
                            <IconButton size="small" onClick={() => setConfirm({ action: 'archive', project: p })}><ArchiveIcon fontSize="small" /></IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Restore">
                            <IconButton size="small" onClick={() => setConfirm({ action: 'restore', project: p })}><UnarchiveIcon fontSize="small" /></IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => setConfirm({ action: 'delete', project: p })}><DeleteIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      </Box>
                    )}
                  </Box>

                  {p.description && (
                    <Typography variant="body2" color="text.secondary" mb={1.5}
                      sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {p.description}
                    </Typography>
                  )}

                  <Stack direction="row" spacing={0} flexWrap="wrap" gap={0.5}>
                    <StatusChip status={p.status} />
                    {p.tags?.slice(0, 2).map(t => <Chip key={t} label={t} size="small" variant="outlined" />)}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {dialogOpen && (
        <ProjectDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(undefined); }} existing={editing} />
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.action === 'delete' ? 'Delete Project' : confirm?.action === 'archive' ? 'Archive Project' : 'Restore Project'}
        message={
          confirm?.action === 'delete'
            ? `Permanently delete "${confirm?.project.name}"? All data will be lost.`
            : confirm?.action === 'archive'
            ? `Archive "${confirm?.project.name}"? It will be hidden from active views.`
            : `Restore "${confirm?.project.name}" to active status?`
        }
        confirmColor={confirm?.action === 'delete' ? 'error' : 'primary'}
        onConfirm={() => actionMutation.mutate()}
        onCancel={() => setConfirm(null)}
        loading={actionMutation.isPending}
      />
    </Box>
  );
}
