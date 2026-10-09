import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.mjs';
import { example } from '../shared/specimen.mjs';

test('SQLite retains creatures and jobs across restart and ignores stale legacy JSON', () => {
  const root = mkdtempSync(path.join(os.tmpdir(),'critter-store-'));
  try {
    mkdirSync(path.join(root,'specimens','legacy'),{recursive:true});
    const old = {...example,id:'legacy',createdAt:'2026-09-01T00:00:00Z'};
    writeFileSync(path.join(root,'specimens','legacy','record.json'),JSON.stringify(old));
    let store = new Store(root);
    assert.equal(store.get('specimens','legacy').englishName,example.englishName);
    store.save('specimens','legacy',{...old,englishName:'Renamed specimen'});
    store.save('jobs','job-1',{id:'job-1',status:'completed',createdAt:'2026-09-02T00:00:00Z',specimenId:'legacy'});
    store.db.close();
    writeFileSync(path.join(root,'specimens','legacy','record.json'),JSON.stringify(old));
    store = new Store(root);
    assert.equal(store.list('specimens')[0].englishName,'Renamed specimen');
    assert.equal(store.get('jobs','job-1').specimenId,'legacy');
    assert.equal(readFileSync(path.join(root,'critters.sqlite')).subarray(0,15).toString(),'SQLite format 3');
    assert.throws(()=>store.get('specimens','../../etc/passwd'));
    assert.throws(()=>store.list('specimens; DROP TABLE jobs'));
    store.db.close();
  } finally { rmSync(root,{recursive:true,force:true}); }
});
