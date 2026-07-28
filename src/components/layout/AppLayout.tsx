import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Box, Toolbar } from '@mui/material';
import { Sidebar, DRAWER_WIDTH, DRAWER_COLLAPSED } from './Sidebar';
import { Header } from './Header';

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Header onMenuClick={() => setMobileOpen(o => !o)} />
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minHeight: '100vh',
          ml: { md: `${DRAWER_COLLAPSED}px` },
          transition: 'margin .2s',
          overflow: 'auto',
        }}
      >
        <Toolbar /> {/* spacer below AppBar */}
        <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
