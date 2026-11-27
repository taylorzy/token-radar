// A working token-radar-01 entry (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// pre-token protocol with the model in lib/model.ts, writes the ranked board to /output/board.json, and
// copies this repository's dashboard/ and screenshots/ to /output. Last, it writes /output/dossier.json,
// the summary the judge reads, with the vendored make.fun library.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html, dashboard/app.css
// and dashboard/app.js read /output/data.js, which this program writes from the same board. A starting
// point, not a winner: it covers the watchlist, states the model and gives every protocol a farm plan.
// Change the model, the page or the plan; keep the gate's shape.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { farmEconomics, farmingSummaries } from './lib/economics.ts';
import { modelIntelligence } from './lib/model-intelligence.ts';
import engine from './dashboard/00-decision.js';
import catalog from './dashboard/01-farming-routes.json' with { type:'json' };
import comparison from './lib/v6-comparison.json' with { type:'json' };
import validation from './dashboard/00-validation.json' with { type:'json' };
import { VERSIONED } from './lib/classification.ts';
import { buildLedger } from './lib/ledger.ts';
import frozenModelReview from './lib/frozen-model-review.json' with { type: 'json' };
import m71Loo from './lib/m71-loo-predictions.json' with { type: 'json' };
import { isComparable } from './lib/valuation.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
const assumptionsFile = arg('farm-assumptions', '');
const assumptions = assumptionsFile ? JSON.parse(readFileSync(assumptionsFile, 'utf8')) : {};
if (!assumptions || typeof assumptions !== 'object' || Array.isArray(assumptions)) {
  throw new Error('Farming assumptions must be a JSON object keyed by ranked protocol slug');
}
const farming = farmingSummaries(board, assumptions).map(f => ({...f, profiles: catalog[f.slug] ?? []}));
const dashboardFarming = Object.fromEntries(farming.map(row => [row.slug, {
  profiles: row.profiles, route: row.route, assumptions: row.assumptions, economics: row.economics,
}]));
const ledger = buildLedger(snapshot, board);
const intelligence = modelIntelligence(snapshot, board);
const ledgerBySlug = new Map(ledger.rows.map(r => [r.slug,r]));
const intelligenceBySlug = new Map(intelligence.rows.map(r => [r.slug,r]));
const decisions = engine.rankDecisions(board.map(row => engine.assess(row, intelligenceBySlug.get(row.slug),
  ledgerBySlug.get(row.slug), dashboardFarming[row.slug])));
const screened = ledger.rows.filter(r => r.symbol === null && r.gecko_id === null &&
  !['Bridge','Canonical Bridge','Liquid Staking','Liquid Restaking','Restaked BTC','CEX'].includes(r.category ?? '') &&
  !VERSIONED.test(r.name) && !/\b(wrapped|staked|staking)\b|^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i.test(r.name));
const coverage = {screened:screened.length, excluded:screened.filter(r=>r.rank === null).map(r=>r.slug),
  exceptions:ledger.rows.filter(r=>r.watchlist && r.status !== 'Pre-token candidate').map(r=>r.slug)};
const decisionReview = {comparison, defaults:engine.defaults, coverage, validation, decisions};
writeFileSync(join(out,'decision-review.json'), JSON.stringify(decisionReview,null,2)+'\n');
writeFileSync(join(out, 'model-intelligence.json'), JSON.stringify(intelligence, null, 2) + '\n');
const research = {
  ...frozenModelReview,
  m71Loo,
  peers: snapshot.protocols.filter(isComparable).map(p => [p.name, p.tvl_usd, p.mcap_usd]),
};
const accounting = ledger.rows.map(row => ({
  slug: row.slug, name: row.name, category: row.category, status: row.status, rank: row.rank,
  watchlist: row.watchlist, disposition: row.disposition, evidence: row.evidence,
}));
writeFileSync(join(out, 'data.js'), dataScript(radar) +
  `window.RADAR_DECISIONS = ${JSON.stringify(decisionReview)};\n` +
  `window.RADAR_FARM_ECONOMICS = ${farmEconomics.toString().replace(/\r\n/g, '\n')};\n` +
  `window.RADAR_FARM_SUMMARIES = ${JSON.stringify(dashboardFarming)};\n` +
  `window.RADAR_ACCOUNTING = ${JSON.stringify(accounting)};\n` +
  `window.RADAR_RESEARCH = ${JSON.stringify(research)};\n` +
  `window.RADAR_INTELLIGENCE = ${JSON.stringify(intelligence)};\n`);
writeFileSync(join(out, 'farming-economics.json'), JSON.stringify(farming, null, 2) + '\n');
writeFileSync(join(out, 'protocol-accounting.json'), JSON.stringify(ledger, null, 2) + '\n');

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  const orderedNames = readdirSync(from).sort();
  for (const name of orderedNames) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashboardFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
// An offline audit extract accompanies the interactive views inside the dossier.
writeFileSync(join(out,'dashboard','00-farm-plan.txt'),readFileSync(join(here,'lib','farming.ts'),'utf8'));
const audit = [
  'Token Radar V7 | Snapshot '+snapshot.as_of+' | '+board.length+' ranked | '+snapshot.watchlist.length+' mandatory',
  'Official order uses the fixed TVL, growth and age valuation. Opportunity order uses assess() and rankDecisions().',
  Object.values(catalog).flat().length+' participation routes across '+Object.keys(catalog).length+' protocols. Wallet eligibility unknown.',
  ...['shift-defi','lofty','axis','polymarket-international','firelight','extended-perps'].map(slug=>{
    const profiles=catalog[slug], profile=profiles.at(-1);
    const d=decisions.find(r=>r.slug===slug), old=comparison[slug];
    if (!d || !old) return '';
    return [profile.id+' | '+(profile.fees ?? profile.entry), profile.settlement ?? profile.exit, profile.incentive ?? profile.risks,
      'Ranked route '+d.profileId+' vs submitted V6: opportunity #'+d.opportunityRank+' vs #'+old.rank+
      '; modeled net $'+d.base.net.toFixed(2)+' vs $'+old.net.toFixed(2)+'; '+d.verdict+'.',
      (profile.terms?.newEntry==='closed' ? 'Existing holder: '+profile.terms.queueDays+' days or approximately '+profile.terms.approxInstantExitBps+' bps for instant redemption. ' : '')+profile.reviewed_at+' | '+profile.sources.join(' ')].join('\n');
  }),
  'The ranked default uses the first listed profile. Alternate paths and program terms are selectable in Decision. Fixed capital, zero realized trading profit, equal exit notional. Quote-dependent costs retain a user budget.'
];
writeFileSync(join(out,'dashboard','00-audit.txt'), audit.join('\n')+'\n');
dashboardFiles.push('00-audit.txt','00-farm-plan.txt');
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: include the ranked board, model research, protocol detail and accounting\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashboardFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
