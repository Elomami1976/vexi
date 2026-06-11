/**
 * Visual Code Understanding — Feature 5, graph builder.
 *
 * Builds a module dependency graph from import/require statements in
 * JS/TS-family source files (plus CSS @import). The graph powers:
 * - relationship visualization (force-directed d3 graph)
 * - impact analysis: which files (transitively) depend on a module —
 *   i.e. what breaks if you change it
 * - a "heat" score per node (number of transitive dependents)
 *
 * Reuses the Phase 2 scanner for the safe file list (.gitignore-aware,
 * node_modules excluded, size caps), so the graph can never explode.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { scanProject, type ProjectMap } from '../scanner/index.js';

/** Only these files are parsed for imports. */
const PARSEABLE = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|css|scss)$/;

/** Candidate suffixes when resolving extensionless relative imports. */
const RESOLVE_SUFFIXES = [
  '', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx',
];

export interface GraphNode {
  id: string; // relative path
  dir: string; // top-level folder (used for coloring)
  /** Direct dependencies (outgoing edges). */
  deps: number;
  /** Direct dependents (incoming edges). */
  dependents: number;
  /** Transitive dependents — the impact score / heatmap value. */
  impact: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface DependencyGraph {
  project: string;
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** External packages used, with import counts (top 20). */
  externals: Array<{ name: string; count: number }>;
}

/** Match import/require/export-from specifiers. */
const IMPORT_RE =
  /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"\n]+)['"]|require\(\s*['"]([^'"\n]+)['"]\s*\)|import\(\s*['"]([^'"\n]+)['"]\s*\)|@import\s+['"]([^'"\n]+)['"]/g;

/** Build the dependency graph for a project (uses the cached-safe scanner). */
export async function buildGraph(root: string, map?: ProjectMap): Promise<DependencyGraph> {
  const project = map ?? (await scanProject(root));
  const files = project.files.filter((f) => PARSEABLE.test(f));
  const fileSet = new Set(files);

  const edges: GraphEdge[] = [];
  const externals = new Map<string, number>();

  for (const file of files) {
    const content = await fs.readFile(join(root, file), 'utf8').catch(() => '');
    if (!content) continue;

    for (const match of content.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2] ?? match[3] ?? match[4];
      if (!spec) continue;

      if (spec.startsWith('.')) {
        const target = resolveRelative(file, spec, fileSet);
        if (target && target !== file) edges.push({ source: file, target });
      } else if (!spec.startsWith('node:')) {
        // External package: count by top-level package name (@scope/pkg or pkg)
        const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
        externals.set(name, (externals.get(name) ?? 0) + 1);
      }
    }
  }

  // Deduplicate edges
  const seen = new Set<string>();
  const uniqueEdges = edges.filter((e) => {
    const key = `${e.source}→${e.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Degrees
  const out = new Map<string, number>();
  const inn = new Map<string, number>();
  const dependentsOf = new Map<string, string[]>(); // target → sources
  for (const e of uniqueEdges) {
    out.set(e.source, (out.get(e.source) ?? 0) + 1);
    inn.set(e.target, (inn.get(e.target) ?? 0) + 1);
    (dependentsOf.get(e.target) ?? dependentsOf.set(e.target, []).get(e.target)!).push(e.source);
  }

  // Impact = number of transitive dependents (BFS up the dependents tree)
  const impact = (id: string): number => {
    const visited = new Set<string>();
    const queue = [...(dependentsOf.get(id) ?? [])];
    while (queue.length) {
      const cur = queue.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      queue.push(...(dependentsOf.get(cur) ?? []));
    }
    return visited.size;
  };

  const nodes: GraphNode[] = files.map((id) => ({
    id,
    dir: id.includes('/') ? id.slice(0, id.indexOf('/')) : '.',
    deps: out.get(id) ?? 0,
    dependents: inn.get(id) ?? 0,
    impact: impact(id),
  }));

  return {
    project: project.name,
    generatedAt: new Date().toISOString(),
    nodes,
    edges: uniqueEdges,
    externals: [...externals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count })),
  };
}

/** Resolve a relative import specifier against the scanned file set. */
function resolveRelative(fromFile: string, spec: string, files: Set<string>): string | null {
  // Normalize `from/dir/../x` style paths manually (always forward slashes)
  const baseDir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : '';
  const parts = (baseDir ? baseDir + '/' + spec : spec).split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    else if (part === '..') stack.pop();
    else stack.push(part);
  }
  const base = stack.join('/');

  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = base + suffix;
    if (files.has(candidate)) return candidate;
    // TS quirk: `./x.js` in source resolves to x.ts on disk
    if (suffix === '' && /\.(js|mjs|cjs)$/.test(candidate)) {
      const tsCandidate = candidate.replace(/\.(m|c)?js$/, '.ts');
      if (files.has(tsCandidate)) return tsCandidate;
    }
  }
  return null;
}
