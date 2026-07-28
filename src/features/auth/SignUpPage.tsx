import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, TextField, Button, Typography,
  Alert, InputAdornment, IconButton, useTheme, Link,
} from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { supabase } from '@/lib/supabase';
import { handleError } from '@/lib/errors';

export function SignUpPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) { setError('Passwords do not match'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setError(''); setLoading(true);
    try {
      const { error: err } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: { data: { full_name: form.full_name.trim() } },
      });
      if (err) throw err;
      setSuccess(true);
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
          <Typography variant="h4" fontWeight={800} gutterBottom>Create Account</Typography>
          <Typography variant="body2" color="text.secondary">Join your team on TestHub</Typography>
        </Box>

        {success ? (
          <Card>
            <CardContent sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="h6" fontWeight={700} mb={1}>Check your email!</Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                We sent a verification link to <strong>{form.email}</strong>. Click it to activate your account.
              </Typography>
              <Button variant="contained" fullWidth component={RouterLink} to="/login">Back to Login</Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent sx={{ p: 3 }}>
              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
              <Box component="form" onSubmit={handleSubmit} display="flex" flexDirection="column" gap={2}>
                <TextField label="Full Name" value={form.full_name} onChange={set('full_name')} required fullWidth />
                <TextField label="Work Email" type="email" value={form.email} onChange={set('email')} required fullWidth />
                <TextField
                  label="Password" type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')} required fullWidth
                  InputProps={{ endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPw(s => !s)} edge="end">{showPw ? <VisibilityOffIcon /> : <VisibilityIcon />}</IconButton></InputAdornment> }}
                />
                <TextField label="Confirm Password" type="password" value={form.confirm} onChange={set('confirm')} required fullWidth />
                <Button type="submit" variant="contained" size="large" disabled={loading} fullWidth
                  sx={{ mt: 1, py: 1.5, background: 'linear-gradient(135deg,#4F46E5,#7C3AED)', fontWeight: 700 }}>
                  {loading ? 'Creating account…' : 'Create Account'}
                </Button>
              </Box>
              <Box textAlign="center" mt={2}>
                <Typography variant="body2" color="text.secondary">
                  Already have an account?{' '}
                  <Link component={RouterLink} to="/login" fontWeight={600}>Sign in</Link>
                </Typography>
              </Box>
            </CardContent>
          </Card>
        )}
      </Box>
    </Box>
  );
}
