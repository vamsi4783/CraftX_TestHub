import { Box, Typography, Breadcrumbs, Link } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

interface Crumb { label: string; to?: string }
interface Props {
  title: string;
  subtitle?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, breadcrumbs, actions }: Props) {
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
        <Box>
          <Typography variant="h5" fontWeight={700}>{title}</Typography>
          {subtitle && <Typography variant="body2" color="text.secondary" mt={0.5}>{subtitle}</Typography>}
        </Box>
        {actions && <Box display="flex" gap={1} flexShrink={0}>{actions}</Box>}
      </Box>
    </Box>
  );
}
