import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import engine from './dashboard/00-decision.js';
import {buildDossier} from '../../competition/kits/token-radar-01-level58/token-radar-01-kit/starter/vendor/makefun-board.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));
const out=join(root,'artifacts/v7/review');
const baseline=join(root,'submissions/v6/committed-output');
const load=(dir,name)=>JSON.parse(readFileSync(join(dir,name),'utf8'));
const profiles=load(join(root,'research/v7-review'),'profiles.json');
const catalog=load(out,'dashboard/01-farming-routes.json');
const idOrder=(a,b)=>a.id.localeCompare(b.id);
assert.deepEqual(Object.values(catalog).flat().sort(idOrder),profiles.sort(idOrder));
assert.equal(new Set(profiles.map(x=>x.id)).size,60);
assert.equal(Object.keys(catalog).length,54);
const board=load(out,'board.json').rows, original=load(baseline,'board.json').rows;
const official=({farm_steps,...fields})=>fields;
assert.equal(board.length,182);
assert.deepEqual(board.map(official),original.map(official));
assert.deepEqual(load(out,'protocol-accounting.json'),load(baseline,'protocol-accounting.json'));
const review=load(out,'decision-review.json'), old=load(baseline,'decision-review.json');
assert.deepEqual(review.comparison,Object.fromEntries(old.decisions.map(d=>[d.slug,{rank:d.opportunityRank,net:d.base.net,verdict:d.verdict}])));
const farms=load(out,'farming-economics.json'),ledger=load(out,'protocol-accounting.json').rows,intel=load(out,'model-intelligence.json').rows;
function assess(slug,inputs={},id,variant){
  const get=rows=>rows.find(r=>r.slug===slug);
  return engine.assess(get(board),get(intel),get(ledger),get(farms),{...engine.defaults,...inputs},id,variant);
}
assert.deepEqual(engine.rankDecisions(board.map(r=>assess(r.slug))),review.decisions);
for(const p of profiles){
  const d=assess(p.slug,{},p.id);
  assert.equal(d.profileId,p.id);
  assert.equal(d.qualification,'Unknown');
  assert.equal(d.next.length>0,true);
  assert.equal(d.risk,p.risks);
  assert.ok(p.sources.every(u=>new URL(u).protocol==='https:'));
  assert.match(p.reviewed_at,/^2026-11-\d\d$/);
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
for(const [slug,days,tx] of [['shift-defi',37,8],['lofty',30,63],['cian-yield-layer',35,8.2],['tori-finance',30,10],['firelight',60,8],['nuva',32,8],['axis',37,8],['extended-perps',30,8]]){
 const d=assess(slug);
 near(d.base.transaction,tx);
 near(d.base.opportunity,1000*0.05*days/365);
 near(d.base.net,d.base.gross-tx-20-1000*0.05*days/365);
}
near(assess('axis',{},undefined,'Instant').base.transaction,11);
near(assess('axis',{},undefined,'Instant').sensitivity.find(x=>x.label==='Double fee budget').net,assess('axis',{},undefined,'Instant').base.net-8);
assert.equal(assess('axis').tier,4);
assert.equal(assess('firelight',{},undefined,'Upper bound').terms.days,90);
assert.equal(assess('shift-defi',{},undefined,'ltLLP').terms.days,34);
assert.equal(assess('extended-perps',{days:0}).terms.days,1);
assert.equal(assess('extended-perps',{days:-1}).base,null);
assert.equal(assess('mezo-earn',{},'mezo-earn/gauge').tier,5);
assert.equal(assess('polymarket-international',{},'polymarket-international/maker').base.gross,assess('polymarket-international').base.gross);
const dossier=readFileSync(join(out,'dossier.json'),'utf8');
assert.ok(Buffer.from(dossier).equals(buildDossier(out,{text_max_bytes:65536,screenshots:{max:4,max_bytes:524288},dashboard:{max_files:400,max_bytes:4194304}})));
const excerpt=JSON.parse(dossier).text;
assert.ok(Buffer.byteLength(excerpt)<=65536);
assert.ok(Buffer.byteLength(dossier)<=1572864);
for(const phrase of ['2.5%','seven days','30 bps','60 participation routes','one-dollar payout floor']){
 const pos=excerpt.indexOf(phrase);
 assert.ok(pos>=0 && Buffer.byteLength(excerpt.slice(0,pos))<6500,phrase);
}
for(const f of readdirSync(join(out,'screenshots'))){
 const bytes=readFileSync(join(out,'screenshots',f));
 assert.ok(bytes.length<=524288 && bytes.length>1000);
 assert.notDeepEqual(bytes,readFileSync(join(baseline,'screenshots',f)));
}
const rebuilt=mkdtempSync(join(tmpdir(),'token-radar-v7-check-'));
execFileSync(process.execPath,[join(root,'source/v7/main.ts'),'--input',join(root,'research/baseline-input'),'--output',rebuilt]);
function hashes(dir){
 const entries=readdirSync(dir,{recursive:true}).filter(f=>statSync(join(dir,f)).isFile()).sort();
 return Object.fromEntries(entries.map(f=>[f,createHash('sha256').update(readFileSync(join(dir,f))).digest('hex')]));
}
const reference=hashes(out);
assert.deepEqual(hashes(rebuilt),reference);
console.log(JSON.stringify({routes:profiles.length,protocols:Object.keys(catalog).length,officialRows:board.length,identicalRebuiltFiles:Object.keys(reference).length,excerptBytes:Buffer.byteLength(excerpt),dossierBytes:Buffer.byteLength(dossier),sha256:reference},null,2));
