#!/usr/bin/env node
// Render every workflows/*.json into a clean SVG diagram in docs/workflows/.
// The layout is computed from the connections (left to right), not from the n8n canvas positions.
// Usage: node scripts/render_workflows.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';

const IN_DIR = 'workflows';
const OUT_DIR = 'docs/workflows';

// file name → output slug and display title
const SLUGS = {
  'Chat_Bot.json': ['chat-bot', 'Chat Bot (main)'],
  'Router.json': ['router', 'Router'],
  'Policy_RAG.json': ['policy-rag', 'Policy RAG'],
  'HR_Data_Agent.json': ['hr-data-agent', 'HR Data Agent'],
  'FAQ.json': ['faq', 'FAQ'],
  'General.json': ['general', 'General'],
  'Onboarding.json': ['onboarding', 'Onboarding'],
};

const KINDS = {
  trigger:  { color: '#ea580c', label: 'Trigger' },
  telegram: { color: '#229ed9', label: 'Telegram' },
  code:     { color: '#d97706', label: 'Code' },
  logic:    { color: '#16a34a', label: 'If / Switch' },
  db:       { color: '#336791', label: 'PostgreSQL' },
  http:     { color: '#7c3aed', label: 'HTTP (Gemini API)' },
  agent:    { color: '#db2777', label: 'AI Agent / Chain' },
  llm:      { color: '#2563eb', label: 'Chat model' },
  vector:   { color: '#dc2626', label: 'Qdrant' },
  embed:    { color: '#0d9488', label: 'Embeddings (Ollama)' },
  sub:      { color: '#475569', label: 'Sub-workflow' },
  noop:     { color: '#94a3b8', label: 'Stop' },
};

function classify(type) {
  const t = type.replace(/^@?n8n\//, '');
  if (/Trigger$/.test(t)) return ['trigger', t.includes('telegram') ? 'TG' : 'IN'];
  if (t.endsWith('.telegram')) return ['telegram', 'TG'];
  if (t.endsWith('.code')) return ['code', '{ }'];
  if (t.endsWith('.if')) return ['logic', 'IF'];
  if (t.endsWith('.switch')) return ['logic', 'SW'];
  if (/postgres/i.test(t)) return ['db', 'SQL'];
  if (t.endsWith('.httpRequest')) return ['http', 'API'];
  if (/\.agent$|chainLlm/.test(t)) return ['agent', 'AI'];
  if (/lmChat/.test(t)) return ['llm', 'LLM'];
  if (/vectorStore/.test(t)) return ['vector', 'VEC'];
  if (/embeddings/.test(t)) return ['embed', 'EMB'];
  if (t.endsWith('.executeWorkflow')) return ['sub', 'SUB'];
  if (t.endsWith('.noOp')) return ['noop', '—'];
  return ['noop', '•'];
}

const AI_KIND_LABEL = { ai_languageModel: 'Model', ai_memory: 'Memory', ai_tool: 'Tools', ai_embedding: 'Embedding' };
const AI_ORDER = ['ai_languageModel', 'ai_memory', 'ai_tool', 'ai_embedding'];

const FONT = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const textW = (s, size = 12) => s.length * size * 0.58;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function wrap(label, max = 18, maxLines = 3) {
  const words = label.replace(/_/g, '_​').split(/[ ​]/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const joiner = cur && !cur.endsWith('_') ? ' ' : '';
    if (cur && (cur + joiner + w).length > max) { lines.push(cur); cur = w; }
    else cur += joiner + w;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] += '…'; }
  return lines;
}

function render(wf, title) {
  const nodes = wf.nodes.filter((n) => !n.type.includes('stickyNote'));
  const byName = new Map(nodes.map((n) => [n.name, n]));

  // edges
  const main = [];
  const ai = [];
  for (const [src, types] of Object.entries(wf.connections || {})) {
    for (const [ctype, outputs] of Object.entries(types)) {
      outputs.forEach((targets, out) => (targets || []).forEach((t) => {
        if (!byName.has(src) || !byName.has(t.node)) return;
        (ctype === 'main' ? main : ai).push({ s: src, t: t.node, out, kind: ctype });
      }));
    }
  }
  const subOf = new Map(); // sub-node name → parent name
  for (const e of ai) if (!main.some((m) => m.s === e.s)) subOf.set(e.s, e.t);

  // node geometry
  const info = new Map();
  for (const n of nodes) {
    const [kind, glyph] = classify(n.type);
    const aiIn = AI_ORDER.filter((k) => ai.some((e) => e.t === n.name && e.kind === k));
    const outs = Math.max(
      ...main.filter((e) => e.s === n.name).map((e) => e.out + 1), 1,
      n.type.endsWith('.if') ? 2 : 1,
      n.type.endsWith('.switch') ? (n.parameters?.rules?.values?.length || 1) : 1,
      n.onError === 'continueErrorOutput' ? 2 : 1,
    );
    const wide = aiIn.length > 0;
    const isSub = subOf.has(n.name);
    const w = wide ? Math.max(180, 90 * aiIn.length) : 64;
    const h = isSub ? 56 : Math.max(64, outs * 26 + 10);
    const lines = wide ? wrap(n.name, 16, 2) : wrap(n.name);
    info.set(n.name, { n, kind, glyph, aiIn, outs, wide, isSub, w, h, lines, x: 0, y: 0 });
  }

  const portLabel = (name, out) => {
    const { n, outs } = info.get(name);
    if (n.type.endsWith('.if')) return out === 0 ? 'true' : 'false';
    if (n.type.endsWith('.switch')) return n.parameters?.rules?.values?.[out]?.outputKey || `${out}`;
    if (n.onError === 'continueErrorOutput') return out === outs - 1 ? 'error' : '';
    return outs > 1 ? `${out}` : '';
  };
  const portY = (name, out) => {
    const i = info.get(name);
    return i.y - i.h / 2 + (i.h * (out + 1)) / (i.outs + 1);
  };

  // layers (longest path, back edges ignored)
  const mainNodes = nodes.filter((n) => !subOf.has(n.name)).map((n) => n.name);
  const preds = new Map(mainNodes.map((m) => [m, []]));
  const succs = new Map(mainNodes.map((m) => [m, []]));
  const back = new Set();
  {
    const state = new Map();
    const order = [...mainNodes].sort((a, b) => byName.get(a).position[0] - byName.get(b).position[0]);
    const visit = (u) => {
      state.set(u, 1);
      for (const e of main.filter((e) => e.s === u)) {
        if (state.get(e.t) === 1) { back.add(e); continue; }
        if (!state.has(e.t)) visit(e.t);
      }
      state.set(u, 2);
    };
    const roots = order.filter((m) => !main.some((e) => e.t === m));
    for (const r of [...roots, ...order]) if (!state.has(r)) visit(r);
  }
  for (const e of main) if (!back.has(e)) { preds.get(e.t).push(e); succs.get(e.s).push(e); }
  const layer = new Map();
  const depth = (m) => {
    if (layer.has(m)) return layer.get(m);
    layer.set(m, 0);
    const d = Math.max(0, ...preds.get(m).map((e) => depth(e.s) + 1));
    layer.set(m, d);
    return d;
  };
  mainNodes.forEach(depth);
  const layers = [];
  for (const m of mainNodes) (layers[layer.get(m)] ||= []).push(m);

  // vertical extents (label and sub-node block hang below the node)
  const below = (m) => {
    const i = info.get(m);
    const label = i.wide ? 22 : 10 + i.lines.length * 15;
    return i.h / 2 + label + (i.aiIn.length ? 190 : 0);
  };
  const above = (m) => info.get(m).h / 2;

  // y placement: follow predecessors, then push apart
  layers.forEach((ms, L) => {
    const desired = new Map(ms.map((m) => {
      const ps = preds.get(m);
      if (L === 0 || !ps.length) return [m, byName.get(m).position[1]];
      return [m, ps.reduce((a, e) => a + portY(e.s, e.out), 0) / ps.length];
    }));
    ms.sort((a, b) => desired.get(a) - desired.get(b) || byName.get(a).position[1] - byName.get(b).position[1]);
    if (L === 0) { let y = 0; ms.forEach((m, k) => { if (k) y += below(ms[k - 1]) + above(m) + 36; info.get(m).y = y; }); return; }
    let prev = null;
    for (const m of ms) {
      let y = desired.get(m);
      if (prev) y = Math.max(y, info.get(prev).y + below(prev) + above(m) + 36);
      info.get(m).y = y;
      prev = m;
    }
    const shift = ms.reduce((a, m) => a + desired.get(m) - info.get(m).y, 0) / ms.length;
    if (shift < 0) ms.forEach((m) => (info.get(m).y += shift));
  });

  // x placement: room for the widest node and output labels of each layer
  let x = 0;
  layers.forEach((ms, L) => {
    const half = Math.max(...ms.map((m) => info.get(m).w / 2));
    if (L) x += half;
    ms.forEach((m) => (info.get(m).x = x));
    const labelW = Math.max(0, ...ms.flatMap((m) => succs.get(m).map((e) => textW(portLabel(e.s, e.out), 10) + 14)));
    const nameW = Math.max(...ms.map((m) => (info.get(m).wide ? 0 : Math.max(...info.get(m).lines.map((l) => textW(l))) / 2 - info.get(m).w / 2)));
    x += half + 90 + Math.max(labelW, nameW);
  });

  // sub-nodes under their parent, grouped by connection kind
  for (const [parent, i] of info) {
    if (!i.aiIn.length) continue;
    const subs = AI_ORDER.flatMap((k) => ai.filter((e) => e.t === parent && e.kind === k && subOf.get(e.s) === parent)
      .sort((a, b) => byName.get(a.s).position[0] - byName.get(b.s).position[0]));
    const gap = 124;
    subs.forEach((e, k) => {
      const s = info.get(e.s);
      s.x = i.x + (k - (subs.length - 1) / 2) * gap;
      s.y = i.y + i.h / 2 + 130;
    });
  }

  // drawing
  const parts = [];
  const edgeParts = [];
  const labelParts = [];
  const channels = [];

  for (const e of main) {
    const a = info.get(e.s), b = info.get(e.t);
    const sx = a.x + a.w / 2, sy = portY(e.s, e.out);
    const tx = b.x - b.w / 2, ty = b.y;
    // nodes between source and target that a direct curve would cross
    const lo = Math.min(sy, ty) - 12, hi = Math.max(sy, ty) + 12;
    const blockers = mainNodes.map((m) => info.get(m)).filter((o) =>
      o !== a && o !== b && o.x - o.w / 2 > sx && o.x + o.w / 2 < tx &&
      o.y - o.h / 2 < hi && o.y + o.h / 2 + 10 + o.lines.length * 15 > lo);
    let d;
    if (blockers.length) {
      const x1 = Math.min(...blockers.map((o) => o.x - o.w / 2)) - 24;
      const x2 = Math.max(...blockers.map((o) => o.x + o.w / 2)) + 24;
      const top = Math.min(...blockers.map((o) => o.y - o.h / 2)) - 22;
      const bottom = Math.max(...blockers.map((o) => o.y + o.h / 2 + (o.wide ? 22 : 10 + o.lines.length * 15))) + 14;
      const cy = Math.abs(top - (sy + ty) / 2) < Math.abs(bottom - (sy + ty) / 2) ? top : bottom;
      channels.push(cy);
      const k1 = Math.max(20, (x1 - sx) / 2), k2 = Math.max(20, (tx - x2) / 2);
      d = `M${sx},${sy} C${sx + k1},${sy} ${x1 - k1},${cy} ${x1},${cy} L${x2},${cy} C${x2 + k2},${cy} ${tx - k2},${ty} ${tx - 6},${ty}`;
    } else if (tx > sx + 10) {
      const dx = Math.max(40, (tx - sx) / 2);
      d = `M${sx},${sy} C${sx + dx},${sy} ${tx - dx},${ty} ${tx - 6},${ty}`;
    } else {
      const low = Math.max(a.y + below(e.s), b.y + below(e.t)) + 30;
      d = `M${sx},${sy} C${sx + 60},${sy} ${sx + 60},${low} ${sx},${low} L${tx},${low} C${tx - 60},${low} ${tx - 60},${ty} ${tx - 6},${ty}`;
    }
    const lbl = portLabel(e.s, e.out);
    const err = lbl === 'error';
    edgeParts.push(`<path d="${d}" class="edge${err ? ' err' : ''}" marker-end="url(#arrow${err ? 'Err' : ''})"/>`);
    if (lbl && !labelParts.some((p) => p.includes(`data-k="${esc(e.s)}#${e.out}"`))) {
      const w = textW(lbl, 10) + 10;
      labelParts.push(`<g data-k="${esc(e.s)}#${e.out}"><rect x="${sx + 6}" y="${sy - 8}" width="${w}" height="16" rx="8" class="pill${err ? ' err' : ''}"/>` +
        `<text x="${sx + 6 + w / 2}" y="${sy + 3.5}" class="pilltxt${err ? ' err' : ''}">${esc(lbl)}</text></g>`);
    }
  }

  for (const [parent, i] of info) {
    i.aiIn.forEach((k, idx) => {
      const ax = i.x - i.w / 2 + (i.w * (idx + 1)) / (i.aiIn.length + 1);
      const ay = i.y + i.h / 2;
      labelParts.push(`<path d="M${ax},${ay - 5} l5,5 l-5,5 l-5,-5 z" class="diamond"/>` +
        `<text x="${ax}" y="${ay + 22}" class="ailbl">${AI_KIND_LABEL[k] || k}</text>`);
      for (const e of ai.filter((e) => e.t === parent && e.kind === k)) {
        const s = info.get(e.s);
        const sy = s.y - s.h / 2;
        edgeParts.push(`<path d="M${s.x},${sy} C${s.x},${sy - 45} ${ax},${ay + 70} ${ax},${ay + 28}" class="edge ai"/>`);
      }
    });
  }

  for (const [, i] of info) {
    const { color } = KINDS[i.kind];
    const { x, y, w, h } = i;
    let shape;
    if (i.isSub) shape = `<circle cx="${x}" cy="${y}" r="${h / 2}" class="node" style="--c:${color}"/>`;
    else if (i.kind === 'trigger') shape = `<path d="M${x + w / 2 - 10},${y - h / 2} h10 v${h} h-10 H${x} a${h / 2},${h / 2} 0 0 1 0,${-h} z" class="node" style="--c:${color}"/>`;
    else shape = `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="10" class="node" style="--c:${color}"/>`;
    if (i.wide) {
      const gx = x - w / 2 + 30;
      parts.push(`<g>${shape}<text x="${gx}" y="${y + 5}" class="glyph" fill="${color}">${esc(i.glyph)}</text>` +
        i.lines.map((l, k) => `<text x="${gx + 26}" y="${y + 5 + (k - (i.lines.length - 1) / 2) * 15}" class="name in">${esc(l)}</text>`).join('') + '</g>');
    } else {
      parts.push(`<g>${shape}<text x="${x}" y="${y + 5}" class="glyph" fill="${color}">${esc(i.glyph)}</text>` +
        i.lines.map((l, k) => `<text x="${x}" y="${y + h / 2 + 18 + k * 15}" class="name">${esc(l)}</text>`).join('') + '</g>');
    }
  }

  // bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [m, i] of info) {
    const lw = i.wide ? 0 : Math.max(...i.lines.map((l) => textW(l))) / 2;
    minX = Math.min(minX, i.x - Math.max(i.w / 2, lw));
    maxX = Math.max(maxX, i.x + Math.max(i.w / 2, lw));
    minY = Math.min(minY, i.y - i.h / 2);
    maxY = Math.max(maxY, i.y + (i.isSub ? i.h / 2 + 10 + i.lines.length * 15 : below(m) - (i.aiIn.length ? 190 : 0)));
  }
  for (const e of main) {
    const a = info.get(e.s), b = info.get(e.t);
    if (b.x - b.w / 2 <= a.x + a.w / 2 + 10) maxY = Math.max(maxY, Math.max(a.y + below(e.s), b.y + below(e.t)) + 40);
  }
  for (const cy of channels) { minY = Math.min(minY, cy - 6); maxY = Math.max(maxY, cy + 6); }
  const pad = 40, head = 78;
  const kindsUsed = [...new Set([...info.values()].map((i) => i.kind))];
  const legendW = kindsUsed.reduce((a, k) => a + textW(KINDS[k].label, 11) + 34, 0);
  const W = Math.ceil(Math.max(maxX - minX + pad * 2, legendW + pad * 2, 560));
  const H = Math.ceil(maxY - minY + pad * 2 + head + 40);
  const ox = pad - minX + (W - (maxX - minX + pad * 2)) / 2, oy = pad + head - minY;

  const counts = `${nodes.length} nodes` +
    (subOf.size ? ` · ${subOf.size} AI sub-nodes` : '') +
    ` · ${main.length + ai.length} connections`;
  let lx = pad;
  const legend = kindsUsed.map((k) => {
    const g = `<rect x="${lx}" y="${H - 34}" width="12" height="12" rx="3" fill="${KINDS[k].color}"/><text x="${lx + 18}" y="${H - 24}" class="legend">${esc(KINDS[k].label)}</text>`;
    lx += textW(KINDS[k].label, 11) + 34;
    return g;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<title>${esc(title)} — n8n workflow</title>
<defs>
  <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#d9dee5"/></pattern>
  <marker id="arrow" viewBox="0 0 10 10" refX="4" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#8b95a5"/></marker>
  <marker id="arrowErr" viewBox="0 0 10 10" refX="4" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#e11d48"/></marker>
  <style>
    .edge{fill:none;stroke:#8b95a5;stroke-width:1.6}
    .edge.err{stroke:#e11d48;stroke-dasharray:5 4}
    .edge.ai{stroke:#a3abb8;stroke-dasharray:4 4}
    .node{fill:#fff;stroke:var(--c);stroke-width:2;filter:drop-shadow(0 1px 2px rgba(15,23,42,.12))}
    .glyph{font-size:15px;font-weight:700;text-anchor:middle}
    .name{font-size:12px;fill:#1f2937;text-anchor:middle}
    .name.in{text-anchor:start;font-weight:600}
    .pill{fill:#eef1f5;stroke:#cdd3dc}
    .pill.err{fill:#fff1f3;stroke:#fda4af}
    .pilltxt{font-size:10px;fill:#475569;text-anchor:middle}
    .pilltxt.err{fill:#be123c}
    .diamond{fill:#fff;stroke:#8b95a5;stroke-width:1.4}
    .ailbl{font-size:10px;fill:#64748b;text-anchor:middle}
    .legend{font-size:11px;fill:#475569}
  </style>
</defs>
<rect width="${W}" height="${H}" rx="14" fill="#f7f8fa"/>
<rect width="${W}" height="${H}" rx="14" fill="url(#dots)"/>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="none" stroke="#e2e6ec"/>
<text x="${pad}" y="44" font-size="20" font-weight="700" fill="#111827">${esc(title)}</text>
<text x="${pad}" y="66" font-size="12" fill="#6b7280">Nour · n8n workflow · ${counts}</text>
<g transform="translate(${ox},${oy})">
${edgeParts.join('\n')}
${parts.join('\n')}
${labelParts.join('\n')}
</g>
${legend}
</svg>
`;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const file of readdirSync(IN_DIR).filter((f) => f.endsWith('.json')).sort()) {
  const wf = JSON.parse(readFileSync(`${IN_DIR}/${file}`, 'utf8'));
  const [slug, title] = SLUGS[file] || [file.replace(/\.json$/, '').toLowerCase(), wf.name];
  writeFileSync(`${OUT_DIR}/${slug}.svg`, render(wf, title));
  console.log(`saved ${OUT_DIR}/${slug}.svg`);
}
