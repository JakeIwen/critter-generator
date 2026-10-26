import { createInterface } from 'node:readline';
import { appendFileSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { Anatomy, example } from '../../shared/specimen.mjs';

const send = message => process.stdout.write(JSON.stringify(message) + '\n');
function designReply(params) {
  const fields = params.outputSchema.properties;
  if (fields.approximationNotes) {
    const anatomy = Anatomy.parse({ ...example.anatomy, legLength: 3 });
    for (const [key, field] of Object.entries(fields.anatomy.properties)) {
      if (field.enum?.length === 1) anatomy[key] = field.enum[0];
    }
    return { anatomy, approximationNotes: ['Fine surface details and flexible appendages are simplified for a sturdy sculpture.'] };
  }
  if (fields.issues) return { issues: [{ requirement: 'Exact visible anatomy', status: 'uncertain',
    observation: 'The offline fixture does not perform a visual judgment.' }] };
  const specimen = { ...example, anatomy: null,
    biology: { bodyPlan: 'A translucent swimming animal with a mantle and branching feeding arms.',
      locomotion: 'Pulses its mantle to move through the water.',
      covering: 'A translucent membrane containing moving luminous organs.',
      features: ['Branching feeding arms', 'A muscular swimming mantle', 'Luminous organs under a translucent membrane', 'A band of light-sensitive pits'],
      legCount: fields.biology.properties.legCount.enum?.[0] ?? 0 },
    visualRequirements: { originalPrompt: fields.visualRequirements.properties.originalPrompt.enum[0], required: [], excluded: [] } };
  return specimen;
}

let sequence = 0, portraits = 0, designAttempts = 0, heldReview = null;
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
  if (method === 'turn/interrupt' && heldReview === params.threadId) {
    send({ method: 'turn/completed', params: { threadId: heldReview, turn: { status: 'interrupted' } } });
    heldReview = null;
  }
  if (method !== 'turn/start') continue;
  appendFileSync(process.env.CRITTER_TEST_LOG, JSON.stringify(params) + '\n');
  const threadId = params.threadId;
  let item;
  if (params.outputSchema) {
    if (params.outputSchema.properties.issues && params.input.some(input => input.type === 'localImage') &&
      process.env.CRITTER_TEST_HOLD_REVIEW === '1') { heldReview = threadId; continue; }
    const isDesign = Boolean(params.outputSchema.properties.visualRequirements);
    if (isDesign && process.env.CRITTER_TEST_FAIL_DESIGN_ONCE === '1' && designAttempts++ === 0) {
      send({ method: 'item/agentMessage/delta', params: { threadId, delta: ' '.repeat(500) } });
      continue;
    }
    item = { type: 'agentMessage', text: JSON.stringify(designReply(params)) };
  } else if (process.env.CRITTER_TEST_FAIL_FIRST_PORTRAIT === '1' && portraits++ === 0) {
    item = { type: 'imageGeneration', failure: 'The isolated portrait fixture failed once.' };
  } else {
    let bytes = readFileSync(new URL('../../server/assets/example-lantern-portrait.png', import.meta.url));
    if (process.env.CRITTER_TEST_CORRUPT_PORTRAIT === '1' ||
      (process.env.CRITTER_TEST_CORRUPT_REFERENCE === '1' && params.input.some(input => input.type === 'localImage'))) bytes = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(160)]);
    else if (params.input.some(input => input.type === 'localImage')) bytes = await sharp(bytes).tint('#cc7733').png().toBuffer();
    item = { type: 'imageGeneration', result: bytes.toString('base64'), revisedPrompt: 'Offline fixture revised portrait prompt.', transparentBackground: false };
  }
  send({ method: 'item/completed', params: { threadId, item } });
  send({ method: 'turn/completed', params: { threadId, turn: { status: 'completed' } } });
}
