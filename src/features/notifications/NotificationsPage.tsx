import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Card, Typography, Button, Divider, IconButton, Tooltip } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { notificationService } from '@/services/notificationService';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { timeAgo } from '@/lib/utils';
import type { Notification } from '@/types';

const TYPE_COLORS: Record<string, string> = {
  bug_created: '#EF4444', bug_assigned: '#F59E0B', bug_fixed: '#10B981',
  test_assigned: '#4F46E5', release_started: '#06B6D4', feature_request: '#7C3AED',
  comment_added: '#6B7280',
};

export function NotificationsPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const { data: notifs = [], isLoading } = useQuery({
    queryKey: ['notifications', profile?.id],
    queryFn: () => notificationService.getForUser(profile!.id),
    enabled: !!profile,
    refetchInterval: 30_000,
  });

  // Realtime subscription
  useEffect(() => {
    if (!profile?.id) return;
    const channel = notificationService.subscribeToUser(profile.id, () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    });
    return () => { channel.unsubscribe(); };
  }, [profile?.id, qc]);

  const markRead = useMutation({
    mutationFn: (id: string) => notificationService.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationService.markAllRead(profile!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = notifs.filter(n => !n.is_read).length;

  return (
    <Box maxWidth={720}>
      <PageHeader
        title="Notifications"
        subtitle={`${unread} unread notification${unread === 1 ? '' : 's'}`}
        actions={
          unread > 0 ? (
            <Button startIcon={<DoneAllIcon />} onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
              Mark All Read
            </Button>
          ) : undefined
        }
      />

      {notifs.length === 0 && !isLoading ? (
        <EmptyState icon={NotificationsIcon} title="All caught up!" description="No notifications yet." />
      ) : (
        <Card>
          {notifs.map((n: Notification, i: number) => (
            <Box key={n.id}>
              {i > 0 && <Divider />}
              <Box sx={{
                px: 2, py: 1.5, display: 'flex', alignItems: 'flex-start', gap: 1.5,
                bgcolor: n.is_read ? 'transparent' : 'rgba(79,70,229,0.05)',
              }}>
                <Box sx={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0, mt: 1,
                  bgcolor: n.is_read ? 'transparent' : (TYPE_COLORS[n.type] ?? 'primary.main'),
                }} />
                <Box flex={1}>
                  <Typography variant="body2" fontWeight={n.is_read ? 400 : 700}>{n.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{n.message}</Typography>
                  <Typography variant="caption" color="text.disabled" display="block" mt={0.25}>{timeAgo(n.created_at)}</Typography>
                </Box>
                {!n.is_read && (
                  <Tooltip title="Mark as read">
                    <IconButton size="small" onClick={() => markRead.mutate(n.id)}>
                      <CheckIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Box>
          ))}
        </Card>
      )}
    </Box>
  );
}
