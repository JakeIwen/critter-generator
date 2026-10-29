import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
const origin = `http://127.0.0.1:${process.env.PORT || 4329}`;
const status = await (await fetch(origin + '/api/status')).json();
assert.equal(status.owner, true);
assert.equal(status.session, null);
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
for (const route of ['/', '/index.html', '/collection', '/settings', '/specimens/example-lantern']) {
  const response = await fetch(origin + route);
  assert.match(response.headers.get('cache-control'), /no-transform/);
  assert.match(response.headers.get('cache-control'), /no-cache/);
  const html = await response.text();
  const asset = html.match(/(?:src|href)="(\/assets\/[^"]+)"/)?.[1];
  assert(asset, 'The index references a hashed build asset.');
  const builtAsset = await fetch(origin + asset);
  assert.equal(builtAsset.status, 200);
  assert.match(builtAsset.headers.get('cache-control'), /no-transform, public, max-age=31536000, immutable/);
}
assert.equal((await fetch(origin + '/unknown-page')).status, 404);
const logout = await fetch(origin + '/logout', { redirect: 'manual' });
assert.equal(logout.status, 303); assert.equal(logout.headers.get('location'), '/');
const remove = id => fetch(`${origin}/api/specimens/${id}`, { method: 'DELETE', headers: { 'X-Critter-Request': '1' } });
assert.equal((await remove('unknown-specimen')).status, 404);
assert.equal((await remove('example-lantern')).status, 409);
// The download fixture has served its purpose; archive it only after checking its files.
const archived = await remove('verification-model');
assert.equal(archived.status, 200);
assert.deepEqual(await archived.json(), { archived: 'verification-model' });
const remaining = await (await fetch(origin + '/api/specimens')).json();
assert.equal(remaining.length, specimens.length - 1);
assert(!remaining.some(specimen => specimen.id === 'verification-model'));
const dataRoot = process.env.CRITTER_DATA_DIR;
assert(dataRoot, 'Archive verification requires the isolated data root.');
assert(!existsSync(path.join(dataRoot, 'specimens/verification-model')));
assert(readdirSync(path.join(dataRoot, 'archive')).some(name => name === 'verification-model' || name.startsWith('verification-model-')));
console.log(`HTTP verification passed: ${specimens.length} saved specimens, binary STL/CAD/image downloads, input validation, owner settings/stats, SPA paths/index/asset caching, logout redirects, specimen archival and local request boundaries.`);
