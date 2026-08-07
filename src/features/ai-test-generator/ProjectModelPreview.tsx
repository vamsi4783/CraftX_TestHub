// ─── Project Model Preview (Phase 4 M6) ───────────────────────────────────────
// Displays the extracted ProjectModel so users can verify analysis quality
// before triggering AI generation.

import {
  Box, Typography, Accordion, AccordionSummary, AccordionDetails,
  Chip, Stack, LinearProgress, Alert,
} from '@mui/material';
import ExpandMoreIcon   from '@mui/icons-material/ExpandMore';
import ScreenshotIcon   from '@mui/icons-material/Smartphone';
import ApiIcon          from '@mui/icons-material/Api';
import FormIcon         from '@mui/icons-material/Assignment';
import FlowIcon         from '@mui/icons-material/AccountTree';
import type { ProjectModel } from '@/services/aiTestGenerator';

interface Props { model: ProjectModel }

function ConfidenceBar({ value }: { value: number }) {
  const pct   = Math.round(value * 100);
  const color = pct >= 70 ? 'success' : pct >= 40 ? 'warning' : 'error';
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <LinearProgress
        variant="determinate"
        value={pct}
        color={color}
        sx={{ flex: 1, height: 8, borderRadius: 4 }}
      />
      <Typography variant="caption" color="text.secondary">{pct}% confidence</Typography>
    </Stack>
  );
}

export function ProjectModelPreview({ model }: Props) {
  return (
    <Box display="flex" flexDirection="column" gap={1.5}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Chip label={model.projectType} color="primary" size="small" />
        {model.projectName && <Chip label={model.projectName} size="small" />}
        <Chip label={`${model.screens.length} screens`}    icon={<ScreenshotIcon />} size="small" />
        <Chip label={`${model.apis.length} APIs`}          icon={<ApiIcon />}        size="small" />
        <Chip label={`${model.forms.length} forms`}        icon={<FormIcon />}       size="small" />
        <Chip label={`${model.flows.length} flows`}        icon={<FlowIcon />}       size="small" />
      </Stack>

      <ConfidenceBar value={model.analysisConfidence} />

      {model.analysisNotes?.map((note, i) => (
        <Alert key={i} severity="warning" sx={{ py: 0.5, fontSize: 12 }}>{note}</Alert>
      ))}

      {/* Screens */}
      {model.screens.length > 0 && (
        <Accordion defaultExpanded disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <ScreenshotIcon fontSize="small" />
              <Typography variant="subtitle2">Screens ({model.screens.length})</Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {model.screens.map((s, i) => (
                <Box component="li" key={i} sx={{ mb: 0.5 }}>
                  <Typography variant="body2">
                    <strong>{s.name}</strong>
                    <Typography component="span" variant="caption" color="text.secondary" ml={0.5}>
                      ({s.type}) — {s.elements.length} elements, {s.navigation.length} nav edges
                    </Typography>
                  </Typography>
                </Box>
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>
      )}

      {/* APIs */}
      {model.apis.length > 0 && (
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <ApiIcon fontSize="small" />
              <Typography variant="subtitle2">APIs ({model.apis.length})</Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {model.apis.map((a, i) => (
                <Box component="li" key={i}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                    <Chip label={a.method} size="small" sx={{ mr: 0.5, fontSize: 10 }} />
                    {a.path}
                  </Typography>
                </Box>
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Forms */}
      {model.forms.length > 0 && (
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <FormIcon fontSize="small" />
              <Typography variant="subtitle2">Forms ({model.forms.length})</Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            {model.forms.map((f, i) => (
              <Box key={i} sx={{ mb: 1 }}>
                <Typography variant="body2"><strong>{f.name}</strong></Typography>
                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                  {f.fields.map((field, j) => (
                    <Box component="li" key={j}>
                      <Typography variant="caption">
                        {field.name} [{field.type}]{field.required ? ' *' : ''}
                        {field.validations?.length ? ` — ${field.validations.join(', ')}` : ''}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </AccordionDetails>
        </Accordion>
      )}

      {/* Flows */}
      {model.flows.length > 0 && (
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <FlowIcon fontSize="small" />
              <Typography variant="subtitle2">Navigation Flows ({model.flows.length})</Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {model.flows.slice(0, 10).map((flow, i) => (
                <Box component="li" key={i}>
                  <Typography variant="caption">{flow.name}</Typography>
                </Box>
              ))}
              {model.flows.length > 10 && (
                <Typography variant="caption" color="text.secondary">
                  … and {model.flows.length - 10} more
                </Typography>
              )}
            </Box>
          </AccordionDetails>
        </Accordion>
      )}
    </Box>
  );
}
