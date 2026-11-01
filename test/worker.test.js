import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
const hooks=registerHooks({load(url,context,next){
 if(url.endsWith('/overlay.html')) return {format:'module',source:`export default ${JSON.stringify(readFileSync(new URL(url),'utf8'))}`,shortCircuit:true};
 return next(url,context);
}});
const {default:worker}=await import('../src/worker.js');hooks.deregister();
test('routes normalize channel identity and reject injections before accessing a DO',async()=>{
 let name;const env={CHANNEL:{idFromName:n=>{name=n;return n;},get:id=>({fetch:async url=>Response.json({id,url})})}};
 const r=await worker.fetch(new Request('https://test/api/pulse?channel=Gaules'),env);
 assert.equal(name,'gaules');assert.equal((await r.json()).id,'gaules');
 for(const query of ['', '?channel=%3Cscript%3E','?channel=x%0AJOIN']) assert.equal((await worker.fetch(new Request('https://test/api/pulse'+query),{})).status,400);
});
test('overlay is transparent and reduced-motion aware; routes return honest errors',async()=>{
 const response=await worker.fetch(new Request('https://test/overlay?channel=gaules'),{});
 assert.equal(response.status,200);const html=await response.text();
 assert.match(html,/background:transparent/);assert.match(html,/prefers-reduced-motion/);
 assert.match(html,/Updates interrupted/);assert.match(response.headers.get('Content-Security-Policy'),/default-src 'none'/);
 assert.equal((await worker.fetch(new Request('https://test/nope'),{})).status,404);
 assert.equal((await worker.fetch(new Request('https://test/api/pulse?channel=gaules',{method:'POST'}),{})).status,405);
 const env={CHANNEL:{idFromName:n=>n,get:()=>({fetch:async()=>{throw Error('failed')}})}};
 assert.equal((await worker.fetch(new Request('https://test/api/pulse?channel=gaules'),env)).status,503);
});
