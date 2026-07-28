import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Card, CardContent, CardActionArea, Typography, Button, Chip, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, FormControl, InputLabel,
  Select, MenuItem, Grid, IconButton, Menu, Tooltip, LinearProgress,
  Avatar, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AssignmentIcon from '@mui/icons-material/Assignment';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { testPlanService } from '@/services/testPlanService';
import { projectService } from '@/services/projectService';
import { releaseService } from '@/services/releaseService';
import { useAuth } from '@/hooks/useAuth';
import { toastSuccess, toastError } from '@/lib/errors';
import type { TestPlan, TestPlanStatus } from '@/types';

const STATUS_COLOR: Record<TestPlanStatus, 'default' | 'info' | 'success' | 'warning'> = {
  draft: 'default', active: 'info', completed: 'success', archived: 'warning',
};

function PlanDialog({
  open, onClose, projectId, plan,
}: { open: boolean; onClose: () => void; projectId: string; plan?: TestPlan | null }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState(plan?.name ?? '');
  const [description, setDescription] = useState(plan?.description ?? '');
  const [releaseId, setReleaseId] = useState(plan?.release_id ?? '');
  const [status, setStatus] = useState<TestPlanStatus>(plan?.status ?? 'draft');

  const { data: releases = [] } = useQuery({
    queryKey: ['releases', projectId],
    queryFn: () => releaseService.list(projectId),
    enabled: !!projectId,
  });

  const mutation = useMutation({
    mutationFn: () => plan
      ? testPlanService.update(plan.id, { name, description: description || undefined, release_id: releaseId || undefined, status })
      : testPlanService.create({ project_id: projectId, name, description: description || undefined, release_id: releaseId || undefined, created_by: profile!.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-plans', projectId] });
      toastSuccess(plan ? 'Plan updated' : 'Plan created');
      onClose();
    },
    onError: e => toastError(e),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{plan ? 'Edit Test Plan' : 'Create Test Plan'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        <TextField label="Plan Name *" value={name} onChange={e => setName(e.target.value)} fullWidth />
        <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} fullWidth multiline rows={2} />
        <FormControl fullWidth>
          <InputLabel>Release</InputLabel>
          <Select label="Release" value={releaseId} onChange={e => setReleaseId(e.target.value)}>
            <MenuItem value="">— None —</MenuItem>
            {releases.map(r => <MenuItem key={r.id} value={r.id}>{r.name} v{r.version}</MenuItem>)}
          </Select>
        </FormControl>
        {plan && (
          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select label="Status" value={status} onChange={e => setStatus(e.target.value as TestPlanStatus)}>
              {(['draft', 'active', 'completed', 'archived'] as TestPlanStatus[]).map(s => (
                <MenuItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Saving…' : plan ? 'Save Changes' : 'Create Plan'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function PlanCard({ plan, onEdit, onDelete }: { plan: TestPlan; onEdit: () => void; onDelete: () => void }) {
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardActionArea onClick={() => navigate(`/test-plans/${plan.id}`)} sx={{ flex: 1 }}>
        <CardContent>
          <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={1} mb={1}>
            <Box display="flex" alignItems="center" gap={1}>
              <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 18 }}>
                <AssignmentIcon fontSize="small" />
              </Avatar>
              <Box>
                <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>{plan.name}</Typography>
                {plan.release && (
                  <Typography variant="caption" color="text.secondary">{plan.release.name} v{plan.release.version}</Typography>
                )}
              </Box>
            </Box>
            <Chip label={plan.status} size="small" color={STATUS_COLOR[plan.status]} />
          </Box>
          {plan.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {plan.description}
            </Typography>
          )}
          <Box display="flex" gap={1} mt={1}>
            <Chip label={`${plan.case_count ?? 0} cases`} size="small" variant="outlined" />
          </Box>
        </CardContent>
      </CardActionArea>
      <Divider />
      <Box display="flex" justifyContent="space-between" alignItems="center" px={2} py={1}>
        <Typography variant="caption" color="text.secondary">
          {new Date(plan.created_at).toLocaleDateString()}
        </Typography>
        <Box>
          <Tooltip title="Start Session">
            <IconButton size="small" onClick={() => navigate(`/test-sessions/new?plan=${plan.id}`)}>
              <PlayArrowIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={e => { e.stopPropagation(); setAnchor(e.currentTarget); }}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
          <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
            <MenuItem onClick={() => { setAnchor(null); onEdit(); }}><EditIcon fontSize="small" sx={{ mr: 1 }} />Edit</MenuItem>
            <MenuItem onClick={() => { setAnchor(null); onDelete(); }} sx={{ color: 'error.main' }}><DeleteIcon fontSize="small" sx={{ mr: 1 }} />Delete</MenuItem>
          </Menu>
        </Box>
      </Box>
    </Card>
  );
}

export function TestPlansPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [selectedProject, setSelectedProject] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<TestPlan | null>(null);
  const [deletePlan, setDeletePlan] = useState<TestPlan | null>(null);

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectService.list() });
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['test-plans', selectedProject],
    queryFn: () => testPlanService.list(selectedProject),
    enabled: !!selectedProject,
  });

  const deleteMutation = useMutation({
    mutationFn: () => testPlanService.delete(deletePlan!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-plans', selectedProject] });
      toastSuccess('Plan deleted');
      setDeletePlan(null);
    },
    onError: e => toastError(e),
  });

  const canCreate = profile?.role === 'administrator' || profile?.role === 'developer';

  return (
    <Box>
      <PageHeader
        title="Test Plans"
        subtitle="Group test cases into plans for organized release testing."
        actions={
          canCreate && selectedProject ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
              New Plan
            </Button>
          ) : undefined
        }
      />

      <Box mb={3}>
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel>Project</InputLabel>
          <Select label="Project" value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
            <MenuItem value="">— Select Project —</MenuItem>
            {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {!selectedProject ? (
        <EmptyState icon={<AssignmentIcon sx={{ fontSize: 56 }} />} title="Select a project" description="Choose a project to view and manage test plans." />
      ) : isLoading ? (
        <LoadingState />
      ) : plans.length === 0 ? (
        <EmptyState icon={<AssignmentIcon sx={{ fontSize: 56 }} />} title="No test plans yet" description="Create a test plan to organize test cases for a release." action={canCreate ? <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>Create Plan</Button> : undefined} />
      ) : (
        <Grid container spacing={3}>
          {plans.map(plan => (
            <Grid item xs={12} sm={6} md={4} key={plan.id}>
              <PlanCard
                plan={plan}
                onEdit={() => { setEditPlan(plan); setDialogOpen(true); }}
                onDelete={() => setDeletePlan(plan)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {dialogOpen && selectedProject && (
        <PlanDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditPlan(null); }}
          projectId={selectedProject}
          plan={editPlan}
        />
      )}

      <ConfirmDialog
        open={!!deletePlan}
        title="Delete Test Plan"
        message={`Delete "${deletePlan?.name}"? This will remove all plan cases but won't delete the test cases themselves.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setDeletePlan(null)}
      />
    </Box>
  );
}
