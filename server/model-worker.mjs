import { parentPort, workerData } from 'node:worker_threads';
import { createModel, stlBuffer } from './geometry.mjs';
try {
  const model = await createModel(workerData.anatomy, workerData.height, workerData.baseplate);
  parentPort.postMessage({ model, stl: stlBuffer(model) });
} catch (e) { parentPort.postMessage({ error: e.message }); }
