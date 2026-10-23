import { createInterface } from 'node:readline';
import { appendFileSync, readFileSync } from 'node:fs';
import { Anatomy, example } from '../../shared/specimen.mjs';

const send = message => process.stdout.write(JSON.stringify(message) + '\n');
let sequence = 0;
for await (const line of createInterface({ input: process.stdin })) {
  const { id, method, params } = JSON.parse(line);
  if (id === undefined) continue;
  let result = {};
  if (method === 'account/read') result = { account: { type: 'chatgpt' } };
  if (method === 'config/read') result = { config: {} };
  if (method === 'model/list') result = { data: [{ model: 'fixture', isDefault: true, supportedReasoningEfforts: [], defaultReasoningEffort: 'medium' }] };
  if (method === 'thread/start') result = { thread: { id: `fixture-${++sequence}` }, sandbox: { type: 'readOnly' } };
  if (method === 'turn/start') result = { turn: { id: `turn-${sequence}` } };
  send({ id, result });
  if (method !== 'turn/start') continue;
  appendFileSync(process.env.CRITTER_TEST_LOG, JSON.stringify(params) + '\n');
  const threadId = params.threadId;
  let item;
  if (params.outputSchema) {
    const anatomy = Anatomy.parse(example.anatomy);
    anatomy.legLength = 3;
    for (const [key, field] of Object.entries(params.outputSchema.properties.anatomy.properties)) {
      if (field.enum?.length === 1) anatomy[key] = field.enum[0];
    }
    if (params.input[0].text.includes('Exactly four legs')) Object.assign(anatomy, { legPairs: 2, eyes: 2, horns: 0 });
    item = { type: 'agentMessage', text: JSON.stringify({ ...example, anatomy }) };
  } else {
    item = { type: 'imageGeneration', result: readFileSync(new URL('../../server/assets/example-lantern-portrait.png', import.meta.url)).toString('base64') };
  }
  send({ method: 'item/completed', params: { threadId, item } });
  send({ method: 'turn/completed', params: { threadId, turn: { status: 'completed' } } });
}
