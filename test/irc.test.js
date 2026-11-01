import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIRC, IRCBuffer, normalizeChannel } from '../src/irc.js';

test('extracts user, channel, text and repeated emote occurrences', () => {
  const m = parseIRC('@display-name=Alan;emotes=25:0-4,6-10/1902:12-16 :alan!alan@alan.tmi.twitch.tv PRIVMSG #gaules :Kappa Kappa Keepo');
  assert.equal(m.user, 'alan'); assert.equal(m.channel, 'gaules');
  assert.equal(m.text, 'Kappa Kappa Keepo'); assert.equal(m.emotes, 3);
  assert.deepEqual(m.emoteNames, ['Kappa', 'Kappa', 'Keepo']);
});
test('decodes IRCv3 escapes without confusing a literal backslash', () => {
  const m = parseIRC('@display-name=Alan\\sB;custom=a\\:b\\\\s :a!a@h PRIVMSG #x :hello :there');
  assert.equal(m.tags['display-name'], 'Alan B'); assert.equal(m.tags.custom, 'a;b\\s');
  assert.equal(m.text, 'hello :there'); assert.equal(m.emotes, 0);
});
test('rejects malformed emote ranges and handles unicode code points', () => {
  const m = parseIRC('@emotes=25:2-6,bad,8-2,90-99 :a!a@h PRIVMSG #x :😀 Kappa');
  assert.equal(m.emotes, 1); assert.deepEqual(m.emoteNames, ['Kappa']);
});
test('PING, notices, empty tags and malformed lines are safe', () => {
  assert.equal(parseIRC('PING :tmi.twitch.tv').text, 'tmi.twitch.tv');
  assert.equal(parseIRC(':tmi.twitch.tv RECONNECT').command, 'RECONNECT');
  assert.equal(parseIRC('@emotes= :u!u@h PRIVMSG #x :hi').emotes, 0);
  assert.equal(parseIRC(''), null);
});
test('buffers split lines and multiple IRC messages', () => {
  const b = new IRCBuffer();
  assert.deepEqual(b.push('PING :tmi.'), []);
  assert.deepEqual(b.push('twitch.tv\r\nPONG :x\r\nPART'), ['PING :tmi.twitch.tv','PONG :x']);
  assert.deepEqual(b.push(' #x\r\n'), ['PART #x']);
});
test('bounds incomplete buffers and validates channel names', () => {
  const b = new IRCBuffer(); b.push('a'.repeat(70_000)); assert.ok(b.pending.length < 65536);
  assert.equal(normalizeChannel('Gaules'), 'gaules');
  for (const name of ['', '#foo', 'x\r\nJOIN #evil', '<script>', 'x'.repeat(26)]) assert.equal(normalizeChannel(name), null);
});
