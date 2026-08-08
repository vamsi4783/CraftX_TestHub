import {
  Box, Card, CardContent, Typography, Chip, Grid,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BugReportIcon from '@mui/icons-material/BugReport';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';

const FEATURES = [
  {
    label:       'AI Test Generation',
    icon:        <AutoAwesomeIcon />,
    description: 'Automatically generate test cases from recorded flows.',
  },
  {
    label:       'Failure Analysis',
    icon:        <BugReportIcon />,
    description: 'Analyse failed test runs and suggest root causes.',
  },
  {
    label:       'Regression Analysis',
    icon:        <TrendingUpIcon />,
    description: 'Detect regressions and score risk across releases.',
  },
  {
    label:       'Self Healing',
    icon:        <AutoFixHighIcon />,
    description: 'Automatically repair broken selectors and step definitions.',
  },
] as const;

export function FeatureReadinessPanel() {
  return (
    <Box mt={4}>
      <Typography variant="h6" fontWeight={700} mb={2}>
        AI Feature Readiness
      </Typography>
      <Grid container spacing={2}>
        {FEATURES.map(f => (
          <Grid item xs={12} sm={6} key={f.label}>
            <Card variant="outlined">
              <CardContent>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Box sx={{ color: 'text.secondary' }}>{f.icon}</Box>
                  <Typography variant="subtitle2" fontWeight={700}>{f.label}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" mb={1}>
                  {f.description}
                </Typography>
                <Chip
                  label="Connector platform ready — feature migration pending"
                  size="small"
                  color="info"
                  variant="outlined"
                  data-testid={`readiness-chip-${f.label.toLowerCase().replace(/\s+/g, '-')}`}
                />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
