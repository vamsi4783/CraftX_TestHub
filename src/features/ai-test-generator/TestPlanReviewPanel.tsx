// ─── TestPlanReviewPanel (M12 Phase F) ───────────────────────────────────────
// Displays the AI Test Plan — the intermediate layer between Project Intelligence
// and full test case generation. Users can review what will be tested before
// committing to generation.

import {
  Box, Paper, Typography, Chip, Stack, Accordion, AccordionSummary,
  AccordionDetails, Alert, LinearProgress,
} from '@mui/material';
import ExpandMoreIcon   from '@mui/icons-material/ExpandMore';
import CheckCircleIcon  from '@mui/icons-material/CheckCircle';
import AutoAwesomeIcon  from '@mui/icons-material/AutoAwesome';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { AiTestPlan, TestPlanCoverageArea } from '@/services/aiTestGenerator';

interface Props {
  plan:          AiTestPlan;
  existingCounts: Record<string, number>;  // moduleId → actual TestHub test count
}

const PRIORITY_COLORS = {
  high:   'error',
  medium: 'warning',
  low:    'default',
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  smoke:          'Smoke',
  happy_path:     'Happy Path',
  validation:     'Validation',
  boundary:       'Boundary',
  negative:       'Negative',
  permission:     'Permission',
  navigation:     'Navigation',
  regression:     'Regression',
  integration:    'Integration',
  performance:    'Performance',
  api:            'API',
  data_validation:'Data Validation',
  compatibility:  'Compatibility',
};

export function TestPlanReviewPanel({ plan, existingCounts }: Props) {
  const totalModules   = plan.modules.length;
  const coveredModules = plan.modules.filter(m => (existingCounts[m.moduleId] ?? 0) > 0).length;

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      {/* Summary header */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" mb={1}>
          <AutoAwesomeIcon color="primary" fontSize="small" />
          <Typography variant="subtitle1" fontWeight={700}>AI Test Plan</Typography>
          <Chip label={plan.projectName} size="small" />
        </Stack>

        <Stack direction="row" spacing={2} flexWrap="wrap">
          <Stat label="Modules in plan"    value={totalModules} />
          <Stat label="Already covered"    value={coveredModules} />
          <Stat label="Estimated new tests" value={plan.totalEstimatedTests} />
        </Stack>
      </Paper>

      {/* Coverage gaps */}
      {plan.coverageGaps.length > 0 && (
        <Alert severity="warning" icon={<WarningAmberIcon />}>
          <Typography variant="subtitle2" gutterBottom>Identified coverage gaps:</Typography>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {plan.coverageGaps.map((gap, i) => (
              <li key={i}><Typography variant="body2">{gap}</Typography></li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Module plans */}
      <Box>
        <Typography variant="subtitle2" color="text.secondary" mb={1}>
          Coverage plan by module — review before generating test cases
        </Typography>
        {plan.modules.map(m => {
          const existing   = existingCounts[m.moduleId] ?? 0;
          const isCovered  = existing > 0;
          return (
            <Accordion key={m.moduleId} disableGutters elevation={0}
              sx={{ border: 1, borderColor: 'divider', mb: 0.5, '&:before': { display: 'none' } }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" spacing={1.5} alignItems="center" flex={1} mr={1}>
                  {isCovered
                    ? <CheckCircleIcon fontSize="small" color="success" />
                    : <WarningAmberIcon fontSize="small" color="warning" />
                  }
                  <Typography variant="body2" fontWeight={600}>{m.moduleName}</Typography>
                  <Box flex={1} />
                  <Chip
                    label={`${existing} existing`}
                    size="small"
                    color={isCovered ? 'success' : 'default'}
                    variant="outlined"
                  />
                  <Chip
                    label={`~${m.estimatedNewTests} new`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                </Stack>
              </AccordionSummary>

              <AccordionDetails sx={{ pt: 0 }}>
                <Stack spacing={0.75}>
                  {m.coverageAreas.map((area, i) => (
                    <CoverageAreaRow key={i} area={area} />
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>

      {/* Legend */}
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <Stack direction="row" spacing={0.5} alignItems="center">
            <CheckCircleIcon fontSize="small" color="success" />
            <Typography variant="caption">Detected from project structure</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <AutoAwesomeIcon fontSize="small" color="disabled" />
            <Typography variant="caption">Inferred from module type</Typography>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}

function CoverageAreaRow({ area }: { area: TestPlanCoverageArea }) {
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ py: 0.5 }}>
      <Chip
        label={CATEGORY_LABELS[area.category] ?? area.category}
        size="small"
        variant="outlined"
        sx={{ minWidth: 100, justifyContent: 'center', flexShrink: 0, fontSize: '0.7rem' }}
      />
      <Chip
        label={area.priority}
        size="small"
        color={PRIORITY_COLORS[area.priority] ?? 'default'}
        variant="outlined"
        sx={{ minWidth: 62, justifyContent: 'center', flexShrink: 0, fontSize: '0.7rem' }}
      />
      <Box flex={1}>
        <Typography variant="body2">{area.name}</Typography>
        {!area.detected && (
          <Typography variant="caption" color="text.secondary">(Inferred)</Typography>
        )}
      </Box>
    </Stack>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Box textAlign="center" minWidth={80}>
      <Typography variant="h6" fontWeight={700}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}
