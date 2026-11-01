# Add Chat Pulse to OBS

1. In **Sources**, click **+ → Browser**, name it **Chat Pulse** and click OK.
2. Paste `https://chat-pulse.designmaster.workers.dev/overlay?channel=gaules`.
   Replace `gaules` with the Twitch login, without `@` or `#`.
3. Set **Width: 1920**, **Height: 1080**, **FPS: 30**. The page background is transparent;
   the instrument sits at the bottom right. Keep the source above your gameplay source.
4. Enable **Shutdown source when not visible** to stop unused polling. The server closes
   its read-only Twitch connection after two minutes without a reader.
5. Wait for **Chat connected**. Numbers cover the latest 60 seconds, starting when this
   channel's collector connected. The first moments are a warm-up, not historical data.
6. To switch channels, edit the URL in source properties. Use **Refresh cache of current
   page** if OBS has an older version. No Twitch login is needed for the overlay.

## Reading the instrument

- **Hype:** the existing bounded 0–100 formula in `src/pulse.js`, not an emotion classifier.
- **Messages/min:** rate estimated from the rolling window (can be high during warm-up).
- **Chatters:** unique IRC users observed in that rolling minute, not viewers.
- **Spike log:** up to five recent spikes, newest first, with your browser's local time.
- **Chat pattern:** deterministic emote-based fallback. It does not infer a gameplay event.
- **AI interpretation:** optional generated caption, at most six words; may be inaccurate.
- **Live status unknown:** Twitch app credentials are not available or Helix failed.
  A connected IRC room does not establish whether the video stream is live.

## Troubleshooting

**Joining / reconnecting:** the collector retries automatically with exponential backoff.
**Updates interrupted:** API/network failed; live values become dashes while polling retries.
**Connected, zero messages:** the room may be quiet, offline, nonexistent, or Twitch may not
be delivering chat. Do not interpret zero as proof that the stream is offline.
**No photo:** optional Helix credentials are absent, invalid, or temporarily unavailable.
**No spike yet:** a spike must cross 70 hype, fall below 60 before re-arming, and respect
20 seconds of cooldown. Refreshing the overlay does not manufacture a spike.

No raw messages or usernames are rendered or exposed by the API. The collector holds up to
12 recent lines in memory for at most a minute. If the owner enables OpenAI, those lines
(without usernames) are sent to OpenAI for captioning. Leave the key unset for no AI API calls.
