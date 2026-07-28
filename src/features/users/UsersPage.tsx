import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Typography, Avatar, Chip, Select, MenuItem,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  CircularProgress, Tooltip, IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PeopleIcon from '@mui/icons-material/People';
import { userService } from '@/services/userService';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { toastSuccess, toastError } from '@/lib/errors';
import { getInitials, formatDate } from '@/lib/utils';
import type { Profile, UserRole } from '@/types';

const ROLES: UserRole[] = ['administrator', 'developer', 'qa_tester', 'viewer'];
const ROLE_COLORS: Record<string, string> = {
  administrator: '#4F46E5', developer: '#10B981', qa_tester: '#F59E0B', viewer: '#9CA3AF',
};

export function UsersPage() {
  const { profile: me } = useAuth();
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [confirm, setConfirm] = useState<{ action: 'deactivate'|'activate'; user: Profile } | null>(null);

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: userService.list });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => userService.updateRole(id, role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toastSuccess('Role updated'); },
    onError: err => toastError(err),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? userService.activate(id) : userService.deactivate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toastSuccess('User status updated'); setConfirm(null); },
    onError: err => toastError(err),
  });

  const inviteMutation = useMutation({
    mutationFn: () => userService.inviteByEmail(inviteEmail.trim()),
    onSuccess: () => { toastSuccess(`Invite sent to ${inviteEmail}`); setInviteOpen(false); setInviteEmail(''); },
    onError: err => toastError(err, 'Failed to send invite — ensure Supabase Auth is configured for invites'),
  });

  return (
    <Box>
      <PageHeader
        title="Users"
        subtitle="Manage team members and their platform roles."
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setInviteOpen(true)}>
            Invite User
          </Button>
        }
      />

      {!isLoading && users.length === 0 ? (
        <EmptyState icon={PeopleIcon} title="No users yet" description="Invite team members to get started." actionLabel="Invite User" onAction={() => setInviteOpen(true)} />
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                {['User', 'Role', 'Status', 'Joined', 'Actions'].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.id} hover sx={{ opacity: u.is_active ? 1 : 0.5 }}>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1.5}>
                      <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 13, fontWeight: 700 }}>
                        {getInitials(u.full_name ?? u.email)}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" fontWeight={700}>{u.full_name ?? '—'}</Typography>
                        <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={u.role} size="small" disabled={u.id === me?.id}
                      onChange={e => roleMutation.mutate({ id: u.id, role: e.target.value as UserRole })}
                      sx={{ fontSize: '0.8rem', '& .MuiSelect-select': { py: 0.5 } }}
                    >
                      {ROLES.map(r => (
                        <MenuItem key={r} value={r}>
                          <Chip label={r.replace('_', ' ')} size="small"
                            sx={{ textTransform: 'capitalize', bgcolor: `${ROLE_COLORS[r]}22`, color: ROLE_COLORS[r], fontWeight: 700 }} />
                        </MenuItem>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Chip label={u.is_active ? 'Active' : 'Inactive'} size="small"
                      color={u.is_active ? 'success' : 'default'} variant={u.is_active ? 'filled' : 'outlined'} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">{formatDate(u.created_at)}</Typography>
                  </TableCell>
                  <TableCell>
                    {u.id !== me?.id && (
                      <Tooltip title={u.is_active ? 'Deactivate' : 'Activate'}>
                        <IconButton size="small" color={u.is_active ? 'error' : 'success'}
                          onClick={() => setConfirm({ action: u.is_active ? 'deactivate' : 'activate', user: u })}>
                          {u.is_active ? <BlockIcon fontSize="small" /> : <CheckCircleIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Invite Team Member</DialogTitle>
        <DialogContent>
          <TextField
            label="Email Address" type="email" value={inviteEmail} fullWidth autoFocus
            onChange={e => setInviteEmail(e.target.value)} sx={{ mt: 1 }}
            helperText="They'll receive an email invitation to join TestHub"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setInviteOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => inviteMutation.mutate()} disabled={!inviteEmail.trim() || inviteMutation.isPending}>
            {inviteMutation.isPending ? <CircularProgress size={18} color="inherit" /> : 'Send Invite'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.action === 'deactivate' ? 'Deactivate User' : 'Activate User'}
        message={`${confirm?.action === 'deactivate' ? 'Deactivate' : 'Activate'} "${confirm?.user.full_name ?? confirm?.user.email}"?`}
        confirmColor={confirm?.action === 'deactivate' ? 'error' : 'primary'}
        onConfirm={() => confirm && statusMutation.mutate({ id: confirm.user.id, active: confirm.action === 'activate' })}
        onCancel={() => setConfirm(null)}
        loading={statusMutation.isPending}
      />
    </Box>
  );
}
