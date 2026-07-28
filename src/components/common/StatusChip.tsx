import { Chip } from '@mui/material';
import type { ChipProps } from '@mui/material';
import type { BugStatus, ReleaseStatus, TcStatus, AssignmentStatus, FeatureStatus, ResultStatus } from '@/types';

type AnyStatus = BugStatus | ReleaseStatus | TcStatus | AssignmentStatus | FeatureStatus | ResultStatus | string;

const STATUS_CONFIG: Record<string, { label: string; color: ChipProps['color']; sx?: Record<string, string> }> = {
  // Bug
  new:          { label: 'New',          color: 'error'   },
  triaged:      { label: 'Triaged',      color: 'warning' },
  assigned:     { label: 'Assigned',     color: 'info'    },
  in_progress:  { label: 'In Progress',  color: 'primary' },
  ready_for_qa: { label: 'Ready for QA', color: 'secondary' },
  verified:     { label: 'Verified',     color: 'success' },
  closed:       { label: 'Closed',       color: 'default' },
  rejected:     { label: 'Rejected',     color: 'default' },
  duplicate:    { label: 'Duplicate',    color: 'default' },
  // Release
  planning:     { label: 'Planning',     color: 'default' },
  testing:      { label: 'Testing',      color: 'primary' },
  ready:        { label: 'Ready',        color: 'success' },
  released:     { label: 'Released',     color: 'success' },
  archived:     { label: 'Archived',     color: 'default' },
  // Test case
  draft:        { label: 'Draft',        color: 'default' },
  active:       { label: 'Active',       color: 'success' },
  deprecated:   { label: 'Deprecated',   color: 'default' },
  // Assignment
  pending:      { label: 'Pending',      color: 'warning' },
  completed:    { label: 'Completed',    color: 'success' },
  // Result
  pass:         { label: 'Pass',         color: 'success' },
  fail:         { label: 'Fail',         color: 'error'   },
  blocked:      { label: 'Blocked',      color: 'warning' },
  skipped:      { label: 'Skipped',      color: 'default' },
  not_tested:   { label: 'Not Tested',   color: 'default' },
  // Feature
  submitted:    { label: 'Submitted',    color: 'info'    },
  under_review: { label: 'Under Review', color: 'warning' },
  approved:     { label: 'Approved',     color: 'primary' },
  deferred:     { label: 'Deferred',     color: 'default' },
};

interface Props { status: AnyStatus; size?: 'small' | 'medium' }

export function StatusChip({ status, size = 'small' }: Props) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'default' as ChipProps['color'] };
  return <Chip label={cfg.label} color={cfg.color} size={size} />;
}
