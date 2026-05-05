import { describe, expect, it } from 'vitest';

import { LocalBus } from '../src/transport/localBus.js';
import { createEphemeralTransportSession } from '../src/transport/session.js';
import { toRelayWebSocketUrl } from '../src/transport/nostrRelayBus.js';
import type { TransportEvent } from '../src/transport/types.js';

const BASE_EVENT: TransportEvent = {
  eventName: 'game-created',
  gameId: 'game-1',
  roundId: 'round-0',
  playerId: 'player-1',
  seq: 1,
  sentAt: Date.now(),
  actorPubkey: 'pubkey-1',
  protocolVersion: 1,
  hostPlayerId: 'player-1',
  rulesVersion: 'v1',
  maxPlayers: 6,
};

describe('LocalBus', () => {
  it('liefert Events nur an Abonnenten derselben gameId', async () => {
    const bus = new LocalBus();
    const received: TransportEvent[] = [];

    const unsubscribe = bus.subscribe('game-1', (event) => {
      received.push(event);
    });

    bus.subscribe('game-2', () => {
      throw new Error('falsche gameId hat Event erhalten');
    });

    await bus.publish(BASE_EVENT);
    await Promise.resolve();

    expect(received).toEqual([BASE_EVENT]);

    unsubscribe();
    bus.destroy();
  });

  it('stoppt Zustellung nach unsubscribe', async () => {
    const bus = new LocalBus();
    const received: TransportEvent[] = [];

    const unsubscribe = bus.subscribe('game-1', (event) => {
      received.push(event);
    });

    unsubscribe();
    await bus.publish(BASE_EVENT);
    await Promise.resolve();

    expect(received).toEqual([]);

    bus.destroy();
  });
});

describe('createEphemeralTransportSession', () => {
  it('erzeugt playerId, pubkey und Secret fuer eine Sitzung', () => {
    const session = createEphemeralTransportSession(true);

    expect(session.clientInfo.playerId).toBeTruthy();
    expect(session.clientInfo.pubkey).toBeTruthy();
    expect(session.clientInfo.isHost).toBe(true);
    expect(session.secretKey).toBeInstanceOf(Uint8Array);
  });
});

describe('toRelayWebSocketUrl', () => {
  it('wandelt http in ws um', () => {
    expect(toRelayWebSocketUrl('http://localhost:7000/')).toBe('ws://localhost:7000/');
  });

  it('laesst bestehende ws-urls unveraendert', () => {
    expect(toRelayWebSocketUrl('ws://localhost:7000/')).toBe('ws://localhost:7000/');
  });
});