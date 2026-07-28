import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar, Toolbar, IconButton, InputBase, Box, Badge, Tooltip,
  Avatar, Menu, MenuItem, Divider, Typography, alpha, useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsIcon from '@mui/icons-material/Notifications';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '@/hooks/useAuth';
import { useThemeMode } from '@/hooks/useThemeMode';
import { getInitials } from '@/lib/utils';
import { notificationService } from '@/services/notificationService';
import { toast } from '@/lib/toast';
import type { Notification } from '@/types';

interface Props { onMenuClick: () => void }

export function Header({ onMenuClick }: Props) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { mode, toggle } = useThemeMode();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [search, setSearch] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  // Load unread count + subscribe to realtime notifications
  useEffect(() => {
    if (!profile?.id) return;
    notificationService.getUnreadCount(profile.id).then(setUnreadCount);
    const channel = notificationService.subscribeToUser(profile.id, (n: Notification) => {
      setUnreadCount(c => c + 1);
      toast.info(n.title);
    });
    return () => { channel.unsubscribe(); };
  }, [profile?.id]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) { navigate(`/search?q=${encodeURIComponent(search.trim())}`); setSearch(''); }
  };

  const handleSignOut = async () => { setAnchorEl(null); await signOut(); navigate('/login'); };

  return (
    <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1, left: 0, right: 0, width: '100%' }}>
      <Toolbar sx={{ gap: 1 }}>
        <IconButton edge="start" onClick={onMenuClick} sx={{ display: { md: 'none' } }}>
          <MenuIcon />
        </IconButton>

        <Box
          component="form" onSubmit={handleSearchSubmit}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            bgcolor: alpha(theme.palette.text.primary, 0.06),
            borderRadius: 2, px: 1.5, py: 0.5,
            width: { xs: 180, sm: 280, md: 340 },
            border: `1px solid ${theme.palette.divider}`,
            '&:focus-within': { borderColor: theme.palette.primary.main, bgcolor: alpha(theme.palette.primary.main, 0.05) },
          }}
        >
          <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
          <InputBase
            placeholder="Search projects, bugs, tests…"
            value={search} onChange={e => setSearch(e.target.value)}
            sx={{ fontSize: '0.875rem', flex: 1 }}
          />
        </Box>

        <Box flex={1} />

        <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
          <IconButton onClick={toggle} size="small">
            {mode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
          </IconButton>
        </Tooltip>

        <Tooltip title="Notifications">
          <IconButton size="small" onClick={() => { navigate('/notifications'); setUnreadCount(0); }}>
            <Badge badgeContent={unreadCount || undefined} color="error">
              <NotificationsIcon fontSize="small" />
            </Badge>
          </IconButton>
        </Tooltip>

        <Tooltip title="Account">
          <Avatar
            src={profile?.avatar_url ?? undefined}
            onClick={e => setAnchorEl(e.currentTarget)}
            sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            {getInitials(profile?.full_name ?? profile?.email)}
          </Avatar>
        </Tooltip>

        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}
          PaperProps={{ sx: { mt: 1, minWidth: 200 } }}>
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="subtitle2" fontWeight={700}>{profile?.full_name ?? 'User'}</Typography>
            <Typography variant="caption" color="text.secondary">{profile?.email}</Typography>
          </Box>
          <Divider />
          <MenuItem onClick={() => { setAnchorEl(null); navigate('/settings'); }}>
            <PersonIcon fontSize="small" sx={{ mr: 1.5 }} />Profile & Settings
          </MenuItem>
          <Divider />
          <MenuItem onClick={handleSignOut} sx={{ color: 'error.main' }}>
            <LogoutIcon fontSize="small" sx={{ mr: 1.5 }} />Sign Out
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
