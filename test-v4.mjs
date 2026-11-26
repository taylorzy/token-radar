import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
const [out,v3] = process.argv.slice(2);
const file = (dir,name) => readFileSync(join(dir,name));
for (const name of ['board.json','protocol-accounting.json','farming-economics.json','dashboard/farming-routes.json']) {
  assert.deepEqual(file(out,name),file(v3,name));
}
const x = JSON.parse(file(out,'model-intelligence.json'));
const context = {window:{}};
vm.runInNewContext(file(out,'data.js').toString(),context);
assert.equal(JSON.stringify(context.window.RADAR_INTELLIGENCE),JSON.stringify(x));
const board = JSON.parse(file(out,'board.json')).rows;
assert.deepEqual(x.rows.map(r=>r.slug), board.map(r=>r.slug));
assert.equal(new Set(x.rows.map(r=>r.slug)).size,182);
const ordered = (get,rank) => {
  const rows = x.rows.filter(r=>get(r)!==null).sort((a,b)=>get(b)-get(a)||(a.slug<b.slug?-1:1));
  rows.forEach((r,i)=>assert.equal(rank(r),i+1));
};
for (const key of Object.keys(x.rows[0].models)) ordered(r=>r.models[key].value,r=>r.models[key].rank);
for (const [key] of x.features.stress) ordered(r=>r.stress[key].value,r=>r.stress[key].rank);
for (const key of Object.keys(x.features.metrics)) ordered(r=>r[key],r=>r.rankings[key]);
x.rows.forEach((r,i)=>{
  assert.equal(r.models.m71.value,board[i].implied_value_usd);
  assert.equal(r.consensus,Object.values(r.models).map(m=>m.value).sort((a,b)=>a-b)[3]);
  assert.equal(r.uncertainty.adaptive,null);
  assert.equal(r.opportunity,r.propensity ? r.consensus*r.propensity.propensity : null);
  assert.equal(r.documented,r.propensity && board[i].farm_steps[0].startsWith('Documented route.') ? r.opportunity : null);
});
assert.equal(x.interval.overall.size.n,119);
assert.equal(x.presence.scores.ridge.calibration.reduce((n,b)=>n+b.n,0),579);
console.log('All model, scenario and opportunity ranks, evidence gates, 182 medians and primary values, dashboard payload and V3 parity verified.');
