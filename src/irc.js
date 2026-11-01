// Twitch IRC parsing is independent of the runtime and never logs chat text.
export function normalizeChannel(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_]{1,25}$/.test(value) ? value.toLowerCase() : null;
}
export function parseIRC(line) {
  if (!line || /[\r\n]/.test(line)) return null;
  const tags = {};
  if (line.startsWith('@')) {
    const end = line.indexOf(' '); if (end < 0) return null;
    for (const tag of line.slice(1, end).split(';')) {
      const i = tag.indexOf('=');
      const key = i < 0 ? tag : tag.slice(0, i);
      tags[key] = (i < 0 ? '' : tag.slice(i + 1)).replace(/\\(.)/g, (_, c) => ({ s: ' ', ':': ';', r: '\r', n: '\n', '\\': '\\' })[c] ?? c);
    }
    line = line.slice(end + 1);
  }
  let prefix = '';
  if (line.startsWith(':')) {
    const end = line.indexOf(' '); if (end < 0) return null;
    prefix = line.slice(1, end); line = line.slice(end + 1);
  }
  const trailing = line.indexOf(' :');
  const text = trailing < 0 ? '' : line.slice(trailing + 2);
  const [command, ...params] = (trailing < 0 ? line : line.slice(0, trailing)).split(' ');
  if (!command) return null;
  const points = [...text], emoteNames = [], positions = new Set();
  for (const group of (tags.emotes || '').split('/')) {
    const [id, ranges] = group.split(':'); if (!id || !ranges) continue;
    for (const range of ranges.split(',')) {
      if (!/^\d+-\d+$/.test(range)) continue;
      const [start, end] = range.split('-').map(Number);
      if (end < start || end >= points.length || positions.has(range)) continue;
      positions.add(range); emoteNames.push(points.slice(start, end + 1).join(''));
    }
  }
  return { command, params, tags, prefix, user: prefix.split('!')[0], channel: params[0]?.replace(/^#/, ''), text, emotes: emoteNames.length, emoteNames };
}
export class IRCBuffer {
  pending = '';
  push(chunk) {
    this.pending += String(chunk);
    const lines = this.pending.split('\r\n'); this.pending = lines.pop();
    if (this.pending.length > 65536) this.pending = '';
    return lines;
  }
}
