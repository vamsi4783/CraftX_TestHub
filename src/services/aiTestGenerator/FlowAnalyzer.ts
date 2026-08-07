// ─── Flow Analyzer (Phase 4 M6) ───────────────────────────────────────────────
// Derives multi-step navigation flows from a ProjectModel.
// Pure transform — no AI, no I/O.

import type { ProjectModel, AppFlow, Screen } from './types.js';

export interface FlowAnalysisResult {
  /** All detected navigation flows including multi-hop paths. */
  flows:         AppFlow[];
  /** All entry-point screens (no inbound navigation edges). */
  entryPoints:   string[];
  /** All terminal screens (no outbound navigation edges). */
  terminalScreens: string[];
  /** Screens with no navigation edges at all. */
  isolatedScreens: string[];
}

export class FlowAnalyzer {

  analyze(model: ProjectModel): FlowAnalysisResult {
    const { screens } = model;
    if (screens.length === 0) {
      return { flows: model.flows, entryPoints: [], terminalScreens: [], isolatedScreens: [] };
    }

    const inbound  = new Map<string, number>();
    const outbound = new Map<string, number>();

    for (const screen of screens) {
      outbound.set(screen.name, screen.navigation.length);
      if (!inbound.has(screen.name)) inbound.set(screen.name, 0);
      for (const edge of screen.navigation) {
        inbound.set(edge.targetScreen, (inbound.get(edge.targetScreen) ?? 0) + 1);
      }
    }

    const entryPoints    = screens.filter(s => (inbound.get(s.name) ?? 0) === 0 && (outbound.get(s.name) ?? 0) > 0).map(s => s.name);
    const terminalScreens = screens.filter(s => (outbound.get(s.name) ?? 0) === 0 && (inbound.get(s.name) ?? 0) > 0).map(s => s.name);
    const isolatedScreens = screens.filter(s => (inbound.get(s.name) ?? 0) === 0 && (outbound.get(s.name) ?? 0) === 0).map(s => s.name);

    // Derive multi-hop flows using BFS from each entry point (max depth 5)
    const multiHop = this._deriveMultiHopFlows(screens, entryPoints);

    // Merge with model flows (from direct nav edge extraction)
    const merged = this._mergeFlows([...model.flows, ...multiHop]);

    return { flows: merged, entryPoints, terminalScreens, isolatedScreens };
  }

  // ─── Private ──────────────────────────────────────────────────────────────────

  private _deriveMultiHopFlows(screens: Screen[], entryPoints: string[]): AppFlow[] {
    const screenMap = new Map(screens.map(s => [s.name, s]));
    const flows:     AppFlow[] = [];

    const starts = entryPoints.length > 0 ? entryPoints : screens.slice(0, 3).map(s => s.name);

    for (const start of starts) {
      this._bfs(start, screenMap, flows, [], 0, 5);
    }

    return flows;
  }

  private _bfs(
    currentName: string,
    screenMap:   Map<string, Screen>,
    flows:       AppFlow[],
    path:        Array<{ from: string; to: string; trigger: string }>,
    depth:       number,
    maxDepth:    number,
  ): void {
    if (depth >= maxDepth) return;

    const screen = screenMap.get(currentName);
    if (!screen || screen.navigation.length === 0) {
      // Terminal — record the path as a flow if multi-hop
      if (path.length >= 2) {
        flows.push({
          name:        path.map(s => s.from).join(' → ') + ' → ' + path[path.length - 1].to,
          startScreen: path[0].from,
          endScreen:   path[path.length - 1].to,
          steps:       [...path],
        });
      }
      return;
    }

    for (const edge of screen.navigation) {
      // Avoid cycles
      if (path.some(p => p.from === edge.targetScreen)) continue;

      const step = { from: currentName, to: edge.targetScreen, trigger: edge.trigger };
      this._bfs(edge.targetScreen, screenMap, flows, [...path, step], depth + 1, maxDepth);
    }
  }

  private _mergeFlows(flows: AppFlow[]): AppFlow[] {
    const seen = new Set<string>();
    return flows.filter(f => {
      const key = f.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
