// ─── M10: projectIngestionStore — Zustand store for ingestion state ───────────
import { create } from 'zustand';
import type { IngestionProgress, ProjectSourceRecord, ProjectKnowledge } from '../../services/projectIngestion/types.js';

interface IngestionState {
  // Per-project source records
  sources:         Record<string, ProjectSourceRecord[]>;  // keyed by projectId
  // Active ingestion progress
  progress:        IngestionProgress | null;
  isIngesting:     boolean;
  // Loaded knowledge
  knowledge:       Record<string, ProjectKnowledge>;       // keyed by projectId
  // UI state
  selectedSourceId: string | null;

  // Actions
  setSources:       (projectId: string, sources: ProjectSourceRecord[]) => void;
  addSource:        (projectId: string, source: ProjectSourceRecord) => void;
  removeSource:     (projectId: string, sourceId: string) => void;
  setProgress:      (progress: IngestionProgress | null) => void;
  setIngesting:     (v: boolean) => void;
  setKnowledge:     (projectId: string, knowledge: ProjectKnowledge) => void;
  clearKnowledge:   (projectId: string) => void;
  selectSource:     (sourceId: string | null) => void;
}

export const useProjectIngestionStore = create<IngestionState>((set) => ({
  sources:          {},
  progress:         null,
  isIngesting:      false,
  knowledge:        {},
  selectedSourceId: null,

  setSources: (projectId, sources) =>
    set(s => ({ sources: { ...s.sources, [projectId]: sources } })),

  addSource: (projectId, source) =>
    set(s => ({
      sources: {
        ...s.sources,
        [projectId]: [...(s.sources[projectId] ?? []), source],
      },
    })),

  removeSource: (projectId, sourceId) =>
    set(s => ({
      sources: {
        ...s.sources,
        [projectId]: (s.sources[projectId] ?? []).filter(src => src.id !== sourceId),
      },
    })),

  setProgress:  (progress)  => set({ progress }),
  setIngesting: (v)         => set({ isIngesting: v }),

  setKnowledge: (projectId, knowledge) =>
    set(s => ({ knowledge: { ...s.knowledge, [projectId]: knowledge } })),

  clearKnowledge: (projectId) =>
    set(s => {
      const next = { ...s.knowledge };
      delete next[projectId];
      return { knowledge: next };
    }),

  selectSource: (selectedSourceId) => set({ selectedSourceId }),
}));
