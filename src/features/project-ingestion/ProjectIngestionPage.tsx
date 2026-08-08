import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useProjectIngestionStore } from './projectIngestionStore.js';
import { IngestionProgressPanel } from './IngestionProgressPanel.js';
import { SourceStatusCard } from './SourceStatusCard.js';
import { ProjectIntelligencePanel } from './ProjectIntelligencePanel.js';
import { AddSourceDialog, type AddSourceData } from './AddSourceDialog.js';
import { projectIngestionService } from '../../services/projectIngestion/ProjectIngestionService.js';
import {
  ZipProjectSourceProvider,
  LocalProjectSourceProvider,
  GitHubProjectSourceProvider,
  parseGitHubUrl,
} from '../../services/projectIngestion/providers/index.js';
import {
  getProjectSources,
  deleteProjectSource,
  getProjectKnowledge,
} from '../../services/projectIngestion/projectIngestionDbService.js';
import type { ProjectSourceKind } from '../../services/projectIngestion/types.js';

export function ProjectIngestionPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const {
    sources, setSources, addSource, removeSource,
    progress, setProgress, setIngesting, isIngesting,
    knowledge, setKnowledge,
    selectedSourceId, selectSource,
  } = useProjectIngestionStore();

  const [showAddDialog, setShowAddDialog]   = useState(false);
  const [projectName, setProjectName]       = useState('Project');
  const [loadError, setLoadError]           = useState('');

  const id = projectId ?? '';
  const mySources  = sources[id] ?? [];
  const myKnowledge = knowledge[id];

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const srcs = await getProjectSources(id);
        setSources(id, srcs);
        const k = await getProjectKnowledge(id);
        if (k) setKnowledge(id, k);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [id]);

  const handleAddSource = async (kind: ProjectSourceKind, data: AddSourceData) => {
    setShowAddDialog(false);
    setIngesting(true);

    let provider;
    if (kind === 'zip' && data.zipBytes) {
      provider = new ZipProjectSourceProvider(data.zipBytes, data.fileName ?? 'project.zip');
    } else if (kind === 'local_folder') {
      provider = new LocalProjectSourceProvider();
    } else if (kind === 'github' && data.githubUrl) {
      const parsed = parseGitHubUrl(data.githubUrl)!;
      provider = new GitHubProjectSourceProvider(
        parsed.owner, parsed.repo,
        data.branch ?? parsed.ref ?? 'HEAD',
        data.pat ?? null,
      );
    } else {
      setIngesting(false);
      return;
    }

    const result = await projectIngestionService.ingest(
      id, projectName, provider, {},
      (p) => setProgress(p),
    );

    setIngesting(false);

    // Reload sources
    const srcs = await getProjectSources(id).catch(() => mySources);
    setSources(id, srcs);

    if (result.status === 'ready') {
      const k = await getProjectKnowledge(id).catch(() => null);
      if (k) setKnowledge(id, k);
    }
  };

  const handleRemove = async (sourceId: string) => {
    if (!window.confirm('Remove this source and its index?')) return;
    try {
      await deleteProjectSource(sourceId);
      removeSource(id, sourceId);
    } catch (e) {
      alert(`Failed to remove: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleReindex = (sourceId: string) => {
    // Find the source and re-run ingestion (simplification — would need original provider data)
    const src = mySources.find(s => s.id === sourceId);
    if (src?.kind === 'github' && src.remote_url) {
      const parsed = parseGitHubUrl(src.remote_url);
      if (parsed) {
        const provider = new GitHubProjectSourceProvider(parsed.owner, parsed.repo, src.branch ?? 'HEAD');
        setIngesting(true);
        projectIngestionService.ingest(id, projectName, provider, {}, p => setProgress(p))
          .then(() => getProjectSources(id))
          .then(srcs => { setSources(id, srcs); setIngesting(false); })
          .catch(() => setIngesting(false));
      }
    } else {
      setShowAddDialog(true);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Project Intelligence</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Index your project source to enable AI-powered test generation and analysis.
          </p>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          disabled={isIngesting}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          + Add Source
        </button>
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {loadError}
        </div>
      )}

      <IngestionProgressPanel />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Source list */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Sources</h2>
          {mySources.length === 0 && !isIngesting ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No sources yet.
              <br />
              <button
                onClick={() => setShowAddDialog(true)}
                className="mt-2 text-primary hover:underline"
              >
                Add your first source
              </button>
            </div>
          ) : (
            mySources.map(src => (
              <SourceStatusCard
                key={src.id}
                source={src}
                isSelected={selectedSourceId === src.id}
                onSelect={() => selectSource(src.id)}
                onReindex={() => handleReindex(src.id)}
                onRemove={() => handleRemove(src.id)}
              />
            ))
          )}
        </div>

        {/* Intelligence panel */}
        <div className="md:col-span-2">
          {myKnowledge ? (
            <ProjectIntelligencePanel knowledge={myKnowledge} />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
              <div className="text-center text-sm text-muted-foreground">
                {isIngesting ? 'Generating project intelligence…' : 'Add and index a source to see project intelligence.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {showAddDialog && (
        <AddSourceDialog
          projectId={id}
          onAdd={handleAddSource}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}
