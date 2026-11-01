import overlay from './overlay.html';
import { normalizeChannel } from './irc.js';
export { Channel } from './channel.js';
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return new Response('Method not allowed', {status:405,headers:{Allow:'GET'}});
    if (url.pathname === '/') return Response.redirect(`${url.origin}/overlay?channel=gaules`,302);
    if (!['/overlay','/api/pulse'].includes(url.pathname)) return new Response('Not found',{status:404});
    const channel = normalizeChannel(url.searchParams.get('channel'));
    if (!channel) return Response.json({error:'Use ?channel=<Twitch login>, 1–25 letters, digits or underscores.'},{status:400});
    if (url.pathname === '/overlay') return new Response(overlay, {headers:{
      'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-cache',
      'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src https://static-cdn.jtvnw.net; base-uri 'none'; form-action 'none'",
      'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'
    }});
    const id = env.CHANNEL.idFromName(channel);
    try {
      return await env.CHANNEL.get(id).fetch(`https://channel/api/pulse?channel=${channel}`);
    } catch {
      return Response.json({error:'Chat connection unavailable. Retrying shortly.'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'5'}});
    }
  }
};
