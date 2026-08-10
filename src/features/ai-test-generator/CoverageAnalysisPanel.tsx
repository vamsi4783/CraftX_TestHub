// ─── CoverageAnalysisPanel (M12 Phase G) ─────────────────────────────────────
// Displays the TestHub AI Coverage Estimate — module-level coverage based on
// actual TestHub test cases mapped to project modules.
//
// Clearly labelled: NOT code coverage. Logical estimate only.

import {
  Box, Paper, Typography, LinearProgress, Stack, Chip, Alert,
} from '@mui/material';
import type { CoverageAnalysisResult } from '@/services/coverageAnalysisService';

interface Props {
  analysis: CoverageAnalysisResult;
}

const LEVEL_COLOR = {
  none:     '#ef4444',   // red
  weak:     '#f97316',   // orange
  moderate: '#eab308',   // yellow
  strong:   '#22c55e',   // green
} as const;

const LEVEL_LABEL = {
  none:     'No tests',
  weak:     'Weak (1–2 tests)',
  moderate: 'Moderate (3–5 tests)',
  strong:   'Strong (6+ tests)',
} as const;

export function CoverageAnalysisPanel({ analysis }: Props) {
  return (
    <Box display="flex" flexDirection="column" gap={2}>
      {/* Headline */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="baseline" mb={1}>
          <Typography variant="h4" fontWeight={700} color="primary">
            {analysis.estimatedPercent}%
          </Typography>
          <Typography variant="body2" color="text.secondary">
            TestHub AI Coverage Estimate
          </Typography>
        </Stack>

        <LinearProgress
          variant="determinate"
          value={analysis.estimatedPercent}
          sx={{ height: 10, borderRadius: 5, mb: 2 }}
          color={
            analysis.estimatedPercent >= 70 ? 'success' :
            analysis.estimatedPercent >= 40 ? 'warning' : 'error'
          }
        />

        <Stack direction="row" spacing={2} flexWrap="wrap">
          <Stat label="Total modules"     value={analysis.totalModules} />
          <Stat label="Covered"           value={analysis.coveredModules} color="success.main" />
          <Stat label="Uncovered"         value={analysis.uncoveredModules} color="error.main" />
          <Stat label="Weak (< 3 tests)"  value={analysis.weakModules} color="warning.main" />
        </Stack>
      </Paper>

      {/* Module breakdown */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" mb={1.5}>Coverage by module</Typography>
        <Stack spacing={1.5}>
          {analysis.entries.map(entry => {
            const barWidth = entry.coverageLevel === 'none'     ? 0  :
                             entry.coverageLevel === 'weak'     ? 25 :
                             entry.coverageLevel === 'moderate' ? 60 : 95;
            return (
              <Box key={entry.module.id}>
                <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                  <Typography variant="body2" sx={{ minWidth: 120, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.module.name}
                  </Typography>
                  <Box flex={1} sx={{ bgcolor: 'action.hover', borderRadius: 2, height: 8, overflow: 'hidden' }}>
                    <Box
                      sx={{
                        width: `${barWidth}%`,
                        height: '100%',
                        borderRadius: 2,
                        bgcolor: LEVEL_COLOR[entry.coverageLevel],
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </Box>
                  <Chip
                    label={entry.testCount === 0 ? 'None' : `${entry.testCount}`}
                    size="small"
                    sx={{
                      bgcolor: LEVEL_COLOR[entry.coverageLevel] + '22',
                      color: LEVEL_COLOR[entry.coverageLevel],
                      borderColor: LEVEL_COLOR[entry.coverageLevel],
                      minWidth: 44,
                    }}
                    variant="outlined"
                  />
                </Stack>
              </Box>
            );
          })}
        </Stack>
      </Paper>

      {/* Legend */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap">
        {(Object.entries(LEVEL_LABEL) as [keyof typeof LEVEL_LABEL, string][]).map(([level, label]) => (
          <Stack key={level} direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: LEVEL_COLOR[level] }} />
            <Typography variant="caption" color="text.secondary">{label}</Typography>
          </Stack>
        ))}
      </Stack>

      {/* Disclaimer */}
      <Alert severity="info" sx={{ fontSize: 12 }}>
        {analysis.disclaimer}
      </Alert>
    </Box>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Box textAlign="center" minWidth={80}>
      <Typography variant="h6" fontWeight={700} color={color}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}
