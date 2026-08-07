import {
  Card, CardHeader, CardContent, Box, Typography, LinearProgress, Chip, Grid,
} from '@mui/material';
import type { EvidenceItem } from './AgentTypes';

const STATUS_COLOR: Record<EvidenceItem['status'], 'default' | 'info' | 'success' | 'error'> = {
  pending:   'default',
  uploading: 'info',
  uploaded:  'success',
  failed:    'error',
};

interface Props {
  items: EvidenceItem[];
}

export function EvidenceProgressView({ items }: Props) {
  const uploaded  = items.filter(i => i.status === 'uploaded').length;
  const failed    = items.filter(i => i.status === 'failed').length;
  const uploading = items.filter(i => i.status === 'uploading').length;

  return (
    <Card variant="outlined">
      <CardHeader
        title="Evidence Upload Progress"
        titleTypographyProps={{ variant: 'subtitle2', fontWeight: 700 }}
        action={
          items.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              {uploading > 0 && <Chip label={`${uploading} uploading`} size="small" color="info" />}
              {failed    > 0 && <Chip label={`${failed} failed`}    size="small" color="error" />}
              {uploaded  > 0 && <Chip label={`${uploaded} done`}    size="small" color="success" />}
            </Box>
          )
        }
        sx={{ pb: 0 }}
      />
      <CardContent>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No evidence items collected.</Typography>
        ) : (
          <>
            {items.length > 0 && (
              <Box mb={2}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">Overall</Typography>
                  <Typography variant="caption">{uploaded} / {items.length} uploaded</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.round((uploaded / items.length) * 100)}
                  color={failed > 0 ? 'error' : 'primary'}
                  sx={{ borderRadius: 1 }}
                />
              </Box>
            )}
            <Grid container spacing={1}>
              {items.map(item => (
                <Grid item xs={12} key={item.evidenceId}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box flex={1} overflow="hidden">
                      <Typography variant="caption" fontWeight={600} noWrap display="block">
                        {item.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {item.mimeType}
                        {item.sizeBytes != null ? ` · ${(item.sizeBytes / 1024).toFixed(1)} KB` : ''}
                        {item.retryCount > 0 ? ` · retries: ${item.retryCount}` : ''}
                      </Typography>
                    </Box>
                    <Chip
                      label={item.status}
                      size="small"
                      color={STATUS_COLOR[item.status]}
                      variant="outlined"
                      sx={{ flexShrink: 0 }}
                    />
                  </Box>
                </Grid>
              ))}
            </Grid>
          </>
        )}
      </CardContent>
    </Card>
  );
}
