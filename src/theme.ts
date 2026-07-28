import { createTheme, alpha } from '@mui/material/styles';

const BRAND = '#4F46E5'; // Indigo-600

export function buildTheme(mode: 'light' | 'dark') {
  return createTheme({
    palette: {
      mode,
      primary:   { main: BRAND, light: '#818CF8', dark: '#3730A3' },
      secondary: { main: '#06B6D4' },
      error:     { main: '#EF4444' },
      warning:   { main: '#F59E0B' },
      success:   { main: '#10B981' },
      info:      { main: '#3B82F6' },
      background: mode === 'dark'
        ? { default: '#0F1117', paper: '#1A1D27' }
        : { default: '#F8FAFC', paper: '#FFFFFF' },
      divider: mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    },
    typography: {
      fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
      h4: { fontWeight: 700 },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 600 },
      subtitle1: { fontWeight: 500 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    shape: { borderRadius: 10 },
    components: {
      MuiCssBaseline: {
        styleOverrides: `
          * { box-sizing: border-box; }
          body { font-family: "Inter", sans-serif; }
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: ${mode === 'dark' ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.2)'}; border-radius: 4px; }
        `,
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 8, fontWeight: 600, letterSpacing: 0 },
          containedPrimary: {
            background: `linear-gradient(135deg, ${BRAND}, #7C3AED)`,
            '&:hover': { background: `linear-gradient(135deg, #3730A3, #6D28D9)` },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
            boxShadow: mode === 'dark' ? 'none' : '0 1px 4px rgba(0,0,0,0.06)',
          },
        },
      },
      MuiChip: {
        styleOverrides: { root: { fontWeight: 600, fontSize: '0.72rem' } },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-head': {
              fontWeight: 700,
              fontSize: '0.72rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: mode === 'dark' ? '#9CA3AF' : '#6B7280',
              background: mode === 'dark' ? alpha('#fff', 0.03) : alpha('#000', 0.02),
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: { root: { borderColor: mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            '& fieldset': { borderColor: mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' },
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            background: mode === 'dark' ? '#111318' : '#FFFFFF',
            borderRight: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: mode === 'dark' ? '#111318' : '#FFFFFF',
            borderBottom: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
            boxShadow: 'none',
            color: mode === 'dark' ? '#F3F4F6' : '#111827',
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: { root: { borderRadius: 4, height: 6 } },
      },
      MuiTab: {
        styleOverrides: { root: { fontWeight: 600, textTransform: 'none' } },
      },
    },
  });
}
