import { PulseWindow, SpikeDetector } from './pulse.js';
import { parseIRC, IRCBuffer, normalizeChannel } from './irc.js';
import { captionFor, heuristicCaption } from './captions.js';

// Outgoing IRC sockets cannot hibernate. Stop after two minutes without a reader.
export class Channel {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    this.pulse = new PulseWindow(); this.detector = new SpikeDetector();
    this.lines = []; this.spikes = []; this.socket = null; this.connecting = null;
    this.status = 'idle'; this.retryAt = 0; this.attempts = 0;
    this.lastRead = 0; this.lastMessageAt = null; this.lastTraffic = 0;
    this.channel = null; this.timer = null; this.metadata = null; this.metadataUntil = 0;
  }
  async fetch(request) {
    const url = new URL(request.url);
    const channel = normalizeChannel(url.searchParams.get('channel'));
    if (!channel || (this.channel && channel !== this.channel)) return Response.json({error:'Invalid channel'}, {status:400});
    this.channel = channel; this.lastRead = Date.now();
    if (!this.timer) this.timer = setInterval(() => this.tick(), 15_000);
    if (!this.socket && !this.connecting && Date.now() >= this.retryAt) this.ctx.waitUntil(this.connect());
    if (Date.now() >= this.metadataUntil) {
      this.metadataUntil = Date.now() + 300_000;
      this.ctx.waitUntil(this.loadMetadata());
    }
    return Response.json(this.snapshot(), {headers:{'Cache-Control':'no-store'}});
  }
  snapshot(now = Date.now()) {
    // Sampling also re-arms the detector when a previously busy chat goes quiet.
    this.detector.update(this.pulse.hype(now), now);
    return { channel:this.channel, connection:this.status, live:this.metadata?.live ?? null,
      profile:this.metadata ? {name:this.metadata.name, image:this.metadata.image} : null,
      hype:this.pulse.hype(now), mpm:Math.round(this.pulse.messagesPerMin(now)),
      uniqueChatters:this.pulse.uniqueChatters(now), emoteDensity:Number(this.pulse.emoteDensity(now).toFixed(3)),
      lastMessageAt:this.lastMessageAt, lastSpike:this.spikes[0] || null, spikes:this.spikes,
      captionMode:this.env.OPENAI_API_KEY ? 'openai-with-fallback' : 'heuristic', updatedAt:now };
  }
  connect() {
    if (this.connecting) return this.connecting;
    this.status = 'connecting';
    this.connecting = this.openSocket().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async openSocket() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch('https://irc-ws.chat.twitch.tv:443', {
        headers:{Upgrade:'websocket'}, signal:controller.signal
      });
      // Cancel only the handshake deadline, never an established socket.
      clearTimeout(timeout);
      const ws = response.webSocket;
      if (!ws) throw Error('IRC upgrade failed');
      ws.accept();
      if (Date.now() - this.lastRead > 120_000) { ws.close(1000, 'No overlay readers'); this.status='idle'; return; }
      this.socket = ws; this.buffer = new IRCBuffer(); this.lastTraffic = Date.now();
      ws.addEventListener('message', event => {
        if (this.socket !== ws) return;
        this.lastTraffic = Date.now();
        for (const line of this.buffer.push(event.data)) this.receive(line);
      });
      const disconnected = () => { if (this.socket === ws) this.disconnect(); };
      ws.addEventListener('close', disconnected); ws.addEventListener('error', disconnected);
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
      ws.send(`NICK justinfan${Math.floor(Math.random()*900000)+100000}\r\n`);
      ws.send(`JOIN #${this.channel}\r\n`);
    } catch { this.disconnect(); } finally { clearTimeout(timeout); }
  }
  disconnect() {
    const ws = this.socket; this.socket = null;
    try { ws?.close(1000, 'Reconnecting'); } catch { /* already closed */ }
    this.status = 'reconnecting';
    this.retryAt = Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(this.attempts++,6)) + Math.floor(Math.random()*1000);
  }
  tick(now = Date.now()) {
    this.pulse.trim(now); this.lines = this.lines.filter(l => now-l.t <= 60_000);
    this.detector.update(this.pulse.hype(now),now);
    if (now-this.lastRead > 120_000) {
      const ws=this.socket; this.socket=null; try { ws?.close(1000,'No overlay readers'); } catch {}
      clearInterval(this.timer); this.timer=null; this.status='idle'; this.lines=[]; return;
    }
    if (this.socket) {
      if (now-this.lastTraffic > 90_000) { this.disconnect(); return; }
      try { this.socket.send('PING :chat-pulse\r\n'); } catch { this.disconnect(); }
    } else if (!this.connecting && now >= this.retryAt) this.ctx.waitUntil(this.connect());
  }
  receive(line, now = Date.now()) {
    const m = parseIRC(line); if (!m) return;
    if (m.command === 'PING') { this.socket?.send(`PONG :${m.text}\r\n`); return; }
    if (m.command === 'RECONNECT') { this.disconnect(); return; }
    if ((m.command === '366' && m.params.includes(`#${this.channel}`)) || (m.command === 'ROOMSTATE' && m.channel === this.channel)) {
      this.status = 'connected'; this.attempts=0;
    }
    if (m.command !== 'PRIVMSG' || m.channel !== this.channel || !m.user) return;
    this.status='connected'; this.attempts=0; this.lastMessageAt=now;
    this.pulse.add({t:now,user:m.user,emotes:m.emotes});
    this.lines.push({t:now,text:m.text,emoteNames:m.emoteNames});
    this.lines=this.lines.filter(l=>now-l.t<=60_000).slice(-12);
    if (this.detector.update(this.pulse.hype(now),now)) {
      const spike={at:now,caption:heuristicCaption(this.lines),source:'heuristic'};
      this.spikes.unshift(spike); this.spikes=this.spikes.slice(0,5);
      const lines=this.lines.slice();
      this.ctx.waitUntil(captionFor(lines,this.env).then(result=>Object.assign(spike,result)));
    }
  }
  async loadMetadata() {
    if (!this.env.TWITCH_CLIENT_ID || !this.env.TWITCH_CLIENT_SECRET) return;
    try {
      if (!this.token || Date.now() >= this.tokenUntil) {
        const r=await fetch('https://id.twitch.tv/oauth2/token', {method:'POST',signal:AbortSignal.timeout(5000),
          body:new URLSearchParams({client_id:this.env.TWITCH_CLIENT_ID,client_secret:this.env.TWITCH_CLIENT_SECRET,grant_type:'client_credentials'})});
        if (!r.ok) throw Error('Token unavailable');
        const token=await r.json(); this.token=token.access_token; this.tokenUntil=Date.now()+(token.expires_in-60)*1000;
      }
      const headers={'Client-ID':this.env.TWITCH_CLIENT_ID,Authorization:`Bearer ${this.token}`};
      const responses=await Promise.all(['users?login=','streams?user_login='].map(path=>fetch(`https://api.twitch.tv/helix/${path}${this.channel}`,{headers,signal:AbortSignal.timeout(5000)})));
      if (responses.some(r=>!r.ok)) { this.token=null; throw Error('Metadata unavailable'); }
      const [users,streams]=await Promise.all(responses.map(r=>r.json()));
      const user=users.data?.[0];
      this.metadata=user ? {name:user.display_name,image:user.profile_image_url,live:streams.data.length>0} : null;
    } catch { this.metadata=null; }
  }
}
