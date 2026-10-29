import assert from 'node:assert/strict';
const origin = `http://127.0.0.1:${process.env.PORT || 4329}`;
const status = await (await fetch(origin + '/api/status')).json();
assert.equal(status.owner, true);
assert.deepEqual(status.generation, { provider: 'codex', model: 'gpt-6-astra', effort: 'max' });
assert.equal(typeof status.connection.codex.connected, 'boolean');
assert.equal(typeof status.connection.claude.connected, 'boolean');
const modelResponse = await fetch(origin + '/api/models');
assert.equal(modelResponse.status, 200);
const { catalog, selection } = await modelResponse.json();
assert.deepEqual(selection, status.generation);
assert.equal(typeof catalog.refreshing, 'boolean');
for (const provider of ['codex', 'claude']) {
  const state = catalog.providers.find(item => item.provider === provider);
  assert.equal(state.available, false); assert.equal(typeof state.reason, 'string');
  assert(state.reason.length > 0); assert.deepEqual(state.models, []);
  assert(Number.isFinite(Date.parse(state.checkedAt)));
}
const statsResponse = await fetch(origin + '/api/stats');
assert.equal(statsResponse.status, 200);
const stats = await statsResponse.json();
assert.deepEqual(stats.timing, status.generationTiming);
for (const key of ['totals', 'durations', 'recent', 'byModel']) assert(Array.isArray(stats[key]));
const unavailable = await fetch(origin + '/api/settings/generation', { method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'X-Critter-Request': '1' }, body: JSON.stringify(selection) });
assert.equal(unavailable.status, 400); assert.equal(typeof (await unavailable.json()).error, 'string');
const specimens = await (await fetch(origin+'/api/specimens')).json();
assert(specimens.length > 0);
for (const s of specimens) {
  if (s.print) {
    const stl = await fetch(`${origin}/api/specimens/${s.id}/files/model.stl?download=1`);
    assert.equal(stl.status,200); assert.match(stl.headers.get('content-disposition'),/attachment/);
    const bytes = Buffer.from(await stl.arrayBuffer()); assert.equal(bytes.length,84+bytes.readUInt32LE(80)*50);
    const mesh = await (await fetch(`${origin}/api/specimens/${s.id}/files/mesh.json`)).json();
    assert.equal(mesh.triangles.length/3,s.print.triangles);
    const cad = await (await fetch(`${origin}/api/specimens/${s.id}/files/model.scad`)).text(); assert.match(cad,/union\(\)/);
  } else {
    for (const name of ['model.stl', 'model.scad', 'mesh.json']) assert.equal((await fetch(`${origin}/api/specimens/${s.id}/files/${name}`)).status, 404);
  }
  if(s.image) { const image=await fetch(`${origin}/api/specimens/${s.id}/files/portrait.png`); assert.equal(image.status,200); assert((await image.arrayBuffer()).byteLength>10000); }
}
assert.equal((await fetch(origin+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
assert.equal((await fetch(origin+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json','X-Critter-Request':'1'},body:JSON.stringify({prompt:'',absurdity:101,deviancy:0,lethality:0,height:100})})).status,400);
for (const settings of [{ height: 501 }, { height: 500, baseplate: 'false' },
  { height: 100, printModel: 'false' }, { height: 100, legless: 'false' }, { height: 100, animalTypes: ['unknown-animal'] }]) {
  const response = await fetch(origin+'/api/generate', { method:'POST', headers:{'Content-Type':'application/json','X-Critter-Request':'1'},
    body:JSON.stringify({ prompt:'', absurdity:50, deviancy:0, lethality:0, ...settings }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /60–500 mm/);
}
assert.equal((await fetch(origin+'/api/status',{headers:{Origin:'https://unrelated.example'}})).status,403);
assert.equal((await fetch(origin+'/api/specimens/example-lantern/files/server.json')).status,404);
assert.equal((await fetch(origin+'/api/shutdown',{method:'POST',headers:{'X-Critter-Request':'1'}})).status,403);
console.log(`HTTP verification passed: ${specimens.length} saved specimens, binary STL/CAD/image downloads, input validation, owner settings/stats and local request boundaries.`);
