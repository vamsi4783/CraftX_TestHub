import React from 'react';
import { useProjectIngestionStore } from './projectIngestionStore.js';
import { projectIngestionService } from '../../services/projectIngestion/ProjectIngestionService.js';

const STATUS_LABEL: Record<string, string> = {
  source_connected: 'Connecting…',
  scanning:         'Scanning files…',
  filtering:        'Filtering…',
  analyzing:        'Analyzing…',
  indexing:         'Indexing…',
  understanding:    'Building knowledge…',
  ready:            'Complete',
  failed:           'Failed',
  cancelled:        'Cancelled',
};

export function IngestionProgressPanel() {
  const { progress, isIngesting } = useProjectIngestionStore();

  if (!isIngesting && !progress) return null;

  const pct = progress
    ? progress.filesFound > 0
      ? Math.round((progress.filesIndexed / progress.filesFound) * 100)
      : 0
    : 0;

  const statusLabel = progress ? (STATUS_LABEL[progress.status] ?? progress.status) : 'Starting…';
  const isFinal     = progress?.status === 'ready' || progress?.status === 'failed' || progress?.status === 'cancelled';

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isIngesting && !isFinal && (
            <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
          )}
          {progress?.status === 'ready' && (
            <div className="h-3 w-3 rounded-full bg-green-500" />
          )}
          {(progress?.status === 'failed' || progress?.status === 'cancelled') && (
            <div className="h-3 w-3 rounded-full bg-destructive" />
          )}
          <span className="text-sm font-medium">{statusLabel}</span>
        </div>
        {progress?.cancellable && isIngesting && (
          <button
            onClick={() => projectIngestionService.cancel()}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress bar */}
      {isIngesting && !isFinal && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${Math.max(pct, 5)}%` }}
          />
        </div>
      )}

      {/* Stats */}
      {progress && (
        <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
          <div className="text-center">
            <div className="font-semibold text-foreground">{progress.filesFound}</div>
            <div>Found</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-foreground">{progress.filesFiltered}</div>
            <div>Filtered</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-foreground">{progress.filesIndexed}</div>
            <div>Indexed</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-foreground">{progress.filesAnalyzed}</div>
            <div>Analyzed</div>
          </div>
        </div>
      )}

      {progress?.message && progress.status !== 'ready' && (
        <p className="text-xs text-muted-foreground truncate">{progress.message}</p>
      )}

      {progress?.elapsedMs && progress.elapsedMs > 0 && (
        <p className="text-xs text-muted-foreground">
          {(progress.elapsedMs / 1000).toFixed(1)}s elapsed
        </p>
      )}
    </div>
  );
}
