// ─── ProjectUnderstandingSummary (M12 Phase E) ───────────────────────────────
// Concise, human-readable summary of what Project Intelligence detected about
// a project, shown before the user configures test generation.
// Clearly distinguishes Detected / Inferred / Unknown.

import {
  Box, Paper, Typography, Chip, Stack, Divider, Grid,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import HelpOutlineIcon  from '@mui/icons-material/HelpOutline';
import type { ProjectKnowledge } from '@/services/projectIngestion';

interface Props {
  knowledge:     ProjectKnowledge;
  existingCount: number;   // TestHub test cases for this project
}

interface Row {
  label:   string;
  value:   string;
  status:  'detected' | 'inferred' | 'unknown';
}

export function ProjectUnderstandingSummary({ knowledge, existingCount }: Props) {
  const rows: Row[] = [
    {
      label:  'Project name',
      value:  knowledge.name || 'Unknown',
      status: knowledge.name ? 'detected' : 'unknown',
    },
    {
      label:  'Purpose',
      value:  knowledge.description || 'Could not determine purpose — add a README.',
      status: knowledge.description ? 'detected' : 'unknown',
    },
    {
      label:  'Technology',
      value:  [...knowledge.frameworks, ...knowledge.languages].join(', ') || 'Unknown',
      status: knowledge.frameworks.length > 0 ? 'detected' : knowledge.languages.length > 0 ? 'inferred' : 'unknown',
    },
    {
      label:  'Architecture',
      value:  knowledge.architectureStyle || 'Could not detect',
      status: knowledge.architectureStyle ? 'inferred' : 'unknown',
    },
    {
      label:  'Build system',
      value:  knowledge.buildSystem || 'Unknown',
      status: knowledge.buildSystem ? 'detected' : 'unknown',
    },
  ];

  const majModules = knowledge.codeModules.slice(0, 8);
  const entryPoints = knowledge.entryPoints.slice(0, 6);

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      {/* Header */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={1}>
          Project Understanding
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Derived from Project Intelligence analysis. Labels indicate confidence in each field.
        </Typography>

        <Stack spacing={1}>
          {rows.map(r => (
            <Stack key={r.label} direction="row" spacing={1.5} alignItems="flex-start">
              <StatusIcon status={r.status} />
              <Box flex={1}>
                <Typography variant="caption" color="text.secondary" display="block">
                  {r.label}
                </Typography>
                <Typography variant="body2">{r.value}</Typography>
              </Box>
              <StatusChip status={r.status} />
            </Stack>
          ))}
        </Stack>
      </Paper>

      {/* Modules */}
      {majModules.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" mb={1}>
            Major Modules ({knowledge.codeModules.length} total)
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.75}>
            {majModules.map(m => {
              const covered = knowledge.coveredModules.includes(m.id);
              return (
                <Chip
                  key={m.id}
                  label={`${m.name} (${m.fileCount})`}
                  size="small"
                  color={covered ? 'success' : 'warning'}
                  variant={covered ? 'outlined' : 'filled'}
                  title={covered ? 'Has test coverage' : 'No test coverage'}
                />
              );
            })}
            {knowledge.codeModules.length > 8 && (
              <Chip label={`+${knowledge.codeModules.length - 8} more`} size="small" variant="outlined" />
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary" mt={1} display="block">
            Green = has some test coverage · Orange = no tests detected
          </Typography>
        </Paper>
      )}

      {/* Entry points */}
      {entryPoints.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" mb={1}>Important Entry Points</Typography>
          <Stack spacing={0.5}>
            {entryPoints.map((ep, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="center">
                <Chip label={ep.kind} size="small" variant="outlined" sx={{ minWidth: 90, justifyContent: 'center' }} />
                <Typography variant="caption" fontFamily="monospace" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                  {ep.path}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Coverage */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={6} sm={3}>
            <Stat label="Files indexed" value={knowledge.indexedFiles} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <Stat label="Modules" value={knowledge.codeModules.length} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <Stat label="TestHub tests" value={existingCount} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <Stat label="Source test files" value={knowledge.existingTestPaths.length} />
          </Grid>
        </Grid>

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="caption" color="text.secondary">
          Source test files = files in the project repository named *.test.* or *_test.*.
          TestHub tests = test cases created in TestHub (manual, imported, or AI-generated).
          These are different metrics.
        </Typography>
      </Paper>

      {/* Potential gaps */}
      {knowledge.uncoveredModules.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, borderColor: 'warning.main' }}>
          <Typography variant="subtitle2" color="warning.main" mb={0.5}>
            Potential Test Gaps ({knowledge.uncoveredModules.length} uncovered modules)
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.5}>
            {knowledge.uncoveredModules.slice(0, 10).map(id => {
              const mod = knowledge.codeModules.find(m => m.id === id);
              return (
                <Chip key={id} label={mod?.name ?? id} size="small" color="warning" variant="outlined" />
              );
            })}
          </Stack>
          <Typography variant="caption" color="text.secondary" mt={1} display="block">
            Inferred from the absence of test files in these module directories.
          </Typography>
        </Paper>
      )}
    </Box>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: Row['status'] }) {
  if (status === 'detected') return <CheckCircleIcon fontSize="small" color="success" sx={{ mt: 0.25 }} />;
  if (status === 'inferred') return <InfoOutlinedIcon fontSize="small" color="info"    sx={{ mt: 0.25 }} />;
  return                            <HelpOutlineIcon  fontSize="small" color="disabled" sx={{ mt: 0.25 }} />;
}

function StatusChip({ status }: { status: Row['status'] }) {
  const props = {
    detected: { label: 'Detected', color: 'success' as const },
    inferred: { label: 'Inferred', color: 'info'    as const },
    unknown:  { label: 'Unknown',  color: 'default' as const },
  }[status];
  return <Chip {...props} size="small" variant="outlined" sx={{ minWidth: 80, justifyContent: 'center' }} />;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Box textAlign="center">
      <Typography variant="h6" fontWeight={700}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}
