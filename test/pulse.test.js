import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PulseWindow, SpikeDetector, clamp01 } from '../src/pulse.js';

test('clamp01 bounds and handles NaN', () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(NaN), 0);
});

test('window trims events older than windowMs', () => {
  const w = new PulseWindow({ windowMs: 10_000, bucketMs: 2_000 });
  w.add({ t: 0, user: 'a', emotes: 0 });
  w.add({ t: 5_000, user: 'b', emotes: 0 });
  w.add({ t: 20_000, user: 'c', emotes: 0 }, 20_000);
  // at t=20s, the t=0 and t=5s events are outside the 10s window
  assert.equal(w.events.length, 1);
  assert.equal(w.events[0].user, 'c');
});

test('uniqueChatters counts distinct users in window', () => {
  const w = new PulseWindow({ windowMs: 60_000 });
  const now = 10_000;
  w.add({ t: 1_000, user: 'a', emotes: 0 });
  w.add({ t: 2_000, user: 'a', emotes: 0 });
  w.add({ t: 3_000, user: 'b', emotes: 0 });
  assert.equal(w.uniqueChatters(now), 2);
});

test('emoteDensity is emotes per message', () => {
  const w = new PulseWindow({ windowMs: 60_000 });
  w.add({ t: 1_000, user: 'a', emotes: 2 });
  w.add({ t: 2_000, user: 'b', emotes: 0 });
  assert.equal(w.emoteDensity(3_000), 1);
});

test('empty window has zero hype and zero density', () => {
  const w = new PulseWindow();
  assert.equal(w.hype(1000), 0);
  assert.equal(w.emoteDensity(1000), 0);
});

test('hype rises with a sustained busy chat', () => {
  const w = new PulseWindow({ windowMs: 60_000, bucketMs: 2_000 });
  // 200 messages spread across the last 60s from many users = busy
  for (let i = 0; i < 200; i++) {
    w.add({ t: i * 300, user: 'u' + (i % 50), emotes: i % 3 === 0 ? 1 : 0 });
  }
  const h = w.hype(60_000);
  assert.ok(h > 50, `expected busy hype > 50, got ${h}`);
  assert.ok(h <= 100);
});

test('hype stays low for a quiet chat', () => {
  const w = new PulseWindow({ windowMs: 60_000, bucketMs: 2_000 });
  w.add({ t: 1_000, user: 'a', emotes: 0 });
  w.add({ t: 30_000, user: 'b', emotes: 0 });
  w.add({ t: 55_000, user: 'c', emotes: 0 });
  assert.ok(w.hype(60_000) < 30);
});

test('acceleration spikes when a burst arrives at the end', () => {
  const w = new PulseWindow({ windowMs: 60_000, bucketMs: 2_000 });
  // steady low background
  for (let i = 0; i < 20; i++) w.add({ t: i * 2_000, user: 'u' + i, emotes: 0 });
  const steady = w.acceleration(40_000);
  // sudden burst in the last 6s
  for (let i = 0; i < 40; i++) w.add({ t: 40_000 + i * 100, user: 'x' + i, emotes: 1 }, 44_000);
  const bursting = w.acceleration(44_000);
  assert.ok(bursting > steady, `burst accel ${bursting} should exceed steady ${steady}`);
});

test('spike detector fires once then needs re-arm', () => {
  const d = new SpikeDetector({ threshold: 70, cooldownMs: 20_000 });
  assert.equal(d.update(80, 0), true, 'first crossing fires');
  assert.equal(d.update(85, 1_000), false, 'still high, already fired');
  assert.equal(d.update(90, 25_000), false, 'cooldown passed but not re-armed');
  assert.equal(d.update(50, 26_000), false, 'drop below threshold-10 re-arms');
  assert.equal(d.update(80, 60_000), true, 're-armed and past cooldown fires again');
});

test('spike detector respects cooldown even after re-arm', () => {
  const d = new SpikeDetector({ threshold: 70, cooldownMs: 20_000 });
  assert.equal(d.update(80, 0), true);
  assert.equal(d.update(30, 1_000), false); // re-arms
  assert.equal(d.update(80, 5_000), false, 'within cooldown, no fire despite re-arm');
  assert.equal(d.update(80, 21_000), true, 'cooldown elapsed, fires');
});
