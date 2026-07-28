import { useState } from 'react';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Card, CardContent, TextField, Button, Typography,
  Alert, InputAdornment, IconButton, Divider, Link, useTheme,
} from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useAuth } from '@/hooks/useAuth';
import { isMissingEnv } from '@/lib/supabase';

export function LoginPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password are required.'); return; }
    setLoading(true); setError('');
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) setError(err);
    else navigate(from, { replace: true });
  };

  return (
    <Box
      minHeight="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      sx={{
        background: theme.palette.mode === 'dark'
          ? 'linear-gradient(135deg,#0F1117 0%,#1A1D2E 100%)'
          : 'linear-gradient(135deg,#EEF2FF 0%,#F5F3FF 100%)',
        p: 2,
      }}
    >
      <Box width="100%" maxWidth={420}>
        {isMissingEnv && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <strong>Setup required:</strong> Copy <code>.env.example</code> → <code>.env</code> and add your Supabase URL &amp; anon key.
          </Alert>
        )}
        {/* Brand */}
        <Box textAlign="center" mb={4}>
          <Box display="inline-flex" alignItems="center" justifyContent="center"
            sx={{ width: 56, height: 56, borderRadius: 3, background: 'linear-gradient(135deg,#4F46E5,#7C3AED)', mb: 2, boxShadow: '0 8px 24px rgba(79,70,229,.4)' }}>
            <BugReportIcon sx={{ color: '#fff', fontSize: 30 }} />
          </Box>
          <Typography variant="h4" fontWeight={800} gutterBottom>TestHub</Typography>
          <Typography variant="body2" color="text.secondary">Professional QA Management Platform</Typography>
        </Box>

        <Card>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" fontWeight={700} mb={0.5}>Sign In</Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Enter your credentials to access the platform.
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Box component="form" onSubmit={handleSubmit} display="flex" flexDirection="column" gap={2}>
              <TextField
                label="Email Address"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                fullWidth
                autoFocus
                autoComplete="email"
              />
              <TextField
                label="Password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                fullWidth
                autoComplete="current-password"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setShowPw(p => !p)} edge="end">
                        {showPw ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} sx={{ py: 1.5 }}>
                {loading ? 'Signing in…' : 'Sign In'}
              </Button>
            </Box>

            <Box display="flex" justifyContent="flex-end">
              <Link component={RouterLink} to="/forgot-password" variant="caption" color="primary.main" fontWeight={600}>
                Forgot password?
              </Link>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Typography variant="body2" color="text.secondary" textAlign="center">
              Don't have an account?{' '}
              <Link component={RouterLink} to="/signup" fontWeight={600}>Sign up</Link>
            </Typography>
          </CardContent>
        </Card>

        <Typography variant="caption" color="text.disabled" textAlign="center" display="block" mt={3}>
          TestHub v1.0 — QA Management Platform
        </Typography>
      </Box>
    </Box>
  );
}
