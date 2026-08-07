// ─── VersionComparator (Phase 4 M9) ──────────────────────────────────────────
// Classifies changed files into impact categories using path heuristics.
// Pure deterministic — no network, no DB.

import type { ChangeCategory, ClassifiedFile, ChangeSet } from './RegressionAnalysisTypes';

interface Rule {
  category: ChangeCategory;
  weight:   number;  // 0-1: how impactful this file type is
  patterns: RegExp[];
}

const RULES: Rule[] = [
  {
    category: 'test',
    weight:   0.05,
    patterns: [/test/i, /spec/i, /mock/i, /__tests__/, /\.test\.[tj]sx?$/, /\.spec\.[tj]sx?$/],
  },
  {
    category: 'styling',
    weight:   0.1,
    patterns: [/\.css$/, /\.scss$/, /\.less$/, /theme/i, /style/i, /colors\./i, /typography\./i, /dimens\.xml$/],
  },
  {
    category: 'configuration',
    weight:   0.15,
    patterns: [/config/i, /\.env/, /build\.gradle/, /settings\.gradle/, /pom\.xml/,
               /package\.json$/, /tsconfig/, /\.yaml$/, /\.yml$/, /Constants\.[jt]s/,
               /BuildConfig/, /strings\.xml$/, /gradle\.properties$/],
  },
  {
    category: 'infrastructure',
    weight:   0.2,
    patterns: [/infrastructure/i, /ci\//i, /\.github\//i, /Dockerfile/, /docker-compose/,
               /deploy/i, /pipeline/i, /workflow/i],
  },
  {
    category: 'data_model',
    weight:   0.55,
    patterns: [/Repository/i, /Dao\./, /database/i, /Database\./i, /Entity\./i,
               /Model\./, /schema/i, /migration/i, /DataStore/i, /Room/i,
               /\.graphql$/, /\.proto$/, /swagger/i, /openapi/i],
  },
  {
    category: 'api_endpoint',
    weight:   0.65,
    patterns: [/Api\./, /ApiService/i, /RetrofitService/i, /Endpoint/i,
               /routes\./, /router\./, /api\//i, /service\//i, /network/i,
               /RestClient/i, /HttpClient/i, /interceptor/i, /retrofit/i, /axios/i],
  },
  {
    category: 'navigation',
    weight:   0.7,
    patterns: [/Navigator\./, /Navigation\./, /Router\./, /routes\./,
               /NavGraph/, /nav_graph/, /deeplink/i, /AppNavigation/i, /BottomNav/i,
               /TabNavigator/i, /StackNavigator/i, /Routing/i],
  },
  {
    category: 'business_logic',
    weight:   0.75,
    patterns: [/ViewModel\./, /UseCase\./, /Interactor\./, /Manager\./, /Helper\./,
               /Presenter\./, /Controller\./, /store\./, /Store\./, /reducer/i,
               /saga/i, /effect/i, /middleware/i, /domain\//i, /usecases\//i],
  },
  {
    category: 'screen_layout',
    weight:   0.6,
    patterns: [/layout\//i, /res\/layout/, /\/layout\/.*\.xml$/, /\.xib$/, /\.storyboard$/,
               /Fragment\./, /Screen\./, /View\./, /Page\./, /Activity\./,
               /Component\./, /\.tsx$/, /\.jsx$/, /\.vue$/,
               /widget\//i, /composable\//i, /screen\//i, /view\//i],
  },
];

function extractModuleName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  // Try to get the meaningful segment (skip src, main, java, kotlin, lib, etc.)
  const SKIP = new Set(['src', 'main', 'java', 'kotlin', 'swift', 'lib', 'app',
                        'com', 'org', 'net', 'test', 'androidTest', 'commonTest']);
  const significant = parts.filter(p => p && !SKIP.has(p));
  if (significant.length === 0) return filePath;
  // Use the last directory before the file as module name
  const fileName = significant[significant.length - 1];
  const dir      = significant.length > 1 ? significant[significant.length - 2] : '';
  // Strip extension for readability
  const baseName = fileName.replace(/\.[^.]+$/, '');
  return dir ? `${dir}/${baseName}` : baseName;
}

export class VersionComparator {
  classify(changeSet: ChangeSet): ClassifiedFile[] {
    return changeSet.changedFiles.map(path => this.classifyFile(path));
  }

  classifyFile(path: string): ClassifiedFile {
    const normalized = path.replace(/\\/g, '/').toLowerCase();

    // Evaluate all rules, pick highest weight that matches
    let best: Rule | null = null;
    for (const rule of RULES) {
      if (rule.patterns.some(p => p.test(normalized) || p.test(path))) {
        if (!best || rule.weight > best.weight) best = rule;
      }
    }

    return {
      path,
      category:   best?.category ?? 'unknown',
      moduleName: extractModuleName(path),
      weight:     best?.weight   ?? 0.3,
    };
  }

  /** Group classified files by category with counts */
  summarize(files: ClassifiedFile[]): Map<ChangeCategory, ClassifiedFile[]> {
    const map = new Map<ChangeCategory, ClassifiedFile[]>();
    for (const f of files) {
      const existing = map.get(f.category) ?? [];
      existing.push(f);
      map.set(f.category, existing);
    }
    return map;
  }
}
