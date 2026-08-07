// ─── VersionComparator tests (Phase 4 M9) ────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { VersionComparator } from '../../services/regressionAnalysis/VersionComparator';

const cmp = new VersionComparator();

function classify(path: string) {
  return cmp.classifyFile(path);
}

describe('VersionComparator.classifyFile()', () => {
  // ── Screen layout ──────────────────────────────────────────────────────────
  it('classifies Activity file as screen_layout', () => {
    expect(classify('app/src/main/java/com/example/LoginActivity.kt').category).toBe('screen_layout');
  });

  it('classifies Fragment as screen_layout', () => {
    expect(classify('src/main/java/HomeFragment.java').category).toBe('screen_layout');
  });

  it('classifies .tsx as screen_layout', () => {
    expect(classify('src/screens/ProfileScreen.tsx').category).toBe('screen_layout');
  });

  it('classifies XML layout as screen_layout', () => {
    expect(classify('res/layout/activity_login.xml').category).toBe('screen_layout');
  });

  // ── Navigation ────────────────────────────────────────────────────────────
  it('classifies Navigator file as navigation', () => {
    expect(classify('src/navigation/AppNavigator.tsx').category).toBe('navigation');
  });

  it('classifies nav_graph XML as navigation', () => {
    expect(classify('res/navigation/nav_graph.xml').category).toBe('navigation');
  });

  it('classifies routes file as navigation', () => {
    expect(classify('src/router/routes.ts').category).toBe('navigation');
  });

  // ── Business logic ────────────────────────────────────────────────────────
  it('classifies ViewModel as business_logic', () => {
    expect(classify('src/viewmodels/LoginViewModel.kt').category).toBe('business_logic');
  });

  it('classifies UseCase as business_logic', () => {
    expect(classify('src/domain/usecases/AuthUseCase.kt').category).toBe('business_logic');
  });

  it('classifies Redux store as business_logic', () => {
    expect(classify('src/store/authReducer.ts').category).toBe('business_logic');
  });

  // ── API endpoint ──────────────────────────────────────────────────────────
  it('classifies ApiService as api_endpoint', () => {
    expect(classify('src/network/UserApiService.kt').category).toBe('api_endpoint');
  });

  it('classifies retrofit service as api_endpoint', () => {
    expect(classify('src/api/PaymentRetrofitService.java').category).toBe('api_endpoint');
  });

  // ── Data model ────────────────────────────────────────────────────────────
  it('classifies Repository as data_model', () => {
    expect(classify('src/data/UserRepository.kt').category).toBe('data_model');
  });

  it('classifies DAO as data_model', () => {
    expect(classify('src/db/UserDao.kt').category).toBe('data_model');
  });

  it('classifies Entity as data_model', () => {
    expect(classify('src/db/entities/ProductEntity.kt').category).toBe('data_model');
  });

  // ── Configuration ─────────────────────────────────────────────────────────
  it('classifies build.gradle as configuration', () => {
    expect(classify('build.gradle').category).toBe('configuration');
  });

  it('classifies package.json as configuration', () => {
    expect(classify('package.json').category).toBe('configuration');
  });

  it('classifies strings.xml as configuration', () => {
    expect(classify('res/values/strings.xml').category).toBe('configuration');
  });

  // ── Styling ───────────────────────────────────────────────────────────────
  it('classifies CSS as styling', () => {
    expect(classify('src/styles/global.css').category).toBe('styling');
  });

  it('classifies Theme tsx file as screen_layout (tsx wins over theme heuristic)', () => {
    expect(classify('src/ui/ThemeProvider.tsx').category).toBe('screen_layout');
  });

  // ── Test ──────────────────────────────────────────────────────────────────
  it('classifies test file as test (lowest weight)', () => {
    const result = classify('src/__tests__/LoginTest.kt');
    expect(result.category).toBe('test');
    expect(result.weight).toBeLessThan(0.2);
  });

  it('classifies spec file as test', () => {
    expect(classify('src/login.spec.ts').category).toBe('test');
  });

  // ── Unknown ───────────────────────────────────────────────────────────────
  it('classifies unrecognized extension as unknown', () => {
    expect(classify('assets/icon.png').category).toBe('unknown');
  });

  // ── Weight ordering ───────────────────────────────────────────────────────
  it('business_logic has higher weight than screen_layout', () => {
    const bl = classify('src/LoginViewModel.kt');
    const sl = classify('src/layout/activity_login.xml');
    expect(bl.weight).toBeGreaterThanOrEqual(sl.weight);
  });

  it('test files have lower weight than everything else', () => {
    const test = classify('src/__tests__/LoginTest.kt');
    const api  = classify('src/api/UserApiService.kt');
    expect(test.weight).toBeLessThan(api.weight);
  });
});

describe('VersionComparator.classify() bulk', () => {
  it('classifies all files in a changeset', () => {
    const result = cmp.classify({
      fromVersion: 'v1.0', toVersion: 'v1.1',
      changedFiles: [
        'src/LoginActivity.kt',
        'src/data/UserRepository.kt',
        'src/api/PaymentApi.kt',
        'build.gradle',
      ],
    });
    expect(result.length).toBe(4);
    expect(result.every(f => f.category)).toBe(true);
    expect(result.every(f => f.moduleName)).toBe(true);
  });

  it('summarize() groups files by category', () => {
    const files = cmp.classify({
      fromVersion: 'v1', toVersion: 'v2',
      changedFiles: [
        'src/LoginActivity.kt',
        'src/HomeFragment.kt',
        'src/UserRepository.kt',
        'src/api/Api.kt',
      ],
    });
    const summary = cmp.summarize(files);
    expect(summary.size).toBeGreaterThan(1);
    for (const [_cat, group] of summary) {
      expect(group.length).toBeGreaterThan(0);
    }
  });
});
