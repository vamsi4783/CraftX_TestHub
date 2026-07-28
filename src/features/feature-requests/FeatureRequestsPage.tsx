import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Grid, Card, CardContent, Typography, Button, Chip, Avatar, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select,
  MenuItem, FormControl, InputLabel, CircularProgress, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import { featureRequestService } from '@/services/featureRequestService';
import { projectService } from '@/services/projectService';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusChip } from '@/components/common/StatusChip';
import { SeverityChip } from '@/components/common/SeverityChip';
import { EmptyState } from '@/components/common/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { timeAgo } from '@/lib/utils';
import type { FeaturePriority } from '@/types';

function CreateFRDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ project_id: '', title: '', description: '', business_value: '', category: '', priority: 'medium' as FeaturePriority });
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectService.list() });
  const { mutate, isPending } = useMutation({
    mutationFn: () => featureRequestService.create({ ...form, submitted_by: profile!.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feature-requests'] }); onClose(); setForm({ project_id:'',title:'',description:'',business_value:'',category:'',priority:'medium' }); },
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Submit Feature Request</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} pt={1}>
          <FormControl fullWidth>
            <InputLabel>Project *</InputLabel>
            <Select label="Project *" value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
              {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="Title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} fullWidth />
          <TextField label="Description *" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} fullWidth multiline rows={3} />
          <TextField label="Business Value" value={form.business_value} onChange={e => setForm(f => ({ ...f, business_value: e.target.value }))} fullWidth multiline rows={2} placeholder="How does this benefit users/business?" />
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField label="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} fullWidth placeholder="UX, Performance, Security…" />
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Priority</InputLabel>
                <Select label="Priority" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as FeaturePriority }))}>
                  {(['critical','high','medium','low'] as FeaturePriority[]).map(p => <MenuItem key={p} value={p} sx={{ textTransform:'capitalize' }}>{p}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => mutate()} disabled={!form.project_id || !form.title || !form.description || isPending}>
          {isPending ? <CircularProgress size={18} color="inherit" /> : 'Submit'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function FeatureRequestsPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [filterProject, setFilterProject] = useState('');

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projectService.list() });
  const { data: features = [], isLoading } = useQuery({
    queryKey: ['feature-requests', filterProject],
    queryFn: async () => {
      const pids = filterProject ? [filterProject] : projects.map(p => p.id);
      const all = await Promise.all(pids.map(id => featureRequestService.list(id)));
      return all.flat().sort((a, b) => b.vote_count - a.vote_count);
    },
    enabled: projects.length > 0,
  });

  const voteMutation = useMutation({
    mutationFn: async ({ id, hasVoted }: { id: string; hasVoted: boolean }) => {
      if (hasVoted) await featureRequestService.unvote(id, profile!.id);
      else await featureRequestService.vote(id, profile!.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feature-requests'] }),
  });

  return (
    <Box>
      <PageHeader
        title="Feature Requests"
        subtitle="Vote on and track feature requests across all projects."
        actions={
          <>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Project</InputLabel>
              <Select label="Project" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
                <MenuItem value="">All Projects</MenuItem>
                {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>Submit Request</Button>
          </>
        }
      />

      {features.length === 0 && !isLoading ? (
        <EmptyState icon={LightbulbIcon} title="No feature requests" description="Be the first to submit a feature request." actionLabel="Submit Request" onAction={() => setCreateOpen(true)} />
      ) : (
        <Box display="flex" flexDirection="column" gap={2}>
          {features.map(fr => (
            <Card key={fr.id}>
              <CardContent>
                <Box display="flex" gap={2} alignItems="flex-start">
                  {/* Vote button */}
                  <Box display="flex" flexDirection="column" alignItems="center" sx={{ minWidth: 56, py: 0.5 }}>
                    <IconButton
                      size="small"
                      onClick={() => voteMutation.mutate({ id: fr.id, hasVoted: !!fr.has_voted })}
                      sx={{ color: fr.has_voted ? 'primary.main' : 'text.disabled', '&:hover': { color: 'primary.main' } }}
                    >
                      <ThumbUpIcon />
                    </IconButton>
                    <Typography variant="h6" fontWeight={800} color={fr.has_voted ? 'primary.main' : 'text.primary'}>{fr.vote_count}</Typography>
                    <Typography variant="caption" color="text.secondary">votes</Typography>
                  </Box>

                  <Divider orientation="vertical" flexItem />

                  {/* Content */}
                  <Box flex={1}>
                    <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={1} mb={1}>
                      <Typography variant="subtitle1" fontWeight={700}>{fr.title}</Typography>
                      <Box display="flex" gap={1} flexShrink={0}>
                        <SeverityChip value={fr.priority} />
                        <StatusChip status={fr.status} />
                      </Box>
                    </Box>
                    <Typography variant="body2" color="text.secondary" mb={1.5}>{fr.description}</Typography>

                    {fr.business_value && (
                      <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'rgba(79,70,229,0.08)', mb: 1.5 }}>
                        <Typography variant="caption" fontWeight={700} color="primary.main" display="block">Business Value</Typography>
                        <Typography variant="body2">{fr.business_value}</Typography>
                      </Box>
                    )}

                    <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                      {fr.category && <Chip label={fr.category} size="small" variant="outlined" />}
                      <Typography variant="caption" color="text.secondary">
                        by {fr.submitter?.full_name} · {timeAgo(fr.created_at)}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <CreateFRDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Box>
  );
}
