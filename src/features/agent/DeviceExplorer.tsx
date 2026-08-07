import {
  Box, Card, CardContent, CardHeader, Typography, Chip, Grid,
  Tooltip,
} from '@mui/material';
import AndroidIcon from '@mui/icons-material/Android';
import LanguageIcon from '@mui/icons-material/Language';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';
import type { AgentDevice, DeviceKind, DeviceAvailability } from './AgentTypes';

const KIND_ICON: Record<DeviceKind, React.ReactNode> = {
  android:   <AndroidIcon fontSize="small" />,
  browser:   <LanguageIcon fontSize="small" />,
  simulator: <PhoneIphoneIcon fontSize="small" />,
  emulator:  <DeveloperBoardIcon fontSize="small" />,
};

const AVAIL_COLOR: Record<DeviceAvailability, 'success' | 'warning' | 'error' | 'default'> = {
  available:    'success',
  busy:         'warning',
  error:        'error',
  disconnected: 'default',
};

interface Props {
  devices: AgentDevice[];
}

export function DeviceExplorer({ devices }: Props) {
  return (
    <Card variant="outlined">
      <CardHeader
        title="Connected Devices"
        titleTypographyProps={{ variant: 'subtitle2', fontWeight: 700 }}
        action={
          <Chip label={String(devices.length)} size="small" color={devices.length > 0 ? 'primary' : 'default'} />
        }
        sx={{ pb: 0 }}
      />
      <CardContent>
        {devices.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No devices registered.</Typography>
        ) : (
          <Grid container spacing={1.5}>
            {devices.map(d => (
              <Grid item xs={12} sm={6} key={d.deviceId}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                  }}
                >
                  <Tooltip title={d.kind}>
                    <Box sx={{ color: 'text.secondary', display: 'flex' }}>
                      {KIND_ICON[d.kind]}
                    </Box>
                  </Tooltip>
                  <Box flex={1} overflow="hidden">
                    <Typography variant="body2" fontWeight={600} noWrap>{d.label}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>{d.deviceId}</Typography>
                  </Box>
                  <Chip
                    label={d.availability}
                    size="small"
                    color={AVAIL_COLOR[d.availability]}
                    variant="outlined"
                    sx={{ flexShrink: 0 }}
                  />
                </Box>
              </Grid>
            ))}
          </Grid>
        )}
      </CardContent>
    </Card>
  );
}
