// ─── Project Analyzer (Phase 4 M6) ────────────────────────────────────────────
// Extracts a ProjectModel from raw source code strings.
// Supports: Android, React/Web, Flutter (interface), Generic.
// Pure static analysis — no AI, no I/O.

import type {
  ProjectType, ProjectModel, APIEndpoint, FormDefinition, FormField,
  Screen, AppFlow,
} from './types.js';
import { ScreenAnalyzer } from './ScreenAnalyzer.js';

// ─── API patterns shared across project types ─────────────────────────────────

const API_PATTERNS = {
  retrofit:  /@(GET|POST|PUT|DELETE|PATCH)\s*\(\s*["']([^"']+)["']\s*\)/gi,
  fetch:     /fetch\s*\(\s*[`'"]((?:https?:\/\/[^`'"]+)?\/[^`'"]+)[`'"]/g,
  axios:     /axios\.(get|post|put|delete|patch)\s*\(\s*[`'"](\/[^`'"]+)[`'"]/g,
  express:   /(?:router|app)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/g,
};

// ─── Form patterns ────────────────────────────────────────────────────────────

const FORM_PATTERNS = {
  reactInput: /<input[^>]+(?:name|id)=["']([^"']+)["'][^>]*(?:type=["']([^"']+)["'])?[^>]*(?:required)?/gi,
  validation: /(?:required|minLength|maxLength|pattern|validate)\s*[:=]\s*(?:true|["'][^"']+["']|\{[^}]+\})/g,
  zodSchema:  /z\.\s*(?:string|number|boolean|email|url)\(\)/g,
  yupSchema:  /yup\.\s*(?:string|number|boolean|email|url)\(\)/g,
};

// ─── ProjectAnalyzer ─────────────────────────────────────────────────────────

export interface SourceFile {
  name:    string;
  content: string;
}

export class ProjectAnalyzer {
  private readonly screenAnalyzer = new ScreenAnalyzer();

  /**
   * Analyze one or more source files and produce a ProjectModel.
   *
   * @param files    Source files to analyze (name + raw content).
   * @param type     Project type hint; 'generic' if unknown.
   * @param projectName Optional project name for the model.
   */
  analyze(files: SourceFile[], type: ProjectType, projectName?: string): ProjectModel {
    const allScreens:  Screen[]         = [];
    const allApis:     APIEndpoint[]    = [];
    const allForms:    FormDefinition[] = [];
    const sourceNames: string[]         = files.map(f => f.name);
    const notes:       string[]         = [];

    for (const file of files) {
      const screens = this.screenAnalyzer.analyze(file.content, file.name, type);
      allScreens.push(...screens);
      allApis.push(...this._extractAPIs(file.content, file.name, type));
      allForms.push(...this._extractForms(file.content, file.name, type));
    }

    const flows = this._extractFlows(allScreens);
    const confidence = this._calcConfidence(allScreens, allApis, allForms, type);

    if (type === 'flutter') {
      notes.push('Flutter: full analysis is interface-only. Screens and navigation were detected but API/form extraction is limited.');
    }

    if (confidence < 0.3) {
      notes.push('Low analysis confidence — little structured code was detected. Generated tests will be generic.');
    }

    return {
      projectType:        type,
      projectName,
      screens:            this._dedupe(allScreens, s => s.name),
      apis:               this._dedupe(allApis,    a => `${a.method}:${a.path}`),
      flows,
      forms:              allForms,
      sourceFiles:        sourceNames,
      analysisConfidence: confidence,
      analysisNotes:      notes.length > 0 ? notes : undefined,
    };
  }

  // ─── API extraction ───────────────────────────────────────────────────────────

  private _extractAPIs(source: string, fileName: string, type: ProjectType): APIEndpoint[] {
    const apis: APIEndpoint[] = [];

    const tryPattern = (pattern: RegExp, methodGroup: number, pathGroup: number) => {
      const r = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      let m;
      while ((m = r.exec(source)) !== null) {
        const method = (m[methodGroup] ?? 'GET').toUpperCase();
        const path   = m[pathGroup] ?? '';
        if (path) apis.push({ method, path, sourceFile: fileName });
      }
    };

    if (type === 'android') tryPattern(API_PATTERNS.retrofit, 1, 2);
    if (type === 'react' || type === 'generic') {
      tryPattern(API_PATTERNS.fetch,   0, 1);
      tryPattern(API_PATTERNS.axios,   1, 2);
      tryPattern(API_PATTERNS.express, 1, 2);
    }

    return apis;
  }

  // ─── Form extraction ──────────────────────────────────────────────────────────

  private _extractForms(source: string, fileName: string, type: ProjectType): FormDefinition[] {
    if (type === 'android') return this._extractAndroidForms(source, fileName);
    if (type === 'react')   return this._extractReactForms(source, fileName);
    return [];
  }

  private _extractAndroidForms(source: string, fileName: string): FormDefinition[] {
    const ids = this._extractAll(source, /android:id="@\+id\/(et_\w+|edit\w+|input\w+|field\w+)"/gi, 1);
    if (ids.length === 0) return [];

    const fields: FormField[] = ids.map(id => ({
      name:     id.replace(/^(et_|edit|input|field)/i, ''),
      type:     /pass|secret/i.test(id) ? 'password' : /email|mail/i.test(id) ? 'email' : 'text',
      required: /required/.test(source),
    }));

    return [{ name: 'Form', fields, sourceFile: fileName }];
  }

  private _extractReactForms(source: string, fileName: string): FormDefinition[] {
    const hasForm = /(?:<form|useForm|react-hook-form)/i.test(source);
    if (!hasForm) return [];

    const r      = new RegExp(FORM_PATTERNS.reactInput.source, FORM_PATTERNS.reactInput.flags);
    const fields: FormField[] = [];
    let m;
    while ((m = r.exec(source)) !== null) {
      fields.push({
        name:     m[1] ?? 'field',
        type:     m[2] ?? 'text',
        required: /required/.test(m[0]),
        validations: this._extractValidations(m[0]),
      });
    }

    if (fields.length === 0) return [];
    const baseName = fileName.split('/').pop()?.replace(/\.\w+$/, '') ?? 'Form';
    return [{ name: `${baseName} Form`, fields, sourceFile: fileName }];
  }

  private _extractValidations(snippet: string): string[] {
    const out: string[] = [];
    if (/required/.test(snippet))  out.push('required');
    if (/minLength/.test(snippet)) out.push('minLength');
    if (/maxLength/.test(snippet)) out.push('maxLength');
    if (/pattern/.test(snippet))   out.push('pattern');
    if (/email/.test(snippet))     out.push('email format');
    return out;
  }

  // ─── Flow extraction from screens ────────────────────────────────────────────

  private _extractFlows(screens: Screen[]): AppFlow[] {
    const flows: AppFlow[] = [];
    const screenMap = new Map(screens.map(s => [s.name, s]));

    for (const screen of screens) {
      for (const edge of screen.navigation) {
        const target = screenMap.get(edge.targetScreen);
        if (!target) continue;

        flows.push({
          name:        `${screen.name} → ${edge.targetScreen}`,
          startScreen: screen.name,
          endScreen:   edge.targetScreen,
          steps:       [{ from: screen.name, to: edge.targetScreen, trigger: edge.trigger }],
        });
      }
    }

    return flows;
  }

  // ─── Confidence scoring ───────────────────────────────────────────────────────

  private _calcConfidence(
    screens: Screen[], apis: APIEndpoint[], forms: FormDefinition[], type: ProjectType,
  ): number {
    let score = 0;
    if (screens.length > 0)                              score += 0.4;
    if (screens.some(s => s.elements.length > 0))        score += 0.2;
    if (apis.length > 0)                                 score += 0.2;
    if (forms.length > 0)                                score += 0.1;
    if (screens.some(s => s.navigation.length > 0))      score += 0.1;
    if (type === 'flutter' && screens.length > 0)        score = Math.min(score, 0.6);
    return Math.min(parseFloat(score.toFixed(2)), 1.0);
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────

  private _extractAll(source: string, pattern: RegExp, group: number): string[] {
    const r   = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    const out: string[] = [];
    let m;
    while ((m = r.exec(source)) !== null) {
      if (m[group]) out.push(m[group]);
    }
    return out;
  }

  private _dedupe<T>(items: T[], key: (item: T) => string): T[] {
    const seen = new Set<string>();
    return items.filter(item => {
      const k = key(item);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
}
