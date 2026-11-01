# Architecture and operating boundaries

Personal hackathon entry by **Alan de Bortolo**, built with **OpenAI Codex**. MIT licensed.
Cloudflare's account name is infrastructure ownership, not the entrant's identity.
The actual session ID and the unavailable `/status` command are recorded in `codex-session.txt`.

## Flow

`OBS → Worker /overlay → GET /api/pulse every 3s → CHANNEL.idFromName(lowercase login)`

One SQLite-backed Durable Object class per normalized Twitch login; no database writes.
The object creates an outbound TLS WebSocket to Twitch IRC, requests tags/commands, uses an
anonymous `justinfan` nickname and joins a public channel. PRIVMSG data updates the unchanged
PulseWindow and SpikeDetector. IRCv3 escaping, Unicode emote ranges, fragmented/batched
messages and malformed input are covered by node tests. Third-party emotes not marked by
Twitch's `emotes` tag are not counted.

A heartbeat checks liveness every 15 seconds; PING is answered by PONG. Network failures,
server RECONNECT and stale sockets trigger capped exponential backoff with jitter. No
readers for two minutes closes the socket and timer. In-flight upgrades are also closed if
readers have gone away. Outgoing WebSockets do not support Cloudflare hibernation.
State and spike history reset on eviction or deployment. There is no durable history.

Helix client-credentials tokens are cached in each active object until expiry; metadata is
refreshed every five minutes. A failure resets metadata to unknown rather than claiming an
offline stream. Missing credentials do not block IRC.

## Optional secrets

Use interactive secret input, never put credentials in source, wrangler.toml or shell history:

```sh
npx wrangler secret put TWITCH_CLIENT_ID
npx wrangler secret put TWITCH_CLIENT_SECRET
# Only after the owner authorizes API spend:
npx wrangler secret put OPENAI_API_KEY
```

The deployed version intentionally leaves OpenAI unconfigured: a Codex subscription does
not include OpenAI API inference. The integration is implemented with a five-second timeout,
zero temperature, 30 output tokens, untrusted-chat instructions and a six-word output cap.
Failures keep the heuristic caption. Tests mock the provider; they do not incur API charges.
The caption cannot verify what actually happened on stream. Source labels make this explicit.

Cloudflare uses the existing DesignMaster account and SQLite DO migration, compatible with
the Workers Free offering. No paid plan upgrade or additional paid service was purchased.
Outbound DO sockets consume active duration while connected; this is a hackathon prototype,
not an unlimited free public service. Polling and active channels must stay within the
account's existing quota. Public arbitrary-channel access is intentional; production-scale
abuse limits and a global paid-caption budget are required before enabling a paid key.

## Verification

`npm ci && npm test` (Node 22.15+; Node 26 used during construction). Only Wrangler is added.
The Worker test uses Node's built-in module hooks to read HTML as text, like Wrangler.
`src/pulse.js` and its original ten tests remain unchanged.

Observed red stages: missing IRC parser module, missing captions module, and an in-flight
WebSocket upgrade leaking after idle shutdown. Each was followed by passing tests.
Production API/browser evidence is recorded separately in `VERIFICATION.md`.

Primary protocol references:
- https://dev.twitch.tv/docs/chat/irc/
- https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- https://developers.cloudflare.com/workers/examples/websockets/#write-a-websocket-client
