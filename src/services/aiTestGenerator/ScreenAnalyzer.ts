// ─── Screen Analyzer (Phase 4 M6) ─────────────────────────────────────────────
// Extracts screen/component definitions from raw source code strings.
// Pure static analysis — no AI, no I/O.

import type { Screen, UIElement, NavigationEdge, ProjectType } from './types.js';

// ─── Android patterns ─────────────────────────────────────────────────────────

const ANDROID = {
  activity:       /class\s+(\w+Activity)\s*(?:extends|:)/g,
  fragment:       /class\s+(\w+Fragment)\s*(?:extends|:)/g,
  button:         /(?:Button|MaterialButton|AppCompatButton|FloatingActionButton)(?:\s+\w+\s*=|\s*id\s*=\s*"([^"]+)")/g,
  buttonId:       /android:id="@\+id\/(btn_\w+|button\w+|fab\w+)"/gi,
  editText:       /(?:EditText|TextInputLayout|TextInputEditText)/g,
  editTextId:     /android:id="@\+id\/(et_\w+|edit\w+|input\w+|field\w+)"/gi,
  navigate:       /(?:startActivity|navigate\(|NavController|findNavController)/g,
  intent:         /Intent\s*\(\s*\w+,\s*(\w+Activity)::class/g,
  navGraph:       /<action[^>]+app:destination="@id\/(\w+)"[^>]*\/>/g,
  onClickListener:/setOnClickListener|OnClickListener|onClick/g,
  permission:     /Manifest\.permission\.(\w+)/g,
  api:            /@(GET|POST|PUT|DELETE|PATCH)\s*\(\s*"([^"]+)"\s*\)/g,
};

const REACT = {
  component:  /(?:export\s+(?:default\s+)?function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=]+)\s*=>\s*(?:\{|<))/g,
  route:      /<Route[^>]+path=["']([^"']+)["']/g,
  link:       /<Link[^>]+to=["']([^"']+)["']/g,
  useNavigate:/useNavigate\(\)/g,
  form:       /<form(?:\s[^>]*)?>|useForm\s*\(/g,
  input:      /<input[^>]+(?:name|id)=["']([^"']+)["']/g,
  button:     /<(?:button|Button)\b[^>]*>([^<]+)<\/(?:button|Button)>/g,
  fetch:      /(?:fetch\(|axios\.(get|post|put|delete|patch)\s*\()\s*[`'"](\/[^`'"]+)/g,
  apiQuery:   /(?:useQuery|useMutation|useInfiniteQuery)\s*\(\s*\[["']([^"'\]]+)/g,
  required:   /required[=:{]\s*(?:true|"true")/g,
  validation: /(?:validate|rules|schema|yup|zod)\./g,
};

const FLUTTER = {
  widget:         /class\s+(\w+)\s+extends\s+(?:Stateless|Stateful)Widget/g,
  scaffold:       /Scaffold\s*\(/g,
  route:          /(?:push|pushNamed|pushReplacement)\s*\(\s*context,\s*["']([^"']+)["']/g,
  textField:      /TextField\s*\(/g,
  elevatedButton: /(?:ElevatedButton|TextButton|OutlinedButton|IconButton)\s*\(/g,
  navigatorRoute: /routes:\s*\{[^}]*["']([^"']+)["']\s*:/g,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countMatches(source: string, pattern: RegExp): number {
  const r = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  return (source.match(r) ?? []).length;
}

function extractAll(source: string, pattern: RegExp, group = 1): string[] {
  const r   = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  const out: string[] = [];
  let m;
  while ((m = r.exec(source)) !== null) {
    const v = m[group];
    if (v) out.push(v);
  }
  return out;
}

// ─── ScreenAnalyzer ───────────────────────────────────────────────────────────

export class ScreenAnalyzer {

  analyze(source: string, fileName: string, projectType: ProjectType): Screen[] {
    switch (projectType) {
      case 'android': return this._analyzeAndroid(source, fileName);
      case 'react':   return this._analyzeReact(source, fileName);
      case 'flutter': return this._analyzeFlutter(source, fileName);
      default:        return this._analyzeGeneric(source, fileName);
    }
  }

  // ─── Android ─────────────────────────────────────────────────────────────────

  private _analyzeAndroid(source: string, fileName: string): Screen[] {
    const screens: Screen[] = [];

    // Activities
    for (const name of extractAll(source, ANDROID.activity, 1)) {
      screens.push(this._buildAndroidScreen(name, 'activity', source, fileName));
    }

    // Fragments
    for (const name of extractAll(source, ANDROID.fragment, 1)) {
      screens.push(this._buildAndroidScreen(name, 'fragment', source, fileName));
    }

    return screens;
  }

  private _buildAndroidScreen(name: string, type: 'activity' | 'fragment', source: string, fileName: string): Screen {
    const elements: UIElement[] = [];

    // Buttons
    const buttonIds = extractAll(source, ANDROID.buttonId, 1);
    for (const id of buttonIds) {
      elements.push({ type: 'button', id, label: id.replace(/^(btn_|button|fab)/i, '') });
    }
    if (buttonIds.length === 0 && countMatches(source, ANDROID.button) > 0) {
      elements.push({ type: 'button', label: 'button' });
    }

    // Inputs
    const inputIds = extractAll(source, ANDROID.editTextId, 1);
    for (const id of inputIds) {
      elements.push({ type: 'input', id, label: id.replace(/^(et_|edit|input|field)/i, '') });
    }
    if (inputIds.length === 0 && countMatches(source, ANDROID.editText) > 0) {
      elements.push({ type: 'input', label: 'text input' });
    }

    // Navigation
    const navigation: NavigationEdge[] = extractAll(source, ANDROID.intent, 1)
      .map(target => ({ targetScreen: target, trigger: 'startActivity' }));

    return { name, type, elements, navigation, sourceFile: fileName };
  }

  // ─── React ───────────────────────────────────────────────────────────────────

  private _analyzeReact(source: string, fileName: string): Screen[] {
    const names = extractAll(source, REACT.component, 1)
      .concat(extractAll(source, REACT.component, 2))
      .filter(Boolean)
      .filter(n => /^[A-Z]/.test(n));  // only PascalCase = components

    if (names.length === 0) return [];

    const elements: UIElement[] = [];

    // Buttons
    const buttons = extractAll(source, REACT.button, 1);
    for (const label of buttons) {
      elements.push({ type: 'button', label: label.trim() });
    }

    // Inputs
    const inputs = extractAll(source, REACT.input, 1);
    for (const name of inputs) {
      elements.push({ type: 'input', id: name, label: name });
    }

    // Forms
    if (countMatches(source, REACT.form) > 0) {
      elements.push({ type: 'form', label: 'form' });
    }

    // Navigation
    const navigation: NavigationEdge[] = extractAll(source, REACT.link, 1)
      .map(path => ({ targetScreen: path, trigger: 'Link' }));

    return names.map(name => ({ name, type: 'component' as const, elements, navigation, sourceFile: fileName }));
  }

  // ─── Flutter ─────────────────────────────────────────────────────────────────

  private _analyzeFlutter(source: string, fileName: string): Screen[] {
    const names = extractAll(source, FLUTTER.widget, 1);
    return names.map(name => {
      const elements: UIElement[] = [];
      if (countMatches(source, FLUTTER.textField) > 0)      elements.push({ type: 'input', label: 'text field' });
      if (countMatches(source, FLUTTER.elevatedButton) > 0) elements.push({ type: 'button', label: 'button' });
      const navigation: NavigationEdge[] = extractAll(source, FLUTTER.route, 1)
        .map(r => ({ targetScreen: r, trigger: 'push' }));
      return { name, type: 'view' as const, elements, navigation, sourceFile: fileName };
    });
  }

  // ─── Generic ─────────────────────────────────────────────────────────────────

  private _analyzeGeneric(source: string, fileName: string): Screen[] {
    const baseName = fileName.split('/').pop()?.replace(/\.\w+$/, '') ?? 'Unknown';
    const elements: UIElement[] = [];

    if (/button/i.test(source))  elements.push({ type: 'button' });
    if (/input|field/i.test(source)) elements.push({ type: 'input' });
    if (/form/i.test(source))    elements.push({ type: 'form' });

    return [{ name: baseName, type: 'screen', elements, navigation: [], sourceFile: fileName }];
  }
}
