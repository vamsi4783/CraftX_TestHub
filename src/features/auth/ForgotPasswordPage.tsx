import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Card, CardContent, TextField, Button, Typography, Alert, Link, useTheme } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/errors';

export function ForgotPasswordPage() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) throw err;
      setSent(true);
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
          <Typography variant="h4" fontWeight={800} gutterBottom>Reset Password</Typography>
          <Typography variant="body2" color="text.secondary">Enter your email and we'll send a reset link</Typography>
        </Box>
        <Card>
          <CardContent sx={{ p: 3 }}>
            {sent ? (
              <Box textAlign="center">
                <Typography variant="h6" fontWeight={700} mb={1}>Email sent!</Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Check <strong>{email}</strong> for the password reset link.
                </Typography>
                <Button variant="outlined" fullWidth component={RouterLink} to="/login">Back to Login</Button>
              </Box>
            ) : (
              <>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <Box component="form" onSubmit={handleSubmit} display="flex" flexDirection="column" gap={2}>
                  <TextField label="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} required fullWidth />
                  <Button type="submit" variant="contained" size="large" disabled={loading} fullWidth
                    sx={{ py: 1.5, background: 'linear-gradient(135deg,#4F46E5,#7C3AED)', fontWeight: 700 }}>
                    {loading ? 'Sending…' : 'Send Reset Link'}
                  </Button>
                </Box>
                <Box textAlign="center" mt={2}>
                  <Link component={RouterLink} to="/login" variant="body2" fontWeight={600}>Back to Login</Link>
                </Box>
              </>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
