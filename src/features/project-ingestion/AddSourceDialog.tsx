import React, { useState, useRef } from 'react';
import type { ProjectSourceKind } from '../../services/projectIngestion/types.js';
import { parseGitHubUrl } from '../../services/projectIngestion/providers/GitHubProjectSourceProvider.js';

interface Props {
  projectId:  string;
  onAdd:      (kind: ProjectSourceKind, data: AddSourceData) => void;
  onClose:    () => void;
}

export interface AddSourceData {
  kind:        ProjectSourceKind;
  zipBytes?:   Uint8Array;
  fileName?:   string;
  githubUrl?:  string;
  pat?:        string;   // held in memory only
  branch?:     string;
}

type Step = 'choose' | 'configure';

const SOURCE_OPTIONS: Array<{ kind: ProjectSourceKind; label: string; description: string; available: boolean }> = [
  { kind: 'zip',          label: '📦 Upload ZIP',    description: 'Upload a .zip archive of your project', available: true },
  { kind: 'local_folder', label: '📁 Local Folder',  description: 'Connect a folder from your computer (Chrome/Edge)', available: true },
  { kind: 'github',       label: '🐙 GitHub Repo',   description: 'Connect a public or private GitHub repository', available: true },
  { kind: 'google_drive', label: '📎 Google Drive',  description: 'Coming soon', available: false },
  { kind: 'onedrive',     label: '☁️ OneDrive',      description: 'Coming soon', available: false },
];

export function AddSourceDialog({ projectId: _projectId, onAdd, onClose }: Props) {
  const [step, setStep]         = useState<Step>('choose');
  const [kind, setKind]         = useState<ProjectSourceKind>('zip');
  const [githubUrl, setGithubUrl] = useState('');
  const [branch, setBranch]     = useState('');
  const [pat, setPat]           = useState('');
  const [error, setError]       = useState('');
  const fileRef                 = useRef<HTMLInputElement>(null);

  const handleChoose = (k: ProjectSourceKind) => {
    setKind(k);
    setStep('configure');
    setError('');
  };

  const handleZipSelect = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Select a ZIP file'); return; }
    if (!file.name.endsWith('.zip')) { setError('File must be a .zip archive'); return; }
    if (file.size > 100_000_000) { setError('ZIP must be under 100 MB'); return; }

    const bytes = new Uint8Array(await file.arrayBuffer());
    onAdd('zip', { kind: 'zip', zipBytes: bytes, fileName: file.name });
  };

  const handleLocalFolder = () => {
    onAdd('local_folder', { kind: 'local_folder' });
  };

  const handleGitHub = () => {
    const parsed = parseGitHubUrl(githubUrl);
    if (!parsed) {
      setError('Enter a valid GitHub URL, e.g. https://github.com/owner/repo');
      return;
    }
    onAdd('github', {
      kind:       'github',
      githubUrl:  githubUrl.trim(),
      branch:     branch.trim() || parsed.ref,
      pat:        pat.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative bg-background rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>

        {step === 'choose' && (
          <>
            <h2 className="text-lg font-semibold mb-4">Add Project Source</h2>
            <div className="space-y-2">
              {SOURCE_OPTIONS.map(opt => (
                <button
                  key={opt.kind}
                  disabled={!opt.available}
                  onClick={() => handleChoose(opt.kind)}
                  className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    opt.available
                      ? 'hover:bg-muted/50 cursor-pointer'
                      : 'opacity-40 cursor-not-allowed'
                  }`}
                >
                  <div>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'configure' && kind === 'zip' && (
          <>
            <h2 className="text-lg font-semibold mb-4">Upload ZIP Archive</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Select a .zip archive of your project (max 100 MB). The file is processed
              entirely in your browser — no upload to TestHub servers.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
            />
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setStep('choose')} className="text-sm text-muted-foreground hover:text-foreground">Back</button>
              <button onClick={handleZipSelect} className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground">
                Index Project
              </button>
            </div>
          </>
        )}

        {step === 'configure' && kind === 'local_folder' && (
          <>
            <h2 className="text-lg font-semibold mb-4">Connect Local Folder</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Your browser will ask you to choose a folder. Files are read directly from
              your disk — nothing is uploaded. Requires Chrome or Edge.
            </p>
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setStep('choose')} className="text-sm text-muted-foreground hover:text-foreground">Back</button>
              <button onClick={handleLocalFolder} className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground">
                Choose Folder…
              </button>
            </div>
          </>
        )}

        {step === 'configure' && kind === 'github' && (
          <>
            <h2 className="text-lg font-semibold mb-4">Connect GitHub Repository</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Repository URL *</label>
                <input
                  type="url"
                  value={githubUrl}
                  onChange={e => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Branch (optional)</label>
                <input
                  type="text"
                  value={branch}
                  onChange={e => setBranch(e.target.value)}
                  placeholder="main"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Personal Access Token (private repos)</label>
                <input
                  type="password"
                  value={pat}
                  onChange={e => setPat(e.target.value)}
                  placeholder="ghp_…"
                  autoComplete="off"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Held in memory only — never stored in TestHub.
                </p>
              </div>
            </div>
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setStep('choose')} className="text-sm text-muted-foreground hover:text-foreground">Back</button>
              <button onClick={handleGitHub} className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground">
                Connect &amp; Index
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
