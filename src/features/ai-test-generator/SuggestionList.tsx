// ─── Suggestion List (Phase 4 M6) ─────────────────────────────────────────────
// Renders a filtered / sorted list of TestSuggestions using SuggestionCard.

import {
  Box, Typography, Stack, ToggleButtonGroup, ToggleButton,
  FormControl, InputLabel, Select, MenuItem, Button, Chip, Divider,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon     from '@mui/icons-material/Cancel';
import { useState }   from 'react';
import type { TestSuggestion, TestCategory } from '@/services/aiTestGenerator';
import { SuggestionCard } from './SuggestionCard';

const ALL_CATEGORIES: TestCategory[] = [
  'smoke', 'happy_path', 'validation', 'boundary',
  'negative', 'permission', 'navigation', 'regression',
  'integration', 'performance', 'api', 'data_validation', 'compatibility',
];

type SortKey = 'confidence_desc' | 'confidence_asc' | 'category' | 'priority';

interface Props {
  suggestions:  TestSuggestion[];
  onAccept:     (id: string) => void;
  onReject:     (id: string) => void;
  onAcceptAll:  () => void;
  onRejectAll:  () => void;
}

function sortSuggestions(items: TestSuggestion[], key: SortKey): TestSuggestion[] {
  const copy = [...items];
  const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  switch (key) {
    case 'confidence_desc': return copy.sort((a, b) => b.confidence - a.confidence);
    case 'confidence_asc':  return copy.sort((a, b) => a.confidence - b.confidence);
    case 'category':        return copy.sort((a, b) => a.category.localeCompare(b.category));
    case 'priority':        return copy.sort((a, b) =>
      (PRIORITY_ORDER[a.draft.priority] ?? 9) - (PRIORITY_ORDER[b.draft.priority] ?? 9));
    default: return copy;
  }
}

export function SuggestionList({ suggestions, onAccept, onReject, onAcceptAll, onRejectAll }: Props) {
  const [selectedCategories, setSelectedCategories] = useState<TestCategory[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  const [sort, setSort] = useState<SortKey>('confidence_desc');

  const categoriesPresent = Array.from(new Set(suggestions.map(s => s.category)));

  const filtered = suggestions.filter(s => {
    const catOk    = selectedCategories.length === 0 || selectedCategories.includes(s.category);
    const statusOk = statusFilter === 'all' || s.status === statusFilter;
    return catOk && statusOk;
  });

  const sorted  = sortSuggestions(filtered, sort);
  const pending = suggestions.filter(s => s.status === 'pending').length;
  const accepted = suggestions.filter(s => s.status === 'accepted').length;

  const toggleCategory = (cat: TestCategory) =>
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);

  if (suggestions.length === 0) {
    return (
      <Box textAlign="center" py={4}>
        <Typography color="text.secondary">No suggestions generated yet.</Typography>
      </Box>
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      {/* Summary row */}
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
        <Typography variant="subtitle2">
          {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
        </Typography>
        <Chip label={`${pending} pending`}  size="small" />
        <Chip label={`${accepted} accepted`} color="success" size="small" variant="outlined" />
        <Box flex={1} />
        <Button
          size="small"
          startIcon={<CheckCircleIcon />}
          color="success"
          onClick={onAcceptAll}
          disabled={pending === 0}
        >
          Accept all
        </Button>
        <Button
          size="small"
          startIcon={<CancelIcon />}
          color="error"
          onClick={onRejectAll}
          disabled={pending === 0}
        >
          Reject all
        </Button>
      </Stack>

      <Divider />

      {/* Filters */}
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
        {/* Category chips */}
        <Stack direction="row" spacing={0.5} flexWrap="wrap">
          {categoriesPresent.map(cat => (
            <Chip
              key={cat}
              label={cat.replace('_', ' ')}
              size="small"
              clickable
              variant={selectedCategories.includes(cat) ? 'filled' : 'outlined'}
              onClick={() => toggleCategory(cat)}
            />
          ))}
        </Stack>

        <Box flex={1} />

        {/* Status filter */}
        <ToggleButtonGroup
          value={statusFilter}
          exclusive
          size="small"
          onChange={(_, v) => v && setStatusFilter(v)}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="pending">Pending</ToggleButton>
          <ToggleButton value="accepted">Accepted</ToggleButton>
          <ToggleButton value="rejected">Rejected</ToggleButton>
        </ToggleButtonGroup>

        {/* Sort */}
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel>Sort</InputLabel>
          <Select label="Sort" value={sort} onChange={e => setSort(e.target.value as SortKey)}>
            <MenuItem value="confidence_desc">Confidence ↓</MenuItem>
            <MenuItem value="confidence_asc">Confidence ↑</MenuItem>
            <MenuItem value="category">Category</MenuItem>
            <MenuItem value="priority">Priority</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {/* Cards */}
      {sorted.length === 0 ? (
        <Typography color="text.secondary" variant="body2">No suggestions match the current filters.</Typography>
      ) : (
        <Box display="flex" flexDirection="column" gap={1.5}>
          {sorted.map(s => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              onAccept={onAccept}
              onReject={onReject}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
