// ─── Suggestion Card (Phase 4 M6) ─────────────────────────────────────────────
// Displays one generated test suggestion with accept/reject controls,
// duplicate warning, confidence score, and step preview.

import {
  Box, Card, CardContent, CardActions, Button, Typography, Chip, Stack,
  LinearProgress, Tooltip, Collapse, IconButton,
} from '@mui/material';
import CheckCircleIcon  from '@mui/icons-material/CheckCircle';
import CancelIcon       from '@mui/icons-material/Cancel';
import WarningIcon      from '@mui/icons-material/Warning';
import InfoIcon         from '@mui/icons-material/Info';
import ExpandMoreIcon   from '@mui/icons-material/ExpandMore';
import { useState }     from 'react';
import type { TestSuggestion, TestCategory } from '@/services/aiTestGenerator';

const CATEGORY_COLORS: Record<TestCategory, 'default' | 'primary' | 'secondary' | 'error' | 'warning' | 'success' | 'info'> = {
  smoke:          'success',
  happy_path:     'primary',
  validation:     'info',
  boundary:       'warning',
  negative:       'error',
  permission:     'secondary',
  navigation:     'primary',
  regression:     'warning',
  integration:    'info',
  performance:    'warning',
  api:            'secondary',
  data_validation:'info',
  compatibility:  'default',
};

const CATEGORY_LABELS: Record<TestCategory, string> = {
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

const PRIORITY_COLORS: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  critical: 'error',
  high:     'warning',
  medium:   'info',
  low:      'default',
};

interface Props {
  suggestion: TestSuggestion;
  onAccept:   (id: string) => void;
  onReject:   (id: string) => void;
}

export function SuggestionCard({ suggestion, onAccept, onReject }: Props) {
  const [expanded, setExpanded] = useState(false);

  const { draft, category, confidence, reason, coverageArea,
          isDuplicate, duplicateOf, status } = suggestion;

  const confidencePct = Math.round(confidence * 100);
  const confColor     = confidencePct >= 80 ? 'success' : confidencePct >= 55 ? 'warning' : 'error';

  const isAccepted = status === 'accepted';
  const isRejected = status === 'rejected';

  return (
    <Card
      variant="outlined"
      sx={{
        opacity:    isRejected ? 0.5 : 1,
        borderColor: isAccepted ? 'success.main' : isRejected ? 'text.disabled' : 'divider',
        transition: 'opacity 0.2s, border-color 0.2s',
      }}
    >
      <CardContent sx={{ pb: 0.5 }}>
        {/* Header row */}
        <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap" mb={0.5}>
          <Chip
            label={CATEGORY_LABELS[category]}
            color={CATEGORY_COLORS[category]}
            size="small"
          />
          <Chip
            label={draft.priority}
            color={PRIORITY_COLORS[draft.priority] ?? 'default'}
            size="small"
            variant="outlined"
          />
          {isDuplicate && (
            <Tooltip title={`Similar to existing test: "${duplicateOf}"`}>
              <Chip
                label="Possible duplicate"
                icon={<WarningIcon />}
                color="warning"
                size="small"
                variant="outlined"
              />
            </Tooltip>
          )}
          {isAccepted && <Chip label="Accepted" color="success" size="small" icon={<CheckCircleIcon />} />}
          {isRejected && <Chip label="Rejected" size="small" />}
        </Stack>

        {/* Title */}
        <Typography variant="subtitle2" gutterBottom>{draft.title}</Typography>

        {/* Coverage area + confidence */}
        <Stack direction="row" spacing={1.5} alignItems="center" mb={1}>
          {coverageArea && (
            <Typography variant="caption" color="text.secondary">
              {coverageArea}
            </Typography>
          )}
          <Box flex={1} />
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 120 }}>
            <LinearProgress
              variant="determinate"
              value={confidencePct}
              color={confColor}
              sx={{ flex: 1, height: 6, borderRadius: 3 }}
            />
            <Typography variant="caption" color="text.secondary">{confidencePct}%</Typography>
          </Stack>
        </Stack>

        {/* Description */}
        {draft.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, fontSize: 12 }}>
            {draft.description}
          </Typography>
        )}

        {/* Steps preview */}
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="caption" color="text.secondary">
            {draft.steps.length} steps
          </Typography>
          <IconButton size="small" onClick={() => setExpanded(e => !e)}>
            <ExpandMoreIcon
              fontSize="small"
              sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            />
          </IconButton>
        </Stack>

        <Collapse in={expanded}>
          <Box sx={{ mt: 1, pl: 1, borderLeft: 2, borderColor: 'divider' }}>
            {draft.steps.map(step => (
              <Box key={step.step_number} sx={{ mb: 0.75 }}>
                <Typography variant="caption" fontWeight={600}>
                  {step.step_number}. {step.description}
                </Typography>
                <Typography variant="caption" display="block" color="text.secondary" pl={1.5}>
                  ✓ {step.expected_result}
                </Typography>
              </Box>
            ))}

            {/* Reason */}
            <Box sx={{ mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Stack direction="row" spacing={0.5} alignItems="flex-start">
                <InfoIcon sx={{ fontSize: 14, mt: 0.2, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">{reason}</Typography>
              </Stack>
            </Box>

            {/* Source files */}
            {suggestion.sourceFiles.length > 0 && (
              <Stack direction="row" spacing={0.5} mt={0.75} flexWrap="wrap">
                {suggestion.sourceFiles.map((f, i) => (
                  <Chip key={i} label={f} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                ))}
              </Stack>
            )}
          </Box>
        </Collapse>
      </CardContent>

      <CardActions sx={{ justifyContent: 'flex-end', pt: 0.5 }}>
        <Button
          size="small"
          color="error"
          startIcon={<CancelIcon />}
          onClick={() => onReject(suggestion.id)}
          disabled={isRejected}
        >
          Reject
        </Button>
        <Button
          size="small"
          color="success"
          variant={isAccepted ? 'contained' : 'outlined'}
          startIcon={<CheckCircleIcon />}
          onClick={() => onAccept(suggestion.id)}
          disabled={isAccepted}
        >
          Accept
        </Button>
      </CardActions>
    </Card>
  );
}
