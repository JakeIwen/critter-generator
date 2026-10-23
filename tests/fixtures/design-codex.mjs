import { createInterface } from 'node:readline';
import { appendFileSync, readFileSync } from 'node:fs';
import { Anatomy, example } from '../../shared/specimen.mjs';

const send = message => process.stdout.write(JSON.stringify(message) + '\n');
function designReply(params) {
  const fields = params.outputSchema.properties;
  let anatomy = null;
  if (fields.anatomy.type !== 'null') {
    anatomy = Anatomy.parse(example.anatomy);
    anatomy.legLength = 3;
    for (const [key, field] of Object.entries(fields.anatomy.properties)) {
      if (field.enum?.length === 1) anatomy[key] = field.enum[0];
    }
    if (params.input[0].text.includes('Exactly four legs')) Object.assign(anatomy, { legPairs: 2, eyes: 2, horns: 0 });
  }
  const specimen = { ...example, anatomy };
  if (fields.biology) {
    specimen.biology = {
      bodyPlan: 'A translucent swimming animal with a mantle and branching feeding arms.',
      locomotion: 'Pulses its mantle to move through the water.',
      covering: 'A translucent membrane containing moving luminous organs.',
      features: ['Branching feeding arms', 'A muscular swimming mantle', 'Luminous organs under a translucent membrane', 'A band of light-sensitive pits'],
      legCount: anatomy ? anatomy.legPairs * 2 : 0,
    };
    const legCount = fields.biology.properties.legCount;
    if (legCount.enum?.length === 1) specimen.biology.legCount = legCount.enum[0];
  }
  return { type: 'agentMessage', text: JSON.stringify(specimen) };
}

let sequence = 0, portraits = 0;
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
    item = designReply(params);
  } else if (process.env.CRITTER_TEST_FAIL_FIRST_PORTRAIT === '1' && portraits++ === 0) {
    item = { type: 'imageGeneration', failure: 'The isolated portrait fixture failed once.' };
  } else {
    item = { type: 'imageGeneration', result: readFileSync(new URL('../../server/assets/example-lantern-portrait.png', import.meta.url)).toString('base64') };
  }
  send({ method: 'item/completed', params: { threadId, item } });
  send({ method: 'turn/completed', params: { threadId, turn: { status: 'completed' } } });
}
