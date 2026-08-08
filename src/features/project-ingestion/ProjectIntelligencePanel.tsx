import React from 'react';
import type { ProjectKnowledge } from '../../services/projectIngestion/types.js';

interface Props {
  knowledge: ProjectKnowledge;
}

export function ProjectIntelligencePanel({ knowledge }: Props) {
  const topModules = knowledge.codeModules.slice(0, 10);
  const topDeps    = knowledge.dependencies.filter(d => d.kind === 'runtime').slice(0, 10);
  const uncovered  = knowledge.codeModules
    .filter(m => knowledge.uncoveredModules.includes(m.id))
    .slice(0, 6);

  return (
    <div className="space-y-4">
      {/* Project summary */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold mb-2">Project Overview</h3>
        <p className="text-sm text-muted-foreground">{knowledge.description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {knowledge.frameworks.map(f => (
            <span key={f} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {f}
            </span>
          ))}
          {knowledge.languages.map(l => (
            <span key={l} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Files',     value: knowledge.indexedFiles },
          { label: 'Modules',   value: knowledge.codeModules.length },
          { label: 'Tests',     value: knowledge.existingTestPaths.length },
          { label: 'Sensitive', value: knowledge.sensitiveFiles },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border bg-card p-3 text-center">
            <div className="text-lg font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {/* Test coverage */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Test Coverage</h3>
          <span className="text-sm font-medium">{Math.round(knowledge.coverageScore * 100)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden mb-3">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${knowledge.coverageScore * 100}%` }}
          />
        </div>
        {uncovered.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground mb-1">Modules without tests:</p>
            <div className="flex flex-wrap gap-1">
              {uncovered.map(m => (
                <span key={m.id} className="rounded bg-muted px-1.5 py-0.5 text-xs text-yellow-600 dark:text-yellow-400">
                  {m.name}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modules */}
      {topModules.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Code Modules</h3>
          <div className="space-y-2">
            {topModules.map(mod => (
              <div key={mod.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs rounded bg-muted px-1.5 py-0.5 shrink-0">{mod.type}</span>
                  <span className="font-medium truncate">{mod.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                  <span>{mod.fileCount} files</span>
                  {mod.testCount > 0 && (
                    <span className="text-green-600 dark:text-green-400">{mod.testCount} tests</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entry points */}
      {knowledge.entryPoints.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Entry Points</h3>
          <div className="space-y-1">
            {knowledge.entryPoints.slice(0, 8).map((ep, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-xs rounded bg-primary/10 text-primary px-1.5 py-0.5 shrink-0">{ep.kind}</span>
                <span className="font-mono text-xs text-muted-foreground truncate">{ep.path}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key dependencies */}
      {topDeps.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Key Dependencies</h3>
          <div className="grid grid-cols-2 gap-1">
            {topDeps.map(d => (
              <div key={d.name} className="flex items-center gap-1 text-xs">
                <span className="font-medium truncate">{d.name}</span>
                <span className="text-muted-foreground shrink-0">{d.version}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Architecture */}
      {knowledge.architectureStyle && (
        <div className="rounded-lg border bg-card p-3 text-sm">
          <span className="text-muted-foreground">Architecture: </span>
          <span className="font-medium">{knowledge.architectureStyle}</span>
          {knowledge.buildSystem && (
            <span className="text-muted-foreground"> · Build: {knowledge.buildSystem}</span>
          )}
        </div>
      )}
    </div>
  );
}
