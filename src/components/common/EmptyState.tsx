import { Box, Typography, Button } from '@mui/material';
import type { SvgIconComponent } from '@mui/icons-material';
import type { ReactNode } from 'react';

interface Props {
  icon?: SvgIconComponent | ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, actionLabel, onAction, action }: Props) {
  const iconNode = typeof icon === 'function'
    ? (() => { const Icon = icon as SvgIconComponent; return <Icon sx={{ fontSize: 56, color: 'text.disabled', mb: 1 }} />; })()
    : icon;
  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={10} gap={2} textAlign="center">
      {iconNode}
      <Typography variant="h6" fontWeight={600}>{title}</Typography>
      {description && <Typography variant="body2" color="text.secondary" maxWidth={360}>{description}</Typography>}
      {actionLabel && onAction && (
        <Button variant="contained" onClick={onAction} sx={{ mt: 1 }}>{actionLabel}</Button>
      )}
      {action}
    </Box>
  );
}
