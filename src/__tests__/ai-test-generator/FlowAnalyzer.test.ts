// ─── FlowAnalyzer unit tests (Phase 4 M6) ─────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { FlowAnalyzer }  from '@/services/aiTestGenerator/FlowAnalyzer';
import type { ProjectModel, Screen } from '@/services/aiTestGenerator/types';

const analyzer = new FlowAnalyzer();

function makeModel(screens: Screen[]): ProjectModel {
  return {
    projectType:        'android',
    screens,
    apis:               [],
    flows:              [],
    forms:              [],
    sourceFiles:        [],
    analysisConfidence: 0.8,
  };
}

function makeScreen(name: string, targets: string[]): Screen {
  return {
    name,
    type:       'activity',
    elements:   [],
    navigation: targets.map(t => ({ targetScreen: t, trigger: 'button click' })),
  };
}

// ── Basic flow extraction ──────────────────────────────────────────────────────
describe('FlowAnalyzer — basic flows', () => {
  it('extracts a single linear flow', () => {
    const model = makeModel([
      makeScreen('Login',     ['Home']),
      makeScreen('Home',      ['Detail']),
      makeScreen('Detail',    []),
    ]);
    const result = analyzer.analyze(model);
    expect(result.flows.length).toBeGreaterThanOrEqual(1);
  });

  it('flow starts from an entry screen (not the target of another)', () => {
    // Need 2+ hops so the BFS records a flow (min path length = 2)
    const model = makeModel([
      makeScreen('Login',     ['Home']),
      makeScreen('Home',      ['Dashboard']),
      makeScreen('Dashboard', []),
    ]);
    const result = analyzer.analyze(model);
    expect(result.flows.length).toBeGreaterThanOrEqual(1);
    expect(result.flows[0].startScreen).toBe('Login');
  });

  it('returns empty flows when no screens', () => {
    const result = analyzer.analyze(makeModel([]));
    expect(result.flows).toEqual([]);
  });
});

// ── Max depth ──────────────────────────────────────────────────────────────────
describe('FlowAnalyzer — depth limit', () => {
  it('does not produce flows deeper than 5 hops', () => {
    const screens: Screen[] = [];
    for (let i = 0; i < 10; i++) {
      screens.push(makeScreen(`Screen${i}`, i < 9 ? [`Screen${i + 1}`] : []));
    }
    const result = analyzer.analyze(makeModel(screens));
    const maxDepth = Math.max(...result.flows.map(f => f.steps.length));
    expect(maxDepth).toBeLessThanOrEqual(5);
  });
});

// ── Cycle handling ─────────────────────────────────────────────────────────────
describe('FlowAnalyzer — cycle handling', () => {
  it('does not infinite-loop on circular navigation', () => {
    const model = makeModel([
      makeScreen('A', ['B']),
      makeScreen('B', ['C']),
      makeScreen('C', ['A']),
    ]);
    // Should complete without hanging
    const result = analyzer.analyze(model);
    expect(result).toBeDefined();
  });
});

// ── Single-screen model ────────────────────────────────────────────────────────
describe('FlowAnalyzer — single screen', () => {
  it('handles a model with one screen that has no navigation', () => {
    const model = makeModel([makeScreen('Solo', [])]);
    const result = analyzer.analyze(model);
    expect(Array.isArray(result.flows)).toBe(true);
  });
});

// ── Result shape ───────────────────────────────────────────────────────────────
describe('FlowAnalyzer — result shape', () => {
  it('result has flows and entryScreens arrays', () => {
    const model = makeModel([makeScreen('Login', ['Home']), makeScreen('Home', [])]);
    const result = analyzer.analyze(model);
    expect(Array.isArray(result.flows)).toBe(true);
    expect(Array.isArray(result.entryPoints)).toBe(true);
  });
});
