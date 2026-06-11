/**
 * Visual Code Understanding — interactive HTML export.
 *
 * Generates a single standalone HTML file (d3 loaded from CDN) with:
 * - a force-directed graph of module relationships
 * - heatmap coloring by impact (transitive dependents)
 * - impact analysis on click: highlights every file that (transitively)
 *   depends on the selected module — i.e. what breaks if you change it
 * - search box + top-externals sidebar
 *
 * No server needed: generated locally, opened in the default browser.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { DependencyGraph } from './index.js';
import type { Lang } from '../i18n/index.js';

const LABELS: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Vexi code graph',
    impact: 'Impact analysis',
    impactHint: 'Click a node to see every file that breaks if you change it. Click the background to reset.',
    search: 'Search files…',
    externals: 'Top dependencies',
    nodes: 'modules',
    edges: 'imports',
    affected: 'files affected by',
    heat: 'Heat = how many files depend on it',
  },
  es: {
    title: 'Grafo de código de Vexi',
    impact: 'Análisis de impacto',
    impactHint: 'Haz clic en un nodo para ver qué archivos se rompen si lo cambias. Clic en el fondo para reiniciar.',
    search: 'Buscar archivos…',
    externals: 'Dependencias principales',
    nodes: 'módulos',
    edges: 'imports',
    affected: 'archivos afectados por',
    heat: 'Calor = cuántos archivos dependen de él',
  },
  pt: {
    title: 'Grafo de código do Vexi',
    impact: 'Análise de impacto',
    impactHint: 'Clique em um nó para ver quais arquivos quebram se você alterá-lo. Clique no fundo para reiniciar.',
    search: 'Buscar arquivos…',
    externals: 'Principais dependências',
    nodes: 'módulos',
    edges: 'imports',
    affected: 'arquivos afetados por',
    heat: 'Calor = quantos arquivos dependem dele',
  },
  fr: {
    title: 'Graphe de code Vexi',
    impact: "Analyse d'impact",
    impactHint: 'Cliquez sur un nœud pour voir les fichiers cassés si vous le modifiez. Cliquez sur le fond pour réinitialiser.',
    search: 'Rechercher des fichiers…',
    externals: 'Dépendances principales',
    nodes: 'modules',
    edges: 'imports',
    affected: 'fichiers affectés par',
    heat: 'Chaleur = combien de fichiers en dépendent',
  },
  ar: {
    title: 'مخطط الكود من Vexi',
    impact: 'تحليل الأثر',
    impactHint: 'انقر على عقدة لرؤية الملفات التي ستتأثر إذا غيّرتها. انقر على الخلفية لإعادة التعيين.',
    search: 'ابحث عن الملفات…',
    externals: 'أهم الاعتماديات',
    nodes: 'وحدات',
    edges: 'استيرادات',
    affected: 'ملفات تتأثر بـ',
    heat: 'الحرارة = عدد الملفات التي تعتمد عليها',
  },
};

/** Write the graph HTML file and return its path. */
export async function exportGraphHtml(
  root: string,
  graph: DependencyGraph,
  lang: Lang,
  out?: string,
): Promise<string> {
  const path = out ?? join(root, `vexi-graph-${graph.project.replace(/[^a-z0-9_-]+/gi, '-')}.html`);
  await fs.writeFile(path, buildGraphHtml(graph, lang), 'utf8');
  return path;
}

export function buildGraphHtml(graph: DependencyGraph, lang: Lang): string {
  const L = LABELS[lang];
  const rtl = lang === 'ar';
  const data = JSON.stringify(graph).replaceAll('<', '\\u003c');

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${L.title} — ${escapeHtml(graph.project)}</title>
<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
<style>
  :root { --accent: #2979FF; --bg: #0a0a0f; --panel: #12121a; --text: #e8e8f0; --dim: #8888a0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); overflow: hidden;
         font: 14px/1.5 ui-monospace, 'Cascadia Code', Consolas, monospace; }
  #side { position: fixed; inset-block: 0; inset-inline-start: 0; width: 290px; padding: 18px;
          background: var(--panel); border-inline-end: 1px solid #1e1e2c; overflow-y: auto; z-index: 5; }
  #side h1 { color: var(--accent); font-size: 18px; letter-spacing: 2px; margin: 0; }
  #side .meta { color: var(--dim); font-size: 12px; margin: 4px 0 14px; }
  #side h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--dim); margin: 18px 0 6px; }
  #search { width: 100%; background: var(--bg); color: var(--text); border: 1px solid #2a2a3a;
            border-radius: 8px; padding: 8px 10px; font: inherit; }
  #info { font-size: 12px; color: var(--dim); }
  #impact-result { color: var(--text); font-size: 12px; max-height: 260px; overflow-y: auto; }
  #impact-result .file { padding: 2px 0; color: #ff8a65; direction: ltr; text-align: start; }
  #impact-result .selected { color: var(--accent); font-weight: 700; }
  .ext { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; direction: ltr; }
  .ext b { color: var(--accent); font-weight: 400; }
  svg { display: block; }
  .legend { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dim); margin-top: 6px; }
  .legend .bar { flex: 1; height: 8px; border-radius: 4px;
                 background: linear-gradient(90deg, #2979FF, #ffd54f, #ff5252); }
  footer { position: fixed; bottom: 10px; inset-inline-end: 14px; color: var(--dim); font-size: 12px; z-index: 5; }
  footer code { color: var(--accent); }
</style>
</head>
<body>
<aside id="side">
  <h1>VEXI</h1>
  <div class="meta">${L.title} · ${escapeHtml(graph.project)}<br>
    <span id="counts"></span></div>
  <input id="search" type="search" placeholder="${L.search}">
  <h2>${L.impact}</h2>
  <div id="info">${L.impactHint}</div>
  <div id="impact-result"></div>
  <div class="legend"><span>0</span><div class="bar"></div><span>max</span></div>
  <div class="legend">${L.heat}</div>
  <h2>${L.externals}</h2>
  <div id="externals"></div>
</aside>
<svg id="canvas"></svg>
<footer><code>npm install -g vexi</code> · <a href="https://github.com/Elomami1976/vexi" style="color:var(--dim)">GitHub</a></footer>
<script>
const DATA = ${data};
const L = ${JSON.stringify({ nodes: L.nodes, edges: L.edges, affected: L.affected })};
document.getElementById('counts').textContent =
  DATA.nodes.length + ' ' + L.nodes + ' · ' + DATA.edges.length + ' ' + L.edges;
document.getElementById('externals').innerHTML = DATA.externals
  .map((e) => '<div class="ext"><span>' + esc(e.name) + '</span><b>' + e.count + '</b></div>').join('');

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

const W = innerWidth, H = innerHeight;
const svg = d3.select('#canvas').attr('width', W).attr('height', H);
const g = svg.append('g');
svg.call(d3.zoom().scaleExtent([0.2, 4]).on('zoom', (ev) => g.attr('transform', ev.transform)));

// Reverse adjacency for impact analysis (target → its importers)
const dependents = new Map();
for (const e of DATA.edges) {
  if (!dependents.has(e.target)) dependents.set(e.target, []);
  dependents.get(e.target).push(e.source);
}
function transitiveDependents(id) {
  const visited = new Set(); const queue = [...(dependents.get(id) || [])];
  while (queue.length) { const c = queue.pop(); if (visited.has(c)) continue; visited.add(c); queue.push(...(dependents.get(c) || [])); }
  return visited;
}

const maxImpact = Math.max(1, ...DATA.nodes.map((n) => n.impact));
const heat = d3.scaleLinear().domain([0, maxImpact / 2, maxImpact]).range(['#2979FF', '#ffd54f', '#ff5252']);
const radius = (n) => 5 + Math.min(14, Math.sqrt(n.dependents) * 3);

const nodes = DATA.nodes.map((n) => ({ ...n }));
const links = DATA.edges.map((e) => ({ source: e.source, target: e.target }));

const sim = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links).id((d) => d.id).distance(70).strength(0.4))
  .force('charge', d3.forceManyBody().strength(-180))
  .force('center', d3.forceCenter(W / 2 + 130, H / 2))
  .force('collide', d3.forceCollide().radius((d) => radius(d) + 4));

const link = g.append('g').selectAll('line').data(links).join('line')
  .attr('stroke', '#2a2a3a').attr('stroke-width', 1.1);
const node = g.append('g').selectAll('circle').data(nodes).join('circle')
  .attr('r', radius).attr('fill', (d) => heat(d.impact))
  .attr('stroke', '#0a0a0f').attr('stroke-width', 1.5).style('cursor', 'pointer')
  .call(d3.drag()
    .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
    .on('end', (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
node.append('title').text((d) => d.id + '\\n← ' + d.dependents + ' · → ' + d.deps + ' · impact ' + d.impact);
const label = g.append('g').selectAll('text').data(nodes).join('text')
  .text((d) => d.id.split('/').pop()).attr('font-size', 9).attr('fill', '#8888a0')
  .attr('dx', 10).attr('dy', 3).style('pointer-events', 'none');

sim.on('tick', () => {
  link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
  node.attr('cx', (d) => d.x).attr('cy', (d) => d.y);
  label.attr('x', (d) => d.x).attr('y', (d) => d.y);
});

// ── Impact analysis on click ──
const result = document.getElementById('impact-result');
function select(id) {
  const affected = id ? transitiveDependents(id) : new Set();
  node.attr('opacity', (d) => !id || d.id === id || affected.has(d.id) ? 1 : 0.12)
      .attr('stroke', (d) => d.id === id ? '#fff' : '#0a0a0f');
  label.attr('opacity', (d) => !id || d.id === id || affected.has(d.id) ? 1 : 0.1);
  link.attr('stroke', (l) => id && (l.target.id === id || affected.has(l.target.id)) ? '#ff8a65' : '#2a2a3a');
  result.innerHTML = id
    ? '<div class="selected">' + esc(id) + '</div><div>' + affected.size + ' ' + L.affected + '</div>' +
      [...affected].sort().map((f) => '<div class="file">' + esc(f) + '</div>').join('')
    : '';
}
node.on('click', (ev, d) => { ev.stopPropagation(); select(d.id); });
svg.on('click', () => select(null));

// ── Search ──
document.getElementById('search').addEventListener('input', (ev) => {
  const q = ev.target.value.toLowerCase();
  node.attr('opacity', (d) => !q || d.id.toLowerCase().includes(q) ? 1 : 0.12);
  label.attr('opacity', (d) => !q || d.id.toLowerCase().includes(q) ? 1 : 0.1);
});
</script>
</body>
</html>
`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
