import { Chip } from '@mui/material';
import type { BugSeverity, TcPriority, BugPriority, FeaturePriority } from '@/types';

const SEV: Record<string, { label: string; color: string }> = {
  critical: { label: '🔴 Critical', color: '#7C3AED' },
  high:     { label: '🟠 High',     color: '#EF4444' },
  medium:   { label: '🟡 Medium',   color: '#F59E0B' },
  low:      { label: '🟢 Low',      color: '#10B981' },
  p1:       { label: 'P1',          color: '#7C3AED' },
  p2:       { label: 'P2',          color: '#EF4444' },
  p3:       { label: 'P3',          color: '#F59E0B' },
  p4:       { label: 'P4',          color: '#10B981' },
};

interface Props {
  value: BugSeverity | TcPriority | BugPriority | FeaturePriority | string;
  size?: 'small' | 'medium';
}

export function SeverityChip({ value, size = 'small' }: Props) {
  const cfg = SEV[value] ?? { label: value, color: '#9CA3AF' };
  return (
    <Chip
      label={cfg.label}
      size={size}
      sx={{ bgcolor: `${cfg.color}22`, color: cfg.color, fontWeight: 700, border: `1px solid ${cfg.color}44` }}
    />
  );
}
