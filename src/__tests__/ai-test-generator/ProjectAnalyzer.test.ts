// ─── ProjectAnalyzer unit tests (Phase 4 M6) ──────────────────────────────────
import { describe, it, expect } from 'vitest';
import { ProjectAnalyzer } from '@/services/aiTestGenerator/ProjectAnalyzer';

const analyzer = new ProjectAnalyzer();

// ── Android ────────────────────────────────────────────────────────────────────
describe('ProjectAnalyzer — Android', () => {
  // Mix Kotlin + XML-style strings so all three detection paths fire
  const ACTIVITY = `
class LoginActivity : AppCompatActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    android:id="@+id/btn_login"
    android:id="@+id/et_email"
    android:id="@+id/et_password"
    startActivity(Intent(this, DashboardActivity::class.java))
  }
}
`;

  it('detects screens from Activity class names', () => {
    const model = analyzer.analyze([{ name: 'LoginActivity.kt', content: ACTIVITY }], 'android');
    expect(model.screens.length).toBeGreaterThanOrEqual(1);
    expect(model.screens[0].name).toContain('Login');
  });

  it('detects navigation to DashboardActivity', () => {
    const model = analyzer.analyze([{ name: 'LoginActivity.kt', content: ACTIVITY }], 'android');
    const loginScreen = model.screens.find(s => s.name.includes('Login'));
    expect(loginScreen?.navigation.some(n => n.targetScreen.includes('Dashboard'))).toBe(true);
  });

  it('detects input elements', () => {
    const model = analyzer.analyze([{ name: 'LoginActivity.kt', content: ACTIVITY }], 'android');
    const loginScreen = model.screens.find(s => s.name.includes('Login'));
    const inputTypes = loginScreen?.elements.map(e => e.type) ?? [];
    expect(inputTypes).toContain('input');
  });

  it('detects button elements', () => {
    const model = analyzer.analyze([{ name: 'LoginActivity.kt', content: ACTIVITY }], 'android');
    const loginScreen = model.screens.find(s => s.name.includes('Login'));
    const btnTypes = loginScreen?.elements.map(e => e.type) ?? [];
    expect(btnTypes).toContain('button');
  });

  it('sets projectType correctly', () => {
    const model = analyzer.analyze([], 'android');
    expect(model.projectType).toBe('android');
  });

  it('uses provided project name', () => {
    const model = analyzer.analyze([], 'android', 'MyApp');
    expect(model.projectName).toBe('MyApp');
  });
});

// ── React ──────────────────────────────────────────────────────────────────────
describe('ProjectAnalyzer — React', () => {
  const COMPONENT = `
export function LoginPage() {
  return (
    <form onSubmit={handleLogin}>
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required />
      <button type="submit">Login</button>
    </form>
  );
}
`;

  it('detects screens from React component exports', () => {
    const model = analyzer.analyze([{ name: 'LoginPage.tsx', content: COMPONENT }], 'react');
    expect(model.screens.some(s => s.name.includes('Login'))).toBe(true);
  });

  it('detects forms', () => {
    const model = analyzer.analyze([{ name: 'LoginPage.tsx', content: COMPONENT }], 'react');
    expect(model.forms.length).toBeGreaterThanOrEqual(1);
  });

  it('detects named fields', () => {
    const model = analyzer.analyze([{ name: 'LoginPage.tsx', content: COMPONENT }], 'react');
    const allFields = model.forms.flatMap(f => f.fields);
    expect(allFields.some(f => f.name === 'email' || f.name === 'password')).toBe(true);
  });
});

// ── REST API detection ─────────────────────────────────────────────────────────
describe('ProjectAnalyzer — API detection', () => {
  const API_FILE = `
router.get('/users', getUsers);
router.post('/users', createUser);
router.delete('/users/:id', deleteUser);
axios.get('/api/products')
fetch('/api/orders', { method: 'POST' })
`;

  it('detects REST API endpoints', () => {
    const model = analyzer.analyze([{ name: 'routes.ts', content: API_FILE }], 'react');
    expect(model.apis.length).toBeGreaterThanOrEqual(1);
  });

  it('captures HTTP methods', () => {
    const model = analyzer.analyze([{ name: 'routes.ts', content: API_FILE }], 'react');
    const methods = model.apis.map(a => a.method);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
  });
});

// ── Generic ────────────────────────────────────────────────────────────────────
describe('ProjectAnalyzer — Generic', () => {
  it('returns a model with generic type and non-negative confidence', () => {
    const model = analyzer.analyze(
      [{ name: 'main.py', content: 'def login(): pass\ndef register(): pass' }],
      'generic',
    );
    expect(model.projectType).toBe('generic');
    expect(model.analysisConfidence).toBeGreaterThanOrEqual(0);
  });
});

// ── Multi-file ─────────────────────────────────────────────────────────────────
describe('ProjectAnalyzer — multi-file', () => {
  it('aggregates screens from multiple files', () => {
    const files = [
      { name: 'HomeActivity.kt',   content: 'class HomeActivity : AppCompatActivity()' },
      { name: 'SearchActivity.kt', content: 'class SearchActivity : AppCompatActivity()' },
    ];
    const model = analyzer.analyze(files, 'android');
    expect(model.screens.length).toBeGreaterThanOrEqual(2);
  });
});
