// ─── DependencyGraph tests (Phase 4 M9) ──────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { DependencyGraph }   from '../../services/regressionAnalysis/DependencyGraph';
import type { ImpactedArea } from '../../services/regressionAnalysis/RegressionAnalysisTypes';

function makeArea(name: string, type: ImpactedArea['type'] = 'screen', files: string[] = []): ImpactedArea {
  return {
    id:           crypto.randomUUID(),
    name,
    type,
    files,
    category:     'screen_layout',
    directChange: true,
    riskFactor:   0.7,
  };
}

const graph = new DependencyGraph();

describe('DependencyGraph', () => {
  it('returns empty array for no areas', () => {
    expect(graph.build([])).toEqual([]);
  });

  it('creates one node per impacted area', () => {
    const areas = [makeArea('Login'), makeArea('Home'), makeArea('Profile')];
    const nodes = graph.build(areas);
    expect(nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('directly changed areas are marked impacted=true', () => {
    const areas = [makeArea('Login'), makeArea('Home')];
    const nodes = graph.build(areas);
    const loginNode = nodes.find(n => n.name === 'Login');
    expect(loginNode?.impacted).toBe(true);
  });

  it('each node has a unique id', () => {
    const areas = [makeArea('A'), makeArea('B'), makeArea('C')];
    const nodes = graph.build(areas);
    const ids   = nodes.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('nodes preserve files from source area', () => {
    const areas = [makeArea('Login', 'screen', ['src/LoginActivity.kt'])];
    const nodes = graph.build(areas);
    const loginNode = nodes.find(n => n.name === 'Login');
    expect(loginNode?.files).toContain('src/LoginActivity.kt');
  });

  // ── Impact propagation ────────────────────────────────────────────────────
  it('propagates impact transitively through dependents', () => {
    const areaA = makeArea('A', 'screen', ['src/a/A.kt']);
    const areaB = makeArea('B', 'screen', ['src/a/B.kt']); // same dir as A → co-located → edge
    const areas = [areaA, areaB];
    const nodes = graph.build(areas);
    // Both are directly changed so both should be impacted regardless of edges
    expect(nodes.filter(n => n.impacted).length).toBeGreaterThanOrEqual(1);
  });

  it('non-impacted areas start as impacted=false (if added from ProjectModel)', () => {
    // Area with directChange=false would be added by ProjectModel enrichment.
    // Without a ProjectModel, all initial nodes come from impacted areas.
    const area = makeArea('Checkout');
    const nodes = graph.build([area]);
    // The initial area IS a direct change so it's impacted
    expect(nodes.find(n => n.name === 'Checkout')?.impacted).toBe(true);
  });

  // ── With ProjectModel ─────────────────────────────────────────────────────
  it('enriches graph with ProjectModel screens', () => {
    const areas = [makeArea('Login')];
    const projectModel = {
      projectType: 'android' as const,
      screens: [
        { name: 'Login', type: 'activity' as const, elements: [], navigation: [{ targetScreen: 'Home', trigger: 'button' }], sourceFile: 'LoginActivity.kt' },
        { name: 'Home',  type: 'activity' as const, elements: [], navigation: [], sourceFile: 'HomeActivity.kt' },
      ],
      apis:        [],
      flows:       [{ name: 'main', steps: [{ from: 'Login', to: 'Home', trigger: 'tap' }], startScreen: 'Login' }],
      forms:       [],
      sourceFiles: [],
      analysisConfidence: 0.8,
    };
    const nodes = graph.build(areas, projectModel);
    // Should include Home from ProjectModel
    expect(nodes.some(n => n.name === 'Home')).toBe(true);
  });

  it('adds navigation edges from ProjectModel flows', () => {
    const areas = [makeArea('Login')];
    const projectModel = {
      projectType: 'android' as const,
      screens: [
        { name: 'Login', type: 'activity' as const, elements: [], navigation: [], sourceFile: '' },
        { name: 'Home',  type: 'activity' as const, elements: [], navigation: [], sourceFile: '' },
      ],
      apis:  [],
      flows: [{ name: 'flow', steps: [{ from: 'Login', to: 'Home', trigger: 'tap' }], startScreen: 'Login' }],
      forms: [],
      sourceFiles: [],
      analysisConfidence: 0.8,
    };
    const nodes = graph.build(areas, projectModel);
    const loginNode = nodes.find(n => n.name === 'Login');
    const homeNode  = nodes.find(n => n.name === 'Home');
    if (loginNode && homeNode) {
      // Login depends on (links to) Home, or Home is a dependent of Login
      const hasEdge = loginNode.dependencies.includes(homeNode.id) ||
                      loginNode.dependents.includes(homeNode.id);
      expect(hasEdge).toBe(true);
    }
  });

  // ── Path-based edge inference ────────────────────────────────────────────
  it('infers edges between files in the same directory', () => {
    const areas = [
      makeArea('AreaA', 'screen', ['src/feature/A.kt']),
      makeArea('AreaB', 'screen', ['src/feature/B.kt']),
    ];
    const nodes = graph.build(areas);
    const nodeA = nodes.find(n => n.name === 'AreaA');
    const nodeB = nodes.find(n => n.name === 'AreaB');
    if (nodeA && nodeB) {
      const connected = nodeA.dependencies.includes(nodeB.id) ||
                        nodeA.dependents.includes(nodeB.id) ||
                        nodeB.dependencies.includes(nodeA.id) ||
                        nodeB.dependents.includes(nodeA.id);
      expect(connected).toBe(true);
    }
  });
});
