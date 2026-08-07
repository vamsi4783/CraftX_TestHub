// ─── DependencyGraph (Phase 4 M9) ─────────────────────────────────────────────
// Builds a dependency graph from impacted areas + optional ProjectModel flows.
// Propagates impact through the graph: if A is changed and B depends on A,
// B is also marked as impacted.
// Pure deterministic — no network, no DB.

import type { DependencyNode, ImpactedArea } from './RegressionAnalysisTypes';
import type { ProjectModel } from '@/services/aiTestGenerator/types';

const uuidv4 = () => crypto.randomUUID();

export class DependencyGraph {
  build(impactedAreas: ImpactedArea[], projectModel?: ProjectModel): DependencyNode[] {
    const nodes = new Map<string, DependencyNode>();

    // ── Seed nodes from impacted areas ───────────────────────────────────────
    for (const area of impactedAreas) {
      nodes.set(area.id, {
        id:           area.id,
        name:         area.name,
        type:         area.type === 'flow' ? 'screen' : area.type === 'module' ? 'module' : area.type,
        dependencies: [],
        dependents:   [],
        impacted:     area.directChange,
        files:        area.files,
      });
    }

    // ── Enrich with ProjectModel flow edges (if provided) ─────────────────────
    if (projectModel) {
      // Ensure all screens from the model are represented
      for (const screen of projectModel.screens) {
        const existing = this._findByName(nodes, screen.name);
        if (!existing) {
          const id = uuidv4();
          nodes.set(id, {
            id, name: screen.name, type: 'screen',
            dependencies: [], dependents: [], impacted: false,
            files: screen.sourceFile ? [screen.sourceFile] : [],
          });
        }
      }

      // Add edges from navigation
      for (const flow of projectModel.flows) {
        for (const step of flow.steps) {
          const fromNode = this._findByName(nodes, step.from);
          const toNode   = this._findByName(nodes, step.to);
          if (fromNode && toNode && fromNode.id !== toNode.id) {
            if (!fromNode.dependencies.includes(toNode.id)) fromNode.dependencies.push(toNode.id);
            if (!toNode.dependents.includes(fromNode.id))   toNode.dependents.push(fromNode.id);
          }
        }
      }

      // API dependency edges
      for (const api of projectModel.apis) {
        const apiNode = this._findByPath(nodes, api.sourceFile ?? '');
        if (!apiNode) {
          const id = uuidv4();
          nodes.set(id, {
            id, name: `${api.method} ${api.path}`, type: 'api',
            dependencies: [], dependents: [], impacted: false,
            files: api.sourceFile ? [api.sourceFile] : [],
          });
        }
      }
    } else {
      // Without ProjectModel: infer edges from file co-location (same directory)
      this._inferEdgesFromPaths(nodes);
    }

    // ── Propagate impact transitively (BFS) ───────────────────────────────────
    this._propagateImpact(nodes);

    return Array.from(nodes.values());
  }

  private _findByName(nodes: Map<string, DependencyNode>, name: string): DependencyNode | undefined {
    for (const node of nodes.values()) {
      if (node.name.toLowerCase() === name.toLowerCase() ||
          node.name.toLowerCase().includes(name.toLowerCase())) {
        return node;
      }
    }
    return undefined;
  }

  private _findByPath(nodes: Map<string, DependencyNode>, filePath: string): DependencyNode | undefined {
    if (!filePath) return undefined;
    for (const node of nodes.values()) {
      if (node.files.some(f => f === filePath || f.includes(filePath))) return node;
    }
    return undefined;
  }

  private _inferEdgesFromPaths(nodes: Map<string, DependencyNode>): void {
    // Group nodes by their first directory segment
    const byDir = new Map<string, DependencyNode[]>();
    for (const node of nodes.values()) {
      const dir = node.files[0]?.replace(/\\/g, '/').split('/').slice(0, -1).join('/') ?? '';
      if (!dir) continue;
      const group = byDir.get(dir) ?? [];
      group.push(node);
      byDir.set(dir, group);
    }
    // Nodes in the same directory share a dependency relationship
    for (const [, group] of byDir) {
      if (group.length < 2) continue;
      // Make all pairs bidirectionally dependent (lightweight heuristic)
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          if (!group[i].dependencies.includes(group[j].id))
            group[i].dependencies.push(group[j].id);
          if (!group[j].dependents.includes(group[i].id))
            group[j].dependents.push(group[i].id);
        }
      }
    }
  }

  private _propagateImpact(nodes: Map<string, DependencyNode>): void {
    // BFS from all directly impacted nodes outward through dependents
    const queue: string[] = [];
    for (const node of nodes.values()) {
      if (node.impacted) queue.push(node.id);
    }

    const visited = new Set<string>(queue);
    while (queue.length > 0) {
      const id   = queue.shift()!;
      const node = nodes.get(id);
      if (!node) continue;

      for (const depId of node.dependents) {
        if (!visited.has(depId)) {
          const depNode = nodes.get(depId);
          if (depNode) {
            depNode.impacted = true;
            visited.add(depId);
            queue.push(depId);
          }
        }
      }
    }
  }
}
