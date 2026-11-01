// Chat Pulse — pure pulse math and spike detection.
// No I/O here so it can be unit-tested without a network or Twitch connection.

/**
 * A rolling window of chat events used to compute the live "pulse".
 * Each event: { t: epoch ms, user: string, emotes: number }
 */
export class PulseWindow {
  /**
   * @param {object} opts
   * @param {number} opts.windowMs   how far back the rolling window looks (default 60s)
   * @param {number} opts.bucketMs   resolution of the rate buckets (default 2s)
   */
  constructor({ windowMs = 60_000, bucketMs = 2_000 } = {}) {
    this.windowMs = windowMs;
    this.bucketMs = bucketMs;
    /** @type {{t:number,user:string,emotes:number}[]} */
    this.events = [];
  }

  /** Add a chat message. `emotes` is how many emotes the message carried. */
  add(event, now = event.t) {
    this.events.push(event);
    this.trim(now);
  }

  /** Drop events older than the window. */
  trim(now) {
    const cutoff = now - this.windowMs;
    let i = 0;
    while (i < this.events.length && this.events[i].t < cutoff) i++;
    if (i > 0) this.events.splice(0, i);
  }

  /** Messages per minute over the window. */
  messagesPerMin(now = Date.now()) {
    this.trim(now);
    const span = Math.min(this.windowMs, Math.max(this.bucketMs, now - this.firstT(now)));
    return (this.events.length / span) * 60_000;
  }

  firstT(now) {
    return this.events.length ? this.events[0].t : now;
  }

  /** Count of distinct chatters in the window. */
  uniqueChatters(now = Date.now()) {
    this.trim(now);
    return new Set(this.events.map((e) => e.user)).size;
  }

  /** Emotes per message in the window (0 when empty). */
  emoteDensity(now = Date.now()) {
    this.trim(now);
    if (!this.events.length) return 0;
    const emotes = this.events.reduce((s, e) => s + (e.emotes || 0), 0);
    return emotes / this.events.length;
  }

  /**
   * Hype gauge in [0,100]. Transparent, bounded blend of:
   *  - message rate vs a reference busy rate,
   *  - emote density,
   *  - short-term acceleration (recent bucket vs window average).
   * The weights are fixed and documented; this is not a learned model.
   */
  hype(now = Date.now(), refRate = 120 /* msgs/min considered "busy" */) {
    this.trim(now);
    if (this.events.length < 3) return 0;
    const rate = this.messagesPerMin(now);
    const rateScore = clamp01(rate / refRate);
    const emoteScore = clamp01(this.emoteDensity(now) / 2); // 2 emotes/msg = max
    const accel = clamp01(this.acceleration(now));
    const score = 0.5 * rateScore + 0.2 * emoteScore + 0.3 * accel;
    return Math.round(clamp01(score) * 100);
  }

  /**
   * Acceleration: recent bucket rate over the window-average rate, mapped to [0,1].
   * 1x (steady) -> ~0, 3x (sudden burst) -> ~1.
   */
  acceleration(now = Date.now()) {
    this.trim(now);
    const recentCutoff = now - this.bucketMs * 3; // last ~6s
    const recent = this.events.filter((e) => e.t >= recentCutoff).length;
    // A single straggler in a dead chat is not acceleration: require a floor of
    // recent volume before the ratio counts, so quiet chats stay quiet.
    if (recent < 5) return 0;
    const recentRate = recent / (this.bucketMs * 3);
    const avgRate = this.events.length / this.windowMs;
    if (avgRate <= 0) return 0;
    const ratio = recentRate / avgRate;
    return (ratio - 1) / 2; // 1x->0, 3x->1
  }
}

export function clamp01(x) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Spike detector with a cooldown so one eruption does not fire ten callouts.
 */
export class SpikeDetector {
  /**
   * @param {object} opts
   * @param {number} opts.threshold  hype value that counts as a spike (default 70)
   * @param {number} opts.cooldownMs min gap between callouts (default 20s)
   */
  constructor({ threshold = 70, cooldownMs = 20_000 } = {}) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.lastFired = -Infinity;
    this.armed = true;
  }

  /**
   * Feed the current hype value. Returns true exactly once per spike,
   * after which it must drop below threshold-10 to re-arm.
   */
  update(hype, now = Date.now()) {
    if (hype >= this.threshold && this.armed && now - this.lastFired >= this.cooldownMs) {
      this.lastFired = now;
      this.armed = false;
      return true;
    }
    if (hype < this.threshold - 10) this.armed = true;
    return false;
  }
}
