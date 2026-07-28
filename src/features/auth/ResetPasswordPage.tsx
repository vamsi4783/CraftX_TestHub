import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Card, CardContent, TextField, Button, Typography, Alert, InputAdornment, IconButton, useTheme } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/errors';
import { toast } from '@/lib/toast';

export function ResetPasswordPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase sends the access token in the URL hash after redirect
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setError(''); setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      toast.success('Password updated successfully!');
      navigate('/login');
    } catch (err) {
      setError(handleError(err));
    } finally {
      setLoading(false);
    }
  };

  const bg = theme.palette.mode === 'dark'
    ? 'linear-gradient(135deg,#0F1117 0%,#1A1D2E 100%)'
    : 'linear-gradient(135deg,#EEF2FF 0%,#F5F3FF 100%)';

  return (
    <Box minHeight="100vh" display="flex" alignItems="center" justifyContent="center" sx={{ background: bg, p: 2 }}>
      <Box width="100%" maxWidth={420}>
        <Box textAlign="center" mb={4}>
          <Box display="inline-flex" alignItems="center" justifyContent="center"
            sx={{ width: 56, height: 56, borderRadius: 3, background: 'linear-gradient(135deg,#4F46E5,#7C3AED)', mb: 2, boxShadow: '0 8px 24px rgba(79,70,229,.4)' }}>
            <BugReportIcon sx={{ color: '#fff', fontSize: 30 }} />
          </Box>
          <Typography variant="h4" fontWeight={800} gutterBottom>New Password</Typography>
          <Typography variant="body2" color="text.secondary">Choose a strong password for your account</Typography>
        </Box>
        <Card>
          <CardContent sx={{ p: 3 }}>
            {!ready ? (
              <Alert severity="warning">
                This link may have expired. Request a{' '}
                <a href="/forgot-password" style={{ color: 'inherit' }}>new reset link</a>.
              </Alert>
            ) : (
              <>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <Box component="form" onSubmit={handleSubmit} display="flex" flexDirection="column" gap={2}>
                  <TextField
                    label="New Password" type={showPw ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)} required fullWidth
                    InputProps={{ endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPw(s => !s)} edge="end">{showPw ? <VisibilityOffIcon /> : <VisibilityIcon />}</IconButton></InputAdornment> }}
                  />
                  <TextField label="Confirm Password" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required fullWidth />
                  <Button type="submit" variant="contained" size="large" disabled={loading} fullWidth
                    sx={{ py: 1.5, background: 'linear-gradient(135deg,#4F46E5,#7C3AED)', fontWeight: 700 }}>
                    {loading ? 'Updating…' : 'Update Password'}
                  </Button>
                </Box>
              </>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
