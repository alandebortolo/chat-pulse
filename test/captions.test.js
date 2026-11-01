import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captionFor, heuristicCaption } from '../src/captions.js';
test('without a key, caption never calls a paid API', async () => {
  const result = await captionFor([{text:'hello',emoteNames:['Kappa','Kappa']}], {}, () => { throw Error('must not fetch'); });
  assert.deepEqual(result, {caption:'Kappa surge',source:'heuristic'});
  assert.equal(heuristicCaption([]), 'Chat surge');
});
test('provider errors preserve a usable heuristic', async () => {
  const result = await captionFor([], {OPENAI_API_KEY:'test'}, async () => new Response('', {status:429}));
  assert.equal(result.source, 'heuristic'); assert.equal(result.caption,'Chat surge');
});
test('caps captions at six words and sends only twelve recent bounded lines', async () => {
  const result = await captionFor(Array.from({length:20},()=>({text:'x'.repeat(1000)})), {OPENAI_API_KEY:'test'}, async (_url, init) => {
    const body=JSON.parse(init.body); const lines=JSON.parse(body.messages[1].content);
    assert.equal(lines.length,12); assert.equal(lines[0].length,300); assert.equal(body.temperature,0);
    return Response.json({choices:[{message:{content:'One two three four five six seven'}}]});
  });
  assert.equal(result.caption,'One two three four five six');
});
