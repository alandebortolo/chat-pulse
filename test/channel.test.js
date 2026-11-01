import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Channel} from '../src/channel.js';
function setup(){const jobs=[];const c=new Channel({waitUntil:p=>jobs.push(p)},{});c.channel='gaules';return {c,jobs};}
test('IRC events update pulse, keep channels isolated, never expose raw messages', async()=>{
 const {c,jobs}=setup(); const now=Date.now();
 for(let i=0;i<8;i++) c.receive(`@emotes=25:0-4 :u${i}!u@h PRIVMSG #gaules :Kappa private-text-${i}`,now+i);
 c.receive(':alien!a@h PRIVMSG #other :ignored',now+9);
 await Promise.all(jobs);const data=c.snapshot(now+10);
 assert.equal(data.uniqueChatters,8);assert.equal(data.emoteDensity,1);assert.equal(data.spikes.length,1);
 assert.equal(data.lastSpike.caption,'Kappa surge');assert.ok(!JSON.stringify(data).includes('private-text'));
 assert.equal(data.live,null);
});
test('server PING receives PONG, JOIN acknowledgement connects, reconnect uses backoff',()=>{
 const {c}=setup();const sent=[];c.socket={send:x=>sent.push(x),close(){}};
 c.receive('PING :tmi.twitch.tv'); assert.deepEqual(sent,['PONG :tmi.twitch.tv\r\n']);
 c.receive(':tmi.twitch.tv 366 justinfan123 #gaules :End of /NAMES list'); assert.equal(c.status,'connected');
 c.receive('RECONNECT');assert.equal(c.status,'reconnecting');assert.equal(c.socket,null);assert.ok(c.retryAt>Date.now());
});
test('idle channel releases socket and raw chat',()=>{
 const {c}=setup();let closed=false;c.socket={close(){closed=true;}};c.lastRead=1;c.lines=[{t:2,text:'private'}];
 c.tick(130_000);assert.ok(closed);assert.equal(c.status,'idle');assert.equal(c.lines.length,0);assert.equal(c.timer,null);
});
test('an upgrade completing after idle shutdown must not leave an orphan socket',async()=>{
 const {c}=setup();let finish,closed=false;const previous=globalThis.fetch;
 globalThis.fetch=()=>new Promise(resolve=>{finish=resolve;});
 try{
  const job=c.connect();c.lastRead=0;c.tick(Date.now());
  finish({webSocket:{accept(){},addEventListener(){},send(){},close(){closed=true;}}});
  await job;assert.equal(c.socket,null);assert.ok(closed);
 }finally{globalThis.fetch=previous;}
});
test('handshake timeout is cancelled once the WebSocket is established',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});
 // Model AbortSignal.timeout through the same test clock, including the prior implementation.
 t.mock.method(AbortSignal,'timeout',ms=>{const controller=new AbortController();setTimeout(()=>controller.abort(),ms);return controller.signal;});
 const {c}=setup();c.lastRead=Date.now();let signal;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{signal=options.signal;return {webSocket:{accept(){},addEventListener(){},send(){},close(){}}};});
 await c.connect();t.mock.timers.tick(10_001);assert.equal(signal.aborted,false);
 c.disconnect();
});
