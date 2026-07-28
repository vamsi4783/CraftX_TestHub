import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Box, Card, CardContent, Typography, TextField, Button, Avatar,
  Divider, Grid, Alert, Chip,
} from '@mui/material';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import { useAuth } from '@/hooks/useAuth';
import { useThemeMode } from '@/hooks/useThemeMode';
import { userService } from '@/services/userService';
import { PageHeader } from '@/components/common/PageHeader';
import { getInitials } from '@/lib/utils';
import { toastSuccess, toastError } from '@/lib/errors';

const ROLE_COLORS: Record<string, string> = {
  administrator: '#4F46E5', developer: '#10B981', qa_tester: '#F59E0B', viewer: '#9CA3AF',
};

export function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const { mode, toggle } = useThemeMode();

  const [profileForm, setProfileForm] = useState({
    full_name: profile?.full_name ?? '',
  });
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwError, setPwError] = useState('');

  const profileMutation = useMutation({
    mutationFn: () => userService.update(profile!.id, { full_name: profileForm.full_name }),
    onSuccess: async () => {
      await refreshProfile();
      toastSuccess('Profile updated');
    },
    onError: err => toastError(err),
  });

  const pwMutation = useMutation({
    mutationFn: () => userService.changePassword(pwForm.newPw),
    onSuccess: () => {
      toastSuccess('Password changed successfully');
      setPwForm({ current: '', newPw: '', confirm: '' });
      setPwError('');
    },
    onError: err => toastError(err),
  });

  const handlePwSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPw !== pwForm.confirm) { setPwError('Passwords do not match'); return; }
    if (pwForm.newPw.length < 8) { setPwError('Password must be at least 8 characters'); return; }
    setPwError('');
    pwMutation.mutate();
  };

  return (
    <Box maxWidth={720}>
      <PageHeader title="Settings" subtitle="Manage your profile and preferences." />

      {/* Profile */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700} mb={2}>Profile</Typography>
          <Box display="flex" alignItems="center" gap={2} mb={3}>
            <Avatar sx={{ width: 64, height: 64, bgcolor: 'primary.main', fontSize: 22, fontWeight: 700 }}>
              {getInitials(profile?.full_name ?? profile?.email)}
            </Avatar>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>{profile?.full_name ?? 'No name set'}</Typography>
              <Typography variant="body2" color="text.secondary">{profile?.email}</Typography>
              <Chip
                label={profile?.role?.replace('_', ' ') ?? 'viewer'}
                size="small" sx={{ mt: 0.5, textTransform: 'capitalize', bgcolor: `${ROLE_COLORS[profile?.role ?? 'viewer']}22`, color: ROLE_COLORS[profile?.role ?? 'viewer'], fontWeight: 700 }}
              />
            </Box>
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={8}>
              <TextField
                label="Full Name" value={profileForm.full_name} fullWidth
                onChange={e => setProfileForm(f => ({ ...f, full_name: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Email" value={profile?.email ?? ''} fullWidth disabled helperText="Contact admin to change email" />
            </Grid>
          </Grid>

          <Box mt={2}>
            <Button variant="contained" onClick={() => profileMutation.mutate()} disabled={profileMutation.isPending || !profileForm.full_name.trim()}>
              {profileMutation.isPending ? 'Saving…' : 'Save Profile'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700} mb={2}>Appearance</Typography>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center" gap={1.5}>
              {mode === 'dark' ? <DarkModeIcon color="primary" /> : <LightModeIcon color="warning" />}
              <Box>
                <Typography variant="body1" fontWeight={600}>{mode === 'dark' ? 'Dark Mode' : 'Light Mode'}</Typography>
                <Typography variant="body2" color="text.secondary">Choose your preferred interface theme</Typography>
              </Box>
            </Box>
            <Button variant="outlined" startIcon={mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />} onClick={toggle}>
              Switch to {mode === 'dark' ? 'Light' : 'Dark'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={700} mb={2}>Change Password</Typography>
          {pwError && <Alert severity="error" sx={{ mb: 2 }}>{pwError}</Alert>}
          <Box component="form" onSubmit={handlePwSubmit} display="flex" flexDirection="column" gap={2}>
            <TextField label="New Password" type="password" value={pwForm.newPw}
              onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))} fullWidth />
            <TextField label="Confirm New Password" type="password" value={pwForm.confirm}
              onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} fullWidth />
            <Divider />
            <Button type="submit" variant="outlined" disabled={!pwForm.newPw || !pwForm.confirm || pwMutation.isPending} sx={{ alignSelf: 'flex-start' }}>
              {pwMutation.isPending ? 'Updating…' : 'Update Password'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
