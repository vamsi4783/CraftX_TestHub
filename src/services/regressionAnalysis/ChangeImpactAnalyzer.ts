// ─── ChangeImpactAnalyzer (Phase 4 M9) ───────────────────────────────────────
// Converts classified files into typed ImpactedArea records.
// Pure deterministic — no network, no DB.

import type { ClassifiedFile, ImpactedArea } from './RegressionAnalysisTypes';

const uuidv4 = () => crypto.randomUUID();

// Category → area type mapping
function areaType(category: ClassifiedFile['category']): ImpactedArea['type'] {
  switch (category) {
    case 'screen_layout':  return 'screen';
    case 'api_endpoint':   return 'api';
    case 'navigation':     return 'flow';
    default:               return 'module';
  }
}

// Infer a human-readable area name from a file's module name
function areaName(file: ClassifiedFile): string {
  return file.moduleName
    .replace(/^.*\//, '')          // last segment
    .replace(/\.(tsx?|jsx?|kt|swift|xml|dart)$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2') // CamelCase → words
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    || file.path.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
}

export class ChangeImpactAnalyzer {
  analyze(files: ClassifiedFile[]): ImpactedArea[] {
    // Skip test files — they don't represent product impact
    const productFiles = files.filter(f => f.category !== 'test' && f.category !== 'infrastructure');

    // Group by moduleName to avoid duplicates
    const byModule = new Map<string, ClassifiedFile[]>();
    for (const f of productFiles) {
      const key = `${f.category}::${f.moduleName}`;
      const existing = byModule.get(key) ?? [];
      existing.push(f);
      byModule.set(key, existing);
    }

    const areas: ImpactedArea[] = [];
    for (const [, group] of byModule) {
      const representative = group[0];
      // Aggregate weight: multiple files in same module = higher impact (capped)
      const aggregatedWeight = Math.min(1, representative.weight * (1 + (group.length - 1) * 0.1));

      areas.push({
        id:           uuidv4(),
        name:         areaName(representative),
        type:         areaType(representative.category),
        files:        group.map(f => f.path),
        category:     representative.category,
        directChange: true,
        riskFactor:   aggregatedWeight,
      });
    }

    // Sort: screens first, then APIs, then flows, then modules; within each by risk desc
    const ORDER: Record<ImpactedArea['type'], number> = { screen: 0, api: 1, flow: 2, module: 3 };
    return areas.sort((a, b) =>
      ORDER[a.type] !== ORDER[b.type]
        ? ORDER[a.type] - ORDER[b.type]
        : b.riskFactor - a.riskFactor,
    );
  }
}
