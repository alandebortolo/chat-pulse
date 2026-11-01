# Chat Pulse

A live **OBS browser-source overlay** that reads any public Twitch channel's chat and
shows the room's *pulse* in real time: messages per minute, a rolling hype gauge, and
automatic **hype-spike callouts**. When chat erupts, Chat Pulse detects the spike from the
burst of messages and emotes and writes a one-line caption of what most likely set it off,
by reading the last few seconds of chat.

The streamer drops one URL into OBS as a Browser Source and nothing else — no OAuth, no bot
account, no install. Chat Pulse joins chat read-only (anonymous Twitch IRC) and calls the
Twitch Helix API with an app token for channel metadata.

Built for the **Codex x TwitchCon Hackathon** with OpenAI Codex.

## Why it helps a stream

- The streamer gets a glanceable read of how the room is reacting *right now*, without
  taking their eyes off the game.
- Every hype spike is pinned with a short, human caption ("Clutch 1v3 ace" / "Donation
  train" / "First-time chatter raid"), so highlights are easy to clip after the stream.
- Viewers see their own energy reflected back on the overlay, which feeds the feedback loop
  that makes chat lean in.

## How it connects to Twitch

- **Chat (read-only):** anonymous IRC over WebSocket (`wss://irc-ws.chat.twitch.tv`,
  `justinfan` login). No viewer or streamer credentials required to read a public channel.
- **Helix API:** an app-only OAuth token (client credentials grant) resolves the channel's
  display name, profile image and live status for the overlay header.
- **Overlay:** a single HTML page sized for a 1920x1080 OBS Browser Source, transparent
  background, added as a source with `?channel=<login>`.

## Architecture

- **Cloudflare Worker** serves the overlay and a small JSON API.
- **Durable Object** (one per channel) keeps the rolling window of chat events, computes the
  pulse (messages/min, emote density, unique chatters) and runs spike detection.
- **Spike captions** are produced by an LLM step (OpenAI) given the last N chat lines around
  the spike; the prompt is deterministic and the raw lines are never shown, only the caption.
- No database; state lives in the Durable Object for the length of the session.

## What is measured, honestly

- Messages/min and unique chatters are counted from the live IRC stream.
- The hype gauge is a transparent function of message rate, emote rate and the rate of
  change — the formula is in `src/pulse.js` and covered by tests.
- Spike captions are a best-effort summary of chat text, not a claim of fact about the game.

## Status

Scaffold in this repo. The Worker, Durable Object, overlay and the full build are being
implemented with OpenAI Codex (session ID recorded for the submission).

## Run locally

```
npm install
npm test        # pulse math + spike detector
npx wrangler dev # serves the overlay and API
```

Then add `http://127.0.0.1:8787/overlay?channel=<any_public_channel>` as a Browser Source.
