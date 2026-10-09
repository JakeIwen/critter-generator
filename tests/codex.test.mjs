import test from 'node:test';
import assert from 'node:assert/strict';
import { Codex, imageBytes, safeError } from '../server/codex.mjs';

test('turn events only resolve the owned thread and ignore reasoning', async () => {
  const client = new Codex('/tmp');
  let result;
  client.active = { threadId:'owned',messages:[],images:[],resolve:r=>result=r,reject:e=>{throw e;} };
  client.receive({method:'item/completed',params:{threadId:'unrelated',item:{type:'agentMessage',text:'private unrelated text'}}});
  client.receive({method:'item/completed',params:{threadId:'owned',item:{type:'reasoning',text:'private reasoning'}}});
  client.receive({method:'item/completed',params:{threadId:'owned',item:{type:'agentMessage',text:'{"englishName":"Test"}'}}});
  client.receive({method:'turn/completed',params:{threadId:'owned',turn:{status:'completed'}}});
  assert.equal(result.text,'{"englishName":"Test"}'); assert.equal(client.active,null);
});
test('failed turns reject and unsupported requests are never approved', () => {
  const client=new Codex('/tmp'); let error, reply;
  client.active={threadId:'owned',reject:e=>error=e};
  client.receive({method:'turn/completed',params:{threadId:'owned',turn:{status:'failed',error:{message:'test failure'}}}});
  assert.match(error.message,/test failure/);
  client.send=message=>reply=message;
  client.receive({id:1,method:'item/commandExecution/requestApproval',params:{}});
  assert.equal(reply.result.decision,'decline');
});
test('image failures are explicit and credentials are redacted from errors', async () => {
  await assert.rejects(imageBytes([]),/no image/);
  await assert.rejects(imageBytes([{result:'not an image',failure:null}]),/no image/);
  assert.equal(safeError(new Error('sk-test_123 Bearer abc.def')),'[redacted] Bearer [redacted]');
});
