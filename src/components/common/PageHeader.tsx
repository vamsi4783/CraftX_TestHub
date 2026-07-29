import { Box, Typography, Breadcrumbs, Link, IconButton, Tooltip } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

interface Crumb { label: string; to?: string }
interface Props {
  title: string;
  subtitle?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  showBack?: boolean;
}

export function PageHeader({ title, subtitle, breadcrumbs, actions, showBack }: Props) {
  const navigate = useNavigate();
  return (
    <Box mb={3}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs sx={{ mb: 1 }}>
          {breadcrumbs.map((c, i) =>
            c.to ? (
              <Link key={i} component={RouterLink} to={c.to} underline="hover" color="text.secondary" variant="body2">
                {c.label}
              </Link>
            ) : (
              <Typography key={i} variant="body2" color="text.primary">{c.label}</Typography>
            )
          )}
        </Breadcrumbs>
      )}
      <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={2}>
        <Box display="flex" alignItems="center" gap={1}>
          {showBack && (
            <Tooltip title="Go back">
              <IconButton onClick={() => navigate(-1)} size="small" sx={{ mt: 0.25 }}>
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Box>
            <Typography variant="h5" fontWeight={700}>{title}</Typography>
            {subtitle && <Typography variant="body2" color="text.secondary" mt={0.5}>{subtitle}</Typography>}
          </Box>
        </Box>
        {actions && <Box display="flex" gap={1} flexShrink={0}>{actions}</Box>}
      </Box>
    </Box>
  );
}
