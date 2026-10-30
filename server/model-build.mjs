import { Worker } from 'node:worker_threads';

export function buildModel(anatomy, height, baseplate = true) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./model-worker.mjs', import.meta.url), {
      workerData: { anatomy, height, baseplate }, execArgv: process.execArgv.filter(arg => !arg.startsWith('--input-type')),
    });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Model generation timed out.')); }, 60000);
    worker.once('message', result => { clearTimeout(timer); result.error ? reject(new Error(result.error)) : resolve(result); });
    worker.once('error', e => { clearTimeout(timer); reject(e); });
    worker.once('exit', code => { clearTimeout(timer); if (code) reject(new Error('Model worker stopped.')); });
  });
}
