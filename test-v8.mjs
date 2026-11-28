import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import engine from './dashboard/00-decision.js';
import submittedEngine from '../../submissions/v7/committed-source/dashboard/00-decision.js';
import { buildDossier } from '../../competition/kits/token-radar-01-level58/token-radar-01-kit/starter/vendor/makefun-board.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const base = join(root,'submissions/v7/committed-output');
const out = process.argv[2] || join(root,'artifacts/v8/review');
const entry = process.argv[3] || join(root,'source/v8/main.ts');
const read = (dir,file) => readFileSync(join(dir,file));
const json = file => JSON.parse(read(out,file));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function inventory(dir) {
  return Object.fromEntries(readdirSync(dir,{recursive:true}).sort().filter(f=>statSync(join(dir,f)).isFile())
    .map(f=>[f.replaceAll('\\','/'),hash(read(dir,f))]));
}
for (const file of ['board.json','data.js','protocol-accounting.json','model-intelligence.json',
  'decision-review.json','farming-economics.json','dashboard/01-farming-routes.json','dashboard/00-validation.json']) {
  assert.equal(hash(read(out,file)),hash(read(base,file)),file);
}
const board = json('board.json').rows;
assert.equal(board.length,182);
const ledger = json('protocol-accounting.json').rows;
const farms = json('farming-economics.json');
const intel = json('model-intelligence.json').rows;
assert.equal(ledger.filter(r=>r.watchlist && r.rank).length,40);
let routes=0, scenarios=0;
for (const [i,r] of board.entries()) {
  assert.equal(r.rank,i+1);
  if (i) assert.ok(r.implied_value_usd<=board[i-1].implied_value_usd);
  const lookup = rows => rows.find(x=>x.slug===r.slug);
  const farm = lookup(farms);
  routes += farm.profiles.length;
  for (const profile of farm.profiles) {
    const terms = profile.terms || {};
    const variants = [undefined,...Object.keys(terms.minimumQueueDaysByV1Vault || {}),
      ...(terms.exitDaysRange ? ['Lower bound','Upper bound'] : []),
      ...(terms.approxInstantExitBps ? ['Queue','Instant'] : [])];
    for (const variant of variants) {
      for (const changes of [{},{capital:1500,fees:17,days:10},{success:0},{days:-1}]) {
        const args = [r,lookup(intel),lookup(ledger),farm,{...engine.defaults,...changes},profile.id,variant];
        assert.deepEqual(engine.assess(...args),submittedEngine.assess(...args));
        scenarios++;
      }
    }
  }
}
assert.equal(routes,60);
assert.equal(farms.filter(f=>f.profiles.length).length,54);
const caps = {text_max_bytes:65536,screenshots:{max:4,max_bytes:524288},dashboard:{max_files:400,max_bytes:4194304}};
const dossier = read(out,'dossier.json');
assert.ok(dossier.equals(buildDossier(out,caps)));
assert.ok(dossier.length<=1572864);
const excerpt = JSON.parse(dossier).text;
assert.ok(Buffer.byteLength(excerpt)<=caps.text_max_bytes);
assert.ok(excerpt.includes('function sortRadarRows'));
assert.ok(excerpt.includes('M7.1 primary is its model identifier'));
const packet = JSON.parse(dossier);
assert.equal(packet.images[packet.cover].name,'1-board.png');
assert.equal(packet.images.length,4);
for (const img of packet.images) {
  const bytes = read(out,'screenshots/'+img.name);
  assert.equal(hash(bytes),img.sha256);
  assert.ok(bytes.equals(Buffer.from(img.base64,'base64')));
}
const audit = read(base,'dashboard/00-audit.txt').toString().split('shift-defi/v6 |')[1].split('The ranked default')[0];
assert.ok(excerpt.slice(0,6500).includes(audit));
const shots = readdirSync(join(out,'screenshots'));
assert.equal(shots.length,4);
for (const f of shots) {
  const image=read(out,'screenshots/'+f);
  assert.equal(image.toString('ascii',1,4),'PNG');
  assert.ok(image.length<=524288);
  assert.notEqual(hash(image),hash(read(base,'screenshots/'+f)));
}
const repeat = mkdtempSync(join(tmpdir(),'radar-v8-rebuild-'));
try {
  execFileSync(process.execPath,[entry,'--input',join(root,'research/baseline-input'),'--output',repeat],{stdio:'pipe'});
  const files = inventory(out);
  assert.deepEqual(inventory(repeat),files);
  console.log(JSON.stringify({officialRows:board.length,watchlist:40,documentedProtocols:54,routes,
    scenarioChecks:scenarios,verifiedFiles:Object.keys(files).length,dossierBytes:dossier.length,sha256:files},null,2));
} finally {
  if (relative(tmpdir(),repeat).startsWith('radar-v8-rebuild-')) rmSync(repeat,{recursive:true,force:true});
}
