import { APP_SETTINGS, APP_SETTINGS_KEY } from '../shared/app-settings.mjs';
import { mergeAppSettings } from './app-settings.mjs';
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_GENERATION_MODEL, GENERATION_MODEL_KEY } from '../shared/generation-models.mjs';
import { generationTimingFromJobs } from '../shared/generation-timing.mjs';
import { modelFilename, portraitFilename, portraitVersionOf } from '../shared/specimen-assets.mjs';
import { normalizePortrait, publishPortrait } from './portrait-assets.mjs';
import { publishModel } from './model-assets.mjs';

const GENERATION_TIMING_KEY = 'generation-timing';

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
    this.db.exec('CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value)));');
    // Rebuild from durable jobs so older completed work contributes immediately.
    this.refreshGenerationTiming();
  }
  file(kind, id, name) {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid record ID.');
    return path.join(this.root, kind, id, name);
  }
  save(kind, id, value) {
    if (!['specimens', 'jobs'].includes(kind)) throw new Error('Invalid record type.');
    const previousJob = kind === 'jobs' ? this.get(kind, id) : null;
    const file = this.file(kind, id, 'record.json');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file + '.tmp', JSON.stringify(value, null, 2)); renameSync(file + '.tmp', file);
    this.db.prepare(`INSERT INTO ${kind}(id,created_at,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET created_at=excluded.created_at,data=excluded.data`).run(id, value.createdAt, JSON.stringify(value));
    if (kind === 'jobs' && (value.status === 'completed' || previousJob?.status === 'completed')) this.refreshGenerationTiming();
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
  archiveSpecimen(id) {
    if (!this.get('specimens', id)) throw new Error('Specimen not found.');
    const source = path.dirname(this.file('specimens', id, 'record.json'));
    const archive = path.join(this.root, 'archive');
    mkdirSync(archive, { recursive: true });
    let destination = path.join(archive, id), timestamp = Date.now();
    while (existsSync(destination)) destination = path.join(archive, `${id}-${new Date(timestamp++).toISOString()}`);
    // Move the record too: startup imports any record.json left in specimens/.
    renameSync(source, destination);
    try { this.db.prepare('DELETE FROM specimens WHERE id=?').run(id); }
    catch (error) { renameSync(destination, source); throw error; }
    return id;
  }
  metadata(key, fallback = null) {
    const row = this.db.prepare('SELECT value FROM app_metadata WHERE key=?').get(key);
    return row ? JSON.parse(row.value) : structuredClone(fallback);
  }
  setMetadata(key, value) {
    this.db.prepare('INSERT INTO app_metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, JSON.stringify(value));
    return value;
  }
  appSettings() { return mergeAppSettings(this.metadata(APP_SETTINGS_KEY)); }
  saveAppSettings(values) {
    const previous = this.appSettings();
    this.setMetadata(APP_SETTINGS_KEY, values);
    if (Object.entries(APP_SETTINGS).some(([key, definition]) => definition.group === 'timing' && previous[key] !== values[key])) {
      this.refreshGenerationTiming();
    }
    return this.appSettings();
  }
  generationModel() { return this.metadata(GENERATION_MODEL_KEY, DEFAULT_GENERATION_MODEL); }
  generationTiming() { return this.metadata(GENERATION_TIMING_KEY); }
  refreshGenerationTiming() {
    const jobs = this.db.prepare("SELECT data FROM jobs WHERE json_extract(data, '$.status') = 'completed'")
      .all().map(row => JSON.parse(row.data));
    const timing = generationTimingFromJobs(jobs, this.appSettings());
    return this.setMetadata(GENERATION_TIMING_KEY, timing);
  }
  async model(id, anatomy, height, baseplate = true, options = {}) {
    const result = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./model-worker.mjs', import.meta.url), {
        workerData: { anatomy, height, baseplate }, execArgv: process.execArgv.filter(arg => !arg.startsWith('--input-type')),
      });
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('Model generation timed out.')); }, 60000);
      worker.once('message', result => { clearTimeout(timer); result.error ? reject(new Error(result.error)) : resolve(result); });
      worker.once('error', e => { clearTimeout(timer); reject(e); });
      worker.once('exit', code => { clearTimeout(timer); if (code) reject(new Error('Model worker stopped.')); });
    });
    return publishModel(path.dirname(this.file('specimens', id, 'record.json')), result, options);
  }
  portrait(id, bytes) { writeFileSync(this.file('specimens', id, 'portrait.png'), bytes); }
  async savePortrait(specimen, bytes, options = {}) {
    const normalized = await normalizePortrait(bytes);
    return publishPortrait(this, specimen, normalized, options);
  }
  portraitFile(specimen, requestedVersion) {
    const version = requestedVersion ?? portraitVersionOf(specimen);
    const current = portraitVersionOf(specimen);
    if (!version || version > current) throw new Error('Portrait version not found.');
    const archived = this.file('specimens', specimen.id, portraitFilename(version));
    return existsSync(archived) || version !== current ? archived : this.file('specimens', specimen.id, 'portrait.png');
  }
  modelFile(specimen, name) { return this.file('specimens', specimen.id, modelFilename(specimen, name)); }
}
