# Verification, 2026-10-31 (America/Sao_Paulo)

## Build and deploy

- Built in Codex session `01a194c5-9b43-7593-9254-68beb2564a61`.
- `npm test`: **26 passed, 0 failed**, including the ten untouched original pulse tests.
  Full output: `test-results.txt`.
- Parser tests first failed with `ERR_MODULE_NOT_FOUND`, then passed after implementation.
- A lifecycle test reproduced an orphan socket when an upgrade completed after idle shutdown.
- A handshake regression test was also run against the old timeout behavior in an isolated
  `/tmp` copy: red (`handshake-red.txt`), then green against the fixed source. Handshake
  deadlines are cleared after upgrade so an established socket is not aborted ten seconds later.
- `avoid-ai-design`: six files scanned, zero P0/P1/P2 findings after adjustment.
- `git diff --check`: clean. `src/pulse.js` and `test/pulse.test.js` have no diff.
- Worker: https://chat-pulse.designmaster.workers.dev
- Deployed version: `bd3a8cab-6b87-4d54-8e0c-2b66189f48f9`.
- Upload: 24.33 KiB (8.47 KiB gzip); reported startup: 2 ms.

## Real Twitch data

`curl` called `/api/pulse?channel=gaules` and `/api/pulse?channel=kaise`.
The Gaules Twitch page displayed **AO VIVO**, a rerun and 354 viewers at the time of inspection;
its chat delivered no messages in the observation window. It was not labeled offline.
Kaise appeared in Twitch's live directory at approximately 14.8k viewers. Anonymous IRC
then delivered real PRIVMSG events, distinct chatters, emotes and spikes. See
`pulse-kaise.json` and the timed observations in `live-continuity.json`.
No chat message was sent, no synthetic event was injected into production.
API `live: null` is intentional: optional Helix credentials are not installed.

## Browser checks

- Real Galaxy S25: opened published overlay, waited for connection, checked transparent
  computed body background and no horizontal overflow, reloaded and observed live metrics.
  Reusable command: `scripts/verify-live.sh kaise`; captured output: `live-smoke.txt`.
- Real iPad mini: opened published overlay and inspected screenshot showing real metrics
  and the `esfandLUL surge` spike.
- The S25 had **DeX disabled** and rejected 1920px. Four responsive widths (360, 820, 1180,
  1600) and the OBS 1920x1080 canvas were instead rendered with `browse cf`, not falsely
  reported as four physical-device widths.
- All screenshots were opened and visually inspected. Local evidence:
  `/tmp/chat-pulse-live.png`, `/tmp/chat-pulse-ipad-live.png`,
  `/tmp/chat-pulse-final-360.png`, `/tmp/chat-pulse-final-820.png`,
  `/tmp/chat-pulse-final-1180.png`, `/tmp/chat-pulse-final-1600.png`,
  `/tmp/chat-pulse-obs-final.png`.
- Transparent pages appear black in browser screenshots. Computed CSS was verified as
  `rgba(0, 0, 0, 0)`. A capture inside OBS itself was not performed.
- `prefers-reduced-motion` disables transitions and arrival animation; no animation library.

## Explicit limits

- No OpenAI secret installed and no paid inference performed. The optional implementation
  is verified with mocks, not a real paid OpenAI request. Live captions are heuristic.
- No Twitch app secrets installed. The developer console presented **Entrar**; registration
  under CabeceadorES was left pending per the user's optional-integration boundary.
  Name/photo and authoritative API live status therefore remain unverified in production.
- `/status` is an interactive Codex command unavailable through this session's shell;
  its attempted execution failed. The session identifier comes from the actual runtime
  environment, documented in `codex-session.txt`.
- This work prepares the project; it does not submit a Devpost entry or claim event eligibility.
