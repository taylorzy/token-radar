import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const directory = new URL('./reports/coverage/', import.meta.url);
const fields = { lines: ['LH', 'LF'], branches: ['BRH', 'BRF'], functions: ['FNH', 'FNF'] };
const versions = { v1: '7270dff', m7: '2f97395', m8: '6e2f8de', m9: 'm9-model-selection' };
const report = {};
for (const [version, ref] of Object.entries(versions)) {
  const records = readFileSync(new URL(version + '.lcov', directory), 'utf8')
    .split('end_of_record').filter(x => x.includes('SF:'));
  const files = {};
  for (const record of records) {
    const values = Object.fromEntries(record.trim().split(/\r?\n/).map(row => {
      const i = row.indexOf(':');
      return [row.slice(0, i), row.slice(i + 1)];
    }));
    const path = values.SF.replaceAll('\\', '/');
    assert.ok(!files[path]);
    files[path] = Object.fromEntries(Object.entries(fields).map(([name, [hit, total]]) => [
      name, { covered: Number(values[hit]), total: Number(values[total]) },
    ]));
  }
  const expected = ['main.ts', 'dashboard/app.js', 'lib/classification.ts', 'lib/farming.ts',
    'lib/model.ts', 'lib/valuation.ts'];
  if (version === 'm8' || version === 'm9') expected.push('lib/ledger.ts', 'lib/regularization.ts');
  assert.deepEqual(Object.keys(files).sort(), expected.sort());
  const aggregate = Object.fromEntries(Object.keys(fields).map(metric => {
    const values = Object.values(files).map(file => file[metric]);
    assert.ok(values.every(x => x.covered >= 0 && x.covered <= x.total && x.total > 0));
    const covered = values.reduce((sum, x) => sum + x.covered, 0);
    const total = values.reduce((sum, x) => sum + x.total, 0);
    return [metric, { covered, total, percent: 100 * covered / total }];
  }));
  const last = Object.values(report).at(-1);
  for (const [key, value] of Object.entries(aggregate)) {
    value.deltaPP = last ? value.percent - last.javascriptTypescript[key].percent : null;
    value.deltaFromV1PP = report.v1 ? value.percent - report.v1.javascriptTypescript[key].percent : 0;
  }
  report[version] = { ref, javascriptTypescript: aggregate, python: null, files };
}
writeFileSync(new URL('summary.json', directory), JSON.stringify(report, null, 2) + '\n');

const notation = x => `${x.covered}/${x.total} (${x.percent.toFixed(2)}%)` +
  (x.deltaPP === null ? '' : ` [${x.deltaPP >= 0 ? '+' : ''}${x.deltaPP.toFixed(2)} pp]`);
const table = ['| Version | Lines | Branches | Functions | Python |',
  '|---|---:|---:|---:|---|',
  ...Object.entries(report).map(([name, row]) =>
    `| ${name.toUpperCase()} | ${Object.values(row.javascriptTypescript).map(notation).join(' | ')} | N/A (0 files) |`)];
const details = Object.entries(report.m9.files).map(([name, row]) =>
  `| ${name} | ${Object.values(row).map(x => notation({ ...x, percent: 100 * x.covered / x.total, deltaPP: null })).join(' | ')} |`);
writeFileSync(new URL('README.md', directory), [
  '# Authored production test coverage', '',
  'The same offline test workload ran against archived V1, M7, and M8 sources and the M9 worktree. Node 26.13.1 V8 coverage includes the CLI and TypeScript modules. Edge DevTools precise coverage supplies dashboard JavaScript ranges to the same Node reporter. Branch counts are V8 block-range coverage, which can differ from AST-based tools. The runner enables inclusion of unloaded production sources and asserts that the LCOV inventory matches the full production source list. In this run every production file had coverage data.', '',
  'The denominator contains the authored executable radar code: main.ts, lib/*.ts, and dashboard/app.js. Static markup, styles, data, generated outputs, vendored code, offline analysis scripts and test tooling are outside the measured executable production artifact. All four radar revisions contain zero authored production Python files; separate leaderboard collectors are outside these revisions. Deltas below are percentage points from the preceding version. The JSON also gives deltas from V1.', '',
  ...table, '', '## M9 by source file', '', '| File | Lines | Branches | Functions |',
  '|---|---:|---:|---:|', ...details, '',
  'The aggregate 90% line and 80% branch targets were met. Individual files with lower branch coverage include the dashboard, regularization selection, and the CLI. Tests cover rank and snapshot rejection, missing feature values, degenerate fits, token and family classification, farming route classes, positive and invalid calculator inputs, filtering, sorting, and detail deep links. Remaining gaps include calculator overflow, dialog fallback on older browsers, degenerate inner selection or convergence failures, ledger corruption rejection, and failing screenshot packaging or CLI deck generation. Those paths lack direct end-to-end exercise here. No source lines were removed or marked ignored for coverage.', '',
  'Raw per-version LCOV and machine-readable counts are in this directory. Reproduce with measure-coverage.ps1 and then node summarize-coverage.mjs.', '',
].join('\n'));
console.log(table.join('\n'));
