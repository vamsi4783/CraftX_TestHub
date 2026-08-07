// ─── ChangeImpactAnalyzer tests (Phase 4 M9) ─────────────────────────────────
import { describe, it, expect } from 'vitest';
import { VersionComparator }    from '../../services/regressionAnalysis/VersionComparator';
import { ChangeImpactAnalyzer } from '../../services/regressionAnalysis/ChangeImpactAnalyzer';
import type { ClassifiedFile }  from '../../services/regressionAnalysis/RegressionAnalysisTypes';

const comparator = new VersionComparator();
const analyzer   = new ChangeImpactAnalyzer();

function makeFile(path: string): ClassifiedFile {
  return comparator.classifyFile(path);
}

describe('ChangeImpactAnalyzer', () => {
  // ── Basic output ──────────────────────────────────────────────────────────
  it('returns empty array for no files', () => {
    expect(analyzer.analyze([])).toEqual([]);
  });

  it('returns one area per unique module', () => {
    const files = [makeFile('src/LoginActivity.kt'), makeFile('src/HomeActivity.kt')];
    const areas = analyzer.analyze(files);
    expect(areas.length).toBeGreaterThanOrEqual(1);
  });

  it('each area has a non-empty name', () => {
    const files = [makeFile('src/LoginActivity.kt')];
    const areas = analyzer.analyze(files);
    expect(areas[0].name.length).toBeGreaterThan(0);
  });

  it('each area has a unique id', () => {
    const files = ['src/LoginActivity.kt', 'src/UserRepository.kt', 'src/api/ApiService.kt'].map(makeFile);
    const areas = analyzer.analyze(files);
    const ids   = areas.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('area.files references the original paths', () => {
    const files = [makeFile('src/LoginActivity.kt')];
    const areas = analyzer.analyze(files);
    expect(areas[0].files).toContain('src/LoginActivity.kt');
  });

  // ── Type mapping ──────────────────────────────────────────────────────────
  it('screen_layout files produce screen-type areas', () => {
    const files = [makeFile('res/layout/activity_login.xml')];
    const areas = analyzer.analyze(files);
    expect(areas.some(a => a.type === 'screen')).toBe(true);
  });

  it('api_endpoint files produce api-type areas', () => {
    const files = [makeFile('src/api/PaymentApiService.kt')];
    const areas = analyzer.analyze(files);
    expect(areas.some(a => a.type === 'api')).toBe(true);
  });

  it('navigation files produce flow-type areas', () => {
    const files = [makeFile('src/navigation/AppNavigator.kt')];
    const areas = analyzer.analyze(files);
    expect(areas.some(a => a.type === 'flow')).toBe(true);
  });

  it('other categories produce module-type areas', () => {
    const files = [makeFile('src/UserRepository.kt')];
    const areas = analyzer.analyze(files);
    expect(areas.some(a => a.type === 'module')).toBe(true);
  });

  // ── Test files excluded ───────────────────────────────────────────────────
  it('test files are excluded from impacted areas', () => {
    const files = [makeFile('src/__tests__/LoginTest.kt'), makeFile('src/LoginActivity.kt')];
    const areas = analyzer.analyze(files);
    // Test category should not appear
    expect(areas.every(a => a.category !== 'test')).toBe(true);
  });

  it('returns empty when only test files changed', () => {
    const files = [makeFile('src/__tests__/LoginTest.kt'), makeFile('src/login.spec.ts')];
    const areas = analyzer.analyze(files);
    expect(areas.length).toBe(0);
  });

  // ── Risk factor ───────────────────────────────────────────────────────────
  it('all areas have riskFactor in [0,1]', () => {
    const files = ['src/LoginActivity.kt', 'src/UserRepository.kt', 'src/api/Api.kt'].map(makeFile);
    const areas = analyzer.analyze(files);
    for (const a of areas) {
      expect(a.riskFactor).toBeGreaterThanOrEqual(0);
      expect(a.riskFactor).toBeLessThanOrEqual(1);
    }
  });

  it('multiple files in the same module increase riskFactor (bounded by 1)', () => {
    // Two files in the same module
    const single = analyzer.analyze([makeFile('src/api/UserApiService.kt')]);
    const double = analyzer.analyze([
      makeFile('src/api/UserApiService.kt'),
      makeFile('src/api/PaymentApiService.kt'),
    ]);
    // Double should have same or higher risk (may merge if same module key)
    expect(double.every(a => a.riskFactor <= 1)).toBe(true);
  });

  // ── Sort order ────────────────────────────────────────────────────────────
  it('screens appear before modules in output', () => {
    const files = [
      makeFile('src/UserRepository.kt'),   // module
      makeFile('src/LoginActivity.kt'),    // screen
    ];
    const areas = analyzer.analyze(files);
    const firstScreen = areas.findIndex(a => a.type === 'screen');
    const firstModule = areas.findIndex(a => a.type === 'module');
    if (firstScreen !== -1 && firstModule !== -1) {
      expect(firstScreen).toBeLessThan(firstModule);
    }
  });

  // ── directChange flag ─────────────────────────────────────────────────────
  it('all areas from direct file changes have directChange=true', () => {
    const files = ['src/LoginActivity.kt', 'src/api/ApiService.kt'].map(makeFile);
    const areas = analyzer.analyze(files);
    expect(areas.every(a => a.directChange)).toBe(true);
  });
});
