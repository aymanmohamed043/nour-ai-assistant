#!/usr/bin/env node
// Clean one exported workflow for publishing (stdin -> stdout). Called by export_workflows.sh.
// - workflow names without environment prefixes:  "DEV · Chat Bot" -> "Chat Bot", "DEMO · Router (Nexora)" -> "Router"
// - the demo company everywhere (Nexora), no internal hostnames, no PROD wording
// - drops the old OpenRouter router code that "Build Prompt" still built but nothing reads anymore
// Company-specific replacements live in scripts/clean_rules.local.json (git-ignored):
//   [["regex", "replacement"], ...]   e.g. [["Old Company Name", "Nexora Digital Solutions"]]
// Usage: node scripts/clean_workflow.mjs < raw.json > clean.json
import { readFileSync, existsSync } from 'node:fs';

const LOCAL_RULES = new URL('./clean_rules.local.json', import.meta.url);

const cleanName = (s) => s.replace(/^(DEV|DEMO|PROD|Nour) · /, '').replace(/ \(Nexora\)$/, '');

const TEXT = [
  ...(existsSync(LOCAL_RULES) ? JSON.parse(readFileSync(LOCAL_RULES, 'utf8')).map(([re, to]) => [new RegExp(re, 'g'), to]) : []),
  [/PROD · /g, ''],
  [/\bPROD\b/g, 'live'],
  [/support\.router_decisions/g, 'support_dev.router_decisions'],
  [/OpenRouter failed \(/g, 'Router failed ('],
  [/Runs the sub-workflow "Nour · Work Advice"/g, 'Runs the sub-workflow "General"'],
  [/Runs the sub-workflow "Nour · ([^"]+)"/g, 'Runs the sub-workflow "$1"'],
  [/Collection built by the FAQ Ingest workflow\./g, 'Qdrant collection hr_faq_bge_m3 (FAQ content is not part of this repo).'],
];

const walk = (v) => {
  if (typeof v === 'string') return TEXT.reduce((s, [re, to]) => s.replace(re, to), v);
  if (Array.isArray(v)) return v.map(walk);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
  return v;
};

// "Build Prompt" used to also build the requests for an OpenRouter router; the Router sub-workflow builds its own now.
function dropOldRouterCode(code) {
  if (!code.includes('ROUTER_MODELS')) return code;
  const cut = (s, from, to) => {
    const a = s.indexOf(from), b = s.indexOf(to, a);
    if (a < 0 || b < 0) throw new Error(`Build Prompt: marker not found (${from.slice(0, 30)})`);
    return s.slice(0, a) + s.slice(b);
  };
  let s = code;
  s = cut(s, '// Builds:', 'const msg = ');
  s = '// Builds:\n' +
    '// 1) prompt         -> HR Agent (today\'s date + full history)\n' +
    '// 2) route_decision -> set HERE (no LLM call) for pure greetings/thanks, to save the free daily quota\n\n' + s;
  s = cut(s, 'const short = ', 'return {');
  s = s.replace(/\n\s*router_body: .*\n/, '\n').replace(/\s*router_body_history: .*\n/, '\n').replace(/\s*router_fallback_text: .*\n/, '\n');
  if (/router_body|OpenRouter|ROUTER_MODELS/.test(s)) throw new Error('Build Prompt: old router code still present');
  return s;
}

// The /start message of the public demo.
const WELCOME = `Hi! 👋 I'm Nour, the HR assistant at Nexora.
I can answer policy questions, show your leave balance, requests and attendance, submit leave or permission requests, and help with the Nexora portal.
What do you need?`;

const wf = walk(JSON.parse(readFileSync(0, 'utf8')));
wf.name = cleanName(wf.name);
for (const n of wf.nodes) {
  if (n.parameters?.workflowId?.cachedResultName) n.parameters.workflowId.cachedResultName = cleanName(n.parameters.workflowId.cachedResultName);
  if (n.name === 'Build Prompt' && n.parameters?.jsCode) n.parameters.jsCode = dropOldRouterCode(n.parameters.jsCode);
  if (n.name === 'Reply Welcome' && n.parameters?.text !== undefined) n.parameters.text = WELCOME;
}
process.stdout.write(JSON.stringify(wf, null, 2) + '\n');
