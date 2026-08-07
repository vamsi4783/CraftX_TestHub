import { Chip } from '@mui/material';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import type { ConnectionState } from './AgentTypes';

const COLOR_MAP: Record<ConnectionState, 'success' | 'warning' | 'error' | 'default'> = {
  Connected:            'success',
  Connecting:           'warning',
  Reconnecting:         'warning',
  Disconnected:         'default',
  AuthenticationFailed: 'error',
};

interface Props {
  state: ConnectionState;
  size?: 'small' | 'medium';
}

export function ConnectionStatusBadge({ state, size = 'small' }: Props) {
  return (
    <Chip
      icon={<FiberManualRecordIcon sx={{ fontSize: '10px !important' }} />}
      label={state}
      size={size}
      color={COLOR_MAP[state]}
      variant="outlined"
    />
  );
}
