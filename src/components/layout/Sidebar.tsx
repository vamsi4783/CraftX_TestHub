import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Toolbar, Typography, Box, Divider, Chip, Tooltip, IconButton, Avatar,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FolderIcon from '@mui/icons-material/Folder';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import BugReportIcon from '@mui/icons-material/BugReport';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import BarChartIcon from '@mui/icons-material/BarChart';
import PeopleIcon from '@mui/icons-material/People';
import SettingsIcon from '@mui/icons-material/Settings';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import MenuIcon from '@mui/icons-material/Menu';
import ExtensionIcon from '@mui/icons-material/Extension';
import VideoLabelIcon from '@mui/icons-material/VideoLabel';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import { useAuth } from '@/hooks/useAuth';
import { getInitials } from '@/lib/utils';

export const DRAWER_WIDTH = 240;
export const DRAWER_COLLAPSED = 64;

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: number;
  adminOnly?: boolean;
  dividerBefore?: boolean;
}

const NAV: NavItem[] = [
  { label: 'Dashboard',        path: '/dashboard',    icon: <DashboardIcon /> },
  { label: 'Projects',         path: '/projects',     icon: <FolderIcon /> },
  { label: 'Releases',         path: '/releases',     icon: <RocketLaunchIcon /> },
  { label: 'Test Cases',       path: '/test-cases',   icon: <AssignmentIcon /> },
  { label: 'My Tests',         path: '/my-tests',     icon: <PlayCircleIcon /> },
  { label: 'Test Plans',       path: '/test-plans',   icon: <LibraryBooksIcon /> },
  { label: 'Test Sessions',    path: '/test-sessions', icon: <VideoLabelIcon /> },
  { label: 'Bugs',             path: '/bugs',         icon: <BugReportIcon /> },
  { label: 'Feature Requests', path: '/features',     icon: <LightbulbIcon /> },
  { label: 'Modules',          path: '/modules',      icon: <ExtensionIcon /> },
  { label: 'Reports',          path: '/reports',      icon: <BarChartIcon />, dividerBefore: true },
  { label: 'Users',            path: '/users',        icon: <PeopleIcon />, adminOnly: true },
  { label: 'Settings',         path: '/settings',     icon: <SettingsIcon />, dividerBefore: true },
];

interface Props { mobileOpen: boolean; onMobileClose: () => void }

export function Sidebar({ mobileOpen, onMobileClose }: Props) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { profile, isAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const width = collapsed ? DRAWER_COLLAPSED : DRAWER_WIDTH;

  const items = NAV.filter(n => !n.adminOnly || isAdmin);

  const content = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Logo */}
      <Toolbar sx={{ px: collapsed ? 1.5 : 2, minHeight: '64px !important', gap: 1.5 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: 1.5, background: 'linear-gradient(135deg,#4F46E5,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <BugReportIcon sx={{ color: '#fff', fontSize: 18 }} />
        </Box>
        {!collapsed && (
          <Box>
            <Typography variant="subtitle1" fontWeight={800} lineHeight={1.1}>TestHub</Typography>
            <Typography variant="caption" color="text.secondary" lineHeight={1}>QA Platform</Typography>
          </Box>
        )}
        {!collapsed && (
          <IconButton size="small" onClick={() => setCollapsed(true)} sx={{ ml: 'auto' }}>
            <MenuOpenIcon fontSize="small" />
          </IconButton>
        )}
        {collapsed && (
          <IconButton size="small" onClick={() => setCollapsed(false)}>
            <MenuIcon fontSize="small" />
          </IconButton>
        )}
      </Toolbar>

      <Divider />

      {/* Nav */}
      <List sx={{ px: 1, py: 1, flex: 1, overflowY: 'auto' }}>
        {items.map(item => {
          const active = pathname === item.path || pathname.startsWith(item.path + '/');
          return (
            <Box key={item.path}>
              {item.dividerBefore && <Divider sx={{ my: 1 }} />}
              <Tooltip title={collapsed ? item.label : ''} placement="right">
                <ListItem disablePadding sx={{ mb: 0.25 }}>
                  <ListItemButton
                    selected={active}
                    onClick={() => { navigate(item.path); onMobileClose(); }}
                    sx={{
                      borderRadius: 2,
                      minHeight: 40,
                      px: collapsed ? 1 : 1.5,
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      '&.Mui-selected': {
                        bgcolor: 'primary.main',
                        color: '#fff',
                        '&:hover': { bgcolor: 'primary.dark' },
                        '& .MuiListItemIcon-root': { color: '#fff' },
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, color: active ? '#fff' : 'text.secondary' }}>
                      {item.icon}
                    </ListItemIcon>
                    {!collapsed && <ListItemText primary={item.label} primaryTypographyProps={{ variant: 'body2', fontWeight: active ? 700 : 500 }} />}
                    {!collapsed && item.badge ? <Chip label={item.badge} size="small" color="error" sx={{ height: 18, '& .MuiChip-label': { px: 0.75, fontSize: 11 } }} /> : null}
                  </ListItemButton>
                </ListItem>
              </Tooltip>
            </Box>
          );
        })}
      </List>

      {/* Profile */}
      <Divider />
      <Box sx={{ p: collapsed ? 1 : 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
          {getInitials(profile?.full_name ?? profile?.email)}
        </Avatar>
        {!collapsed && (
          <Box overflow="hidden">
            <Typography variant="body2" fontWeight={600} noWrap>{profile?.full_name ?? 'User'}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ textTransform: 'capitalize' }}>{profile?.role?.replace('_', ' ')}</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );

  return (
    <>
      {/* Mobile drawer */}
      <Drawer variant="temporary" open={mobileOpen} onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}>
        {content}
      </Drawer>

      {/* Desktop drawer */}
      <Drawer variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width, flexShrink: 0, transition: 'width .2s',
          '& .MuiDrawer-paper': { width, boxSizing: 'border-box', overflowX: 'hidden', transition: 'width .2s' },
        }}>
        {content}
      </Drawer>
    </>
  );
}
