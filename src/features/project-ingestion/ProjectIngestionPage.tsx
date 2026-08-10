import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Button, Typography, Alert, CircularProgress, MenuItem,
  FormControl, InputLabel, Select,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useProjectIngestionStore } from './projectIngestionStore.js';
import { IngestionProgressPanel } from './IngestionProgressPanel.js';
import { SourceStatusCard } from './SourceStatusCard.js';
import { ProjectIntelligencePanel } from './ProjectIntelligencePanel.js';
import { AddSourceDialog, type AddSourceData } from './AddSourceDialog.js';
import { projectIngestionService } from '../../services/projectIngestion/ProjectIngestionService.js';
import { projectService } from '../../services/projectService.js';
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
import type { Project } from '../../types/index.js';

export function ProjectIngestionPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const {
    sources, setSources, addSource: _addSource, removeSource,
    progress, setProgress, setIngesting, isIngesting,
    knowledge, setKnowledge,
    selectedSourceId, selectSource,
  } = useProjectIngestionStore();

  const [showAddDialog, setShowAddDialog]       = useState(false);
  const [projectName, setProjectName]           = useState('Project');
  const [loadError, setLoadError]               = useState('');
  const [ingestionDone, setIngestionDone]       = useState(false);

  // For the project-picker when no projectId in URL
  const [projects, setProjects]                 = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading]   = useState(false);
  const [selectedId, setSelectedId]             = useState('');

  const id = projectId ?? '';
  const mySources   = sources[id] ?? [];
  const myKnowledge = knowledge[id];

  // Load project list when no id provided
  useEffect(() => {
    if (id) return;
    setProjectsLoading(true);
    projectService.list().then(p => {
      setProjects(p);
      setProjectsLoading(false);
    }).catch(() => setProjectsLoading(false));
  }, [id]);

  // Load sources + knowledge when id is known
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

  // Fetch project name
  useEffect(() => {
    if (!id) return;
    projectService.get(id).then(p => setProjectName(p.name)).catch(() => {});
  }, [id]);

  // Project picker — navigate to scoped URL
  if (!id) {
    return (
      <Box maxWidth={480} mx="auto" mt={8} px={3}>
        <Typography variant="h5" fontWeight={700} mb={1}>Project Intelligence</Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          Select a project to index its source code and enable AI-powered test generation.
        </Typography>
        {projectsLoading ? (
          <CircularProgress size={24} />
        ) : (
          <>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Select project</InputLabel>
              <Select
                label="Select project"
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
              >
                {projects.map(p => (
                  <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              disabled={!selectedId}
              onClick={() => navigate(`/project-intelligence/${selectedId}`)}
              fullWidth
            >
              Open Project Intelligence
            </Button>
          </>
        )}
      </Box>
    );
  }

  const handleAddSource = async (kind: ProjectSourceKind, data: AddSourceData) => {
    setShowAddDialog(false);
    setIngesting(true);
    setIngestionDone(false);

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

    const srcs = await getProjectSources(id).catch(() => mySources);
    setSources(id, srcs);

    if (result.status === 'ready') {
      const k = await getProjectKnowledge(id).catch(() => null);
      if (k) setKnowledge(id, k);
      setIngestionDone(true);
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
    const src = mySources.find(s => s.id === sourceId);
    if (src?.kind === 'github' && src.remote_url) {
      const parsed = parseGitHubUrl(src.remote_url);
      if (parsed) {
        const provider = new GitHubProjectSourceProvider(parsed.owner, parsed.repo, src.branch ?? 'HEAD');
        setIngesting(true);
        setIngestionDone(false);
        projectIngestionService.ingest(id, projectName, provider, {}, p => setProgress(p))
          .then(() => getProjectSources(id))
          .then(srcs => { setSources(id, srcs); setIngesting(false); setIngestionDone(true); })
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
          <h1 className="text-2xl font-bold">Project Intelligence — {projectName}</h1>
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

      {/* Post-ingestion CTA */}
      {ingestionDone && (
        <Box
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            p: 2, borderRadius: 2, border: '1px solid',
            bgcolor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.4)',
          }}
        >
          <Box>
            <Typography variant="subtitle2" fontWeight={700} color="success.main">
              Project indexed successfully
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Project intelligence is ready. Generate AI test cases for {projectName}.
            </Typography>
          </Box>
          <Button
            variant="contained"
            color="success"
            startIcon={<AutoAwesomeIcon />}
            onClick={() => navigate(`/ai-test-generator?project=${id}`)}
            sx={{ flexShrink: 0, ml: 2 }}
          >
            Generate AI Tests
          </Button>
        </Box>
      )}

      <IngestionProgressPanel />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
