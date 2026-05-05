import { describe, expect, it } from 'vitest';

import { createGame } from '../src/game/engine/createGame.js';
import { ROLES } from '../src/game/data/roles.js';
import { TransportEventFactory } from '../src/transport/eventFactory.js';
import { HostAuthority } from '../src/transport/hostAuthority.js';
import { LocalBus } from '../src/transport/localBus.js';
import { createEphemeralTransportSession } from '../src/transport/session.js';
import { toRelayWebSocketUrl } from '../src/transport/nostrRelayBus.js';
import type { StateSnapshot, TransportEvent } from '../src/transport/types.js';

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

  it('traegt host-autoritativen game-created und state-sync-flow', async () => {
    const bus = new LocalBus();
    const hostSession = createEphemeralTransportSession(true);
    const joinerSession = createEphemeralTransportSession(false);
    const joinerFactory = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerSession.clientInfo,
    });
    const hostSnapshot: StateSnapshot = {
      state: createGame(),
      lastAppliedSeqByPlayer: {},
      roleOwners: {},
    };
    const received: TransportEvent[] = [];

    const unsubscribe = bus.subscribe('game-1', (event) => {
      received.push(event);
    });

    const hostAuthority = new HostAuthority({
      bus,
      gameId: 'game-1',
      session: hostSession,
      rulesVersion: 'v1',
      maxPlayers: 6,
      validRoleIds: ROLES.map((role) => role.id),
      getCurrentRoundId: () => 'round-0',
      getAuthoritativeSnapshot: () => hostSnapshot,
    });

    hostAuthority.start();
    await hostAuthority.publishGameCreated();
    await Promise.resolve();

    await bus.publish(
      joinerFactory.createStateSyncRequested({
        roundId: 'round-0',
        knownRoundId: 'round-0',
        knownSeqByPlayer: {},
      })
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(received.find((event) => event.eventName === 'game-created')).toMatchObject({
      eventName: 'game-created',
      hostPlayerId: hostSession.clientInfo.playerId,
    });

    expect(received.find((event) => event.eventName === 'state-sync-sent')).toMatchObject({
      eventName: 'state-sync-sent',
      authoritativePlayerId: hostSession.clientInfo.playerId,
      snapshot: hostSnapshot,
    });

    hostAuthority.stop();
    unsubscribe();
    bus.destroy();
  });

  it('bestaetigt freie Rollen autoritativ und lehnt doppelte Claims ab', async () => {
    const bus = new LocalBus();
    const hostSession = createEphemeralTransportSession(true);
    const joinerA = createEphemeralTransportSession(false);
    const joinerB = createEphemeralTransportSession(false);
    const factoryA = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerA.clientInfo,
    });
    const factoryB = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerB.clientInfo,
    });
    const hostSnapshot: StateSnapshot = {
      state: createGame(),
      lastAppliedSeqByPlayer: {},
      roleOwners: {},
    };
    const received: TransportEvent[] = [];

    const unsubscribe = bus.subscribe('game-1', (event) => {
      received.push(event);
    });

    const hostAuthority = new HostAuthority({
      bus,
      gameId: 'game-1',
      session: hostSession,
      rulesVersion: 'v1',
      maxPlayers: 6,
      validRoleIds: ROLES.map((role) => role.id),
      getCurrentRoundId: () => 'round-0',
      getAuthoritativeSnapshot: () => hostSnapshot,
    });

    hostAuthority.start();

    await bus.publish(
      factoryA.createRoleClaimRequested({
        roundId: 'round-0',
        roleId: 'buergerin',
      })
    );
    await Promise.resolve();
    await Promise.resolve();

    await bus.publish(
      factoryB.createRoleClaimRequested({
        roundId: 'round-0',
        roleId: 'buergerin',
      })
    );
    await Promise.resolve();
    await Promise.resolve();

    const acceptedClaim = received.find(
      (event) =>
        event.eventName === 'role-claimed' &&
        event.claimStatus === 'accepted' &&
        event.claimedByPlayerId === joinerA.clientInfo.playerId
    );
    const rejectedClaim = received.find(
      (event) =>
        event.eventName === 'role-claimed' &&
        event.claimStatus === 'rejected' &&
        event.claimedByPlayerId === joinerB.clientInfo.playerId
    );

    expect(acceptedClaim).toMatchObject({
      eventName: 'role-claimed',
      claimStatus: 'accepted',
      roleId: 'buergerin',
      authoritativePlayerId: hostSession.clientInfo.playerId,
    });

    expect(rejectedClaim).toMatchObject({
      eventName: 'role-claimed',
      claimStatus: 'rejected',
      roleId: 'buergerin',
      rejectionReason: 'ROLE_ALREADY_TAKEN',
      authoritativePlayerId: hostSession.clientInfo.playerId,
    });

    hostAuthority.stop();
    unsubscribe();
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