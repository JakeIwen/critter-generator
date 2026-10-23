import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';

export class Store {
  constructor(root) {
    this.root = root;
    for (const folder of ['specimens', 'jobs', 'workspace']) mkdirSync(path.join(root, folder), { recursive: true });
    this.db = new DatabaseSync(path.join(root, 'critters.sqlite'));
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    for (const kind of ['specimens', 'jobs']) {
      this.db.exec(`CREATE TABLE IF NOT EXISTS ${kind} (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data))); CREATE INDEX IF NOT EXISTS ${kind}_created ON ${kind}(created_at DESC);`);
      // Import earlier file-backed records once; SQLite is authoritative afterwards.
      const insert = this.db.prepare(`INSERT OR IGNORE INTO ${kind}(id,created_at,data) VALUES(?,?,?)`);
      for (const entry of readdirSync(path.join(root, kind), { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const file = this.file(kind, entry.name, 'record.json');
        if (!existsSync(file)) continue;
        const record = JSON.parse(readFileSync(file, 'utf8'));
        insert.run(entry.name, record.createdAt, JSON.stringify(record));
      }
    }
  }
  file(kind, id, name) {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid record ID.');
    return path.join(this.root, kind, id, name);
  }
  save(kind, id, value) {
    if (!['specimens', 'jobs'].includes(kind)) throw new Error('Invalid record type.');
    const file = this.file(kind, id, 'record.json');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file + '.tmp', JSON.stringify(value, null, 2)); renameSync(file + '.tmp', file);
    this.db.prepare(`INSERT INTO ${kind}(id,created_at,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET created_at=excluded.created_at,data=excluded.data`).run(id, value.createdAt, JSON.stringify(value));
    return value;
  }
  get(kind, id) {
    if (!['specimens', 'jobs'].includes(kind)) throw new Error('Invalid record type.');
    this.file(kind, id, 'record.json');
    const row = this.db.prepare(`SELECT data FROM ${kind} WHERE id=?`).get(id);
    return row ? JSON.parse(row.data) : null;
  }
  list(kind) {
    if (!['specimens', 'jobs'].includes(kind)) throw new Error('Invalid record type.');
    return this.db.prepare(`SELECT data FROM ${kind} ORDER BY created_at DESC`).all().map(row => JSON.parse(row.data));
  }
  async model(id, anatomy, height, baseplate = true) {
    const result = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./model-worker.mjs', import.meta.url), {
        workerData: { anatomy, height, baseplate }, execArgv: process.execArgv.filter(arg => !arg.startsWith('--input-type')),
      });
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('Model generation timed out.')); }, 60000);
      worker.once('message', result => { clearTimeout(timer); result.error ? reject(new Error(result.error)) : resolve(result); });
      worker.once('error', e => { clearTimeout(timer); reject(e); });
      worker.once('exit', code => { clearTimeout(timer); if (code) reject(new Error('Model worker stopped.')); });
    });
    const folder = path.dirname(this.file('specimens', id, 'record.json'));
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, 'model.stl'), result.stl);
    writeFileSync(path.join(folder, 'model.scad'), result.model.scad);
    writeFileSync(path.join(folder, 'mesh.json'), JSON.stringify({ positions: result.model.positions, triangles: result.model.triangles }));
    return result.model.info;
  }
  portrait(id, bytes) { writeFileSync(this.file('specimens', id, 'portrait.png'), bytes); }
}
