import React from 'react';
import type { ProjectSourceRecord } from '../../services/projectIngestion/types.js';

const KIND_LABEL: Record<string, string> = {
  zip:          '📦 ZIP',
  local_folder: '📁 Local Folder',
  github:       '🐙 GitHub',
  google_drive: '📎 Google Drive',
  onedrive:     '☁️ OneDrive',
};

const STATUS_COLOR: Record<string, string> = {
  ready:            'text-green-600 dark:text-green-400',
  failed:           'text-red-600 dark:text-red-400',
  cancelled:        'text-yellow-600 dark:text-yellow-400',
  never:            'text-muted-foreground',
  scanning:         'text-blue-500',
  indexing:         'text-blue-500',
  understanding:    'text-blue-500',
  source_connected: 'text-blue-500',
  filtering:        'text-blue-500',
  analyzing:        'text-blue-500',
  reindex_required: 'text-yellow-600 dark:text-yellow-400',
  stale:            'text-yellow-600 dark:text-yellow-400',
};

interface Props {
  source:       ProjectSourceRecord;
  onReindex?:   () => void;
  onRemove?:    () => void;
  isSelected?:  boolean;
  onSelect?:    () => void;
}

export function SourceStatusCard({ source, onReindex, onRemove, isSelected, onSelect }: Props) {
  const kindLabel   = KIND_LABEL[source.kind] ?? source.kind;
  const statusColor = STATUS_COLOR[source.status] ?? 'text-muted-foreground';
  const isActive    = ['scanning', 'filtering', 'analyzing', 'indexing', 'understanding', 'source_connected'].includes(source.status);

  return (
    <div
      onClick={onSelect}
      className={`rounded-lg border p-3 cursor-pointer transition-colors ${
        isSelected ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm">{kindLabel}</span>
            {isActive && <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />}
          </div>
          <p className="text-sm font-medium truncate">{source.display_name}</p>
          {source.remote_url && (
            <p className="text-xs text-muted-foreground truncate">{source.remote_url}</p>
          )}
        </div>
        <span className={`text-xs font-medium capitalize shrink-0 ${statusColor}`}>
          {source.status.replace(/_/g, ' ')}
        </span>
      </div>

      {source.status === 'ready' && (
        <div className="mt-2 grid grid-cols-3 gap-1 text-xs text-muted-foreground">
          <span>{source.indexed_files ?? 0} indexed</span>
          <span>{source.ignored_files ?? 0} ignored</span>
          <span>{source.sensitive_files ?? 0} sensitive</span>
        </div>
      )}

      {source.error_message && (
        <p className="mt-1 text-xs text-red-500 truncate" title={source.error_message}>
          {source.error_message}
        </p>
      )}

      {source.last_indexed_at && source.status === 'ready' && (
        <p className="mt-1 text-xs text-muted-foreground">
          Indexed {new Date(source.last_indexed_at).toLocaleDateString()}
        </p>
      )}

      <div className="mt-2 flex gap-2">
        {(source.status === 'ready' || source.status === 'failed' || source.status === 'reindex_required') && onReindex && (
          <button
            onClick={e => { e.stopPropagation(); onReindex(); }}
            className="text-xs text-primary hover:underline"
          >
            Re-index
          </button>
        )}
        {onRemove && (
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className="text-xs text-destructive hover:underline"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
