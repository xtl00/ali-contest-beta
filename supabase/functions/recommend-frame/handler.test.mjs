import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './handler.mjs';
import { createOpenAIRecognizer } from './provider.mjs';

const image = { mediaType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lJcAAAAASUVORK5CYII=' };
const body = { source: 'datatft', season: 18, version: '18.7', mode: 'scan', image };
const req = (data, token = 'test-token') => new Request('https://local.invalid/functions/v1/recommend-frame', {
  method: 'POST', headers: { authorization: 'Bearer '+token, 'content-type': 'application/json' }, body: JSON.stringify(data),
});
const catalog = {
  setData: { units: [{id:'ornn',name:'奥恩'}], traits:[{id:'forest',name:'永恒之森'}] },
  comps: [{id:'forest-1',name:'森林小法',units:['ornn'],aimTraits:{forest:3}}],
  augments: [],
};
const visible = { stage: '2-1', unit_ids: ['ornn','unknown'], trait_ids: ['forest'], encounter: null };

test('requires service authentication and validates frames before requesting vision', async () => {
  let calls=0;
  const handle=createHandler({ token:'test-token',loadCatalog:async()=>catalog,recognize:async()=>{calls++;return visible;} });
  assert.equal((await handle(req(body,'invalid'))).status,401);
  assert.equal((await handle(req({...body,image:{...image,data:'YWJjZA=='}}))).status,400);
  assert.equal((await handle(req({...body,mode:'final'}))).status,400);
  assert.equal(calls,0);
});
test('scan filters unknown IDs and holds its direction until 2-1 is confirmed', async () => {
  const handle=createHandler({token:'test-token',loadCatalog:async()=>catalog,recognize:async()=>visible});
  const scan=await (await handle(req(body))).json();
  assert.deepEqual(scan.observations.units,[{id:'ornn',name:'奥恩'}]);
  assert.equal(scan.stop,false);
  assert.equal(scan.direction,null);
  const final=await (await handle(req({...body,mode:'final',openingComplete:true}))).json();
  assert.equal(final.stop,true);
  assert.deepEqual(final.direction,{id:'forest-1',name:'森林小法'});
});
test('known later stages never send another image to the model', async () => {
  const handle=createHandler({token:'test-token',loadCatalog:async()=>assert.fail(),recognize:async()=>assert.fail()});
  const stopped=await (await handle(req({...body,stageHint:'2-2'}))).json();
  assert.equal(stopped.stop,true);
  assert.equal(stopped.direction,null);
});
test('upstream payload uses one image and JSON schema with storage disabled', async () => {
  const recognize=createOpenAIRecognizer({apiKey:'mock',model:'vision-fixture',fetchImpl:async(_url,init)=>{
    const payload=JSON.parse(init.body);
    assert.equal(payload.store,false);
    assert.equal(payload.input[0].content[1].image_url,'data:image/png;base64,'+image.data);
    assert.equal(payload.text.format.strict,true);
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(visible)}]}]});
  }});
  assert.deepEqual(await recognize(image,catalog.setData),visible);
});
