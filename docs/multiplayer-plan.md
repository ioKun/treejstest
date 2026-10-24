# Multiplayer (P2P) — plan for a future session

Status: planning only, no implementation yet.

## Goal
Add 2-4 player co-op/competitive P2P multiplayer to the existing Three.js + Jolt MT game.
Host-authoritative simulation, P2P data channels (WebRTC). Static hosting on GitHub Pages.

## Non-goals (for v1)
- Do not sync the 10k physics bodies. Each client simulates its own pile.
- No dedicated backend. Signaling only (PeerJS public cloud or self-hosted later).
- No anti-cheat beyond basic sanity checks.

## Architecture
- Signaling: PeerJS (free cloud) for room codes. Room = host peer id.
- Transport: WebRTC data channels, unreliable for high-frequency state, reliable for events.
- Authority: host runs authoritative sim (physics + game rules). Clients send inputs, receive snapshots.
- Client prediction: local player movement predicted, reconciled with host snapshots.
- Sync scope (v1):
  - Players: position, rotation, velocity, held object type.
  - Events: grab/throw/drop, black hole/portal/tornado creation, object removed count, victory.
  - NOT synced: individual 10k bodies. Each client keeps own pile; removed count shared.
- Desync handling: host broadcasts `removed` and `totalObjects`; clients trust counts. Visual piles differ but score consistent.

## Important project constraints (from AGENTS.md)
- ES modules only, no new deps without request (PeerJS is new dep -> needs explicit approval).
- `window.__game`, `window.__gameApi` contracts must stay (tests).
- Fixed step order in loop.js must not change without separate task.
- Jolt aliased getters: read components immediately.
- Layers: 0 non-moving, 1 moving, 2 portal, 3 stuck.

## Integration points
- `src/state.js`: add `multiplayer: { role, roomId, peers, connected }`.
- `src/network/` new domain module: signaling, connection, send/receive, serialization.
- `src/loop.js`: host broadcasts snapshot at fixed rate (e.g. 20 Hz); clients apply remote player states.
- `src/game/player.js`: separate local vs remote players; remote players rendered as stickmen.
- `src/ui/menu.js`: add "MULTIPLAYER" section: create/join room, show peer list, ready.
- `src/ui/hud.js`: show ping/player count.

## Data model (messages)
- `hello { name }`
- `input { seq, keys, yaw, pitch, grab, throw, drop }` (client -> host)
- `snapshot { tick, players: [{id,x,y,z,yaw,pitch,held}], removed, total }` (host -> clients)
- `event { type, ... }` reliable: grab/throw/drop/absorb/vanish/victory

## Phases
1. Signaling + room create/join UI, connection status.
2. Host-authoritative player movement sync (2 players).
3. Remote player rendering (stickman instances).
4. Shared events (throws create black holes/portals/tornadoes on all clients).
5. Shared score/victory (host detects all removed -> broadcast victory).
6. Polish: reconnect, host migration (optional), latency display.

## Risks
- PeerJS cloud reliability; consider self-hosted signaling later.
- NAT traversal failures for some users.
- No server validation -> cheating possible.

## Test plan (manual)
- Two browsers on localhost, create/join room, move, throw, score sync, victory triggers on all.
- Existing single-player tests must still pass.

## Prompt for new session
See below.
EOF
echo done