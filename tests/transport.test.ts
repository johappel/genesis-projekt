import { describe, expect, it, vi } from 'vitest';

import { createGame } from '../src/game/engine/createGame.js';
import { PAKT_ARTICLE_IDS } from '../src/game/engine/pakt.js';
import { ROLES } from '../src/game/data/roles.js';
import { LENSES } from '../src/game/data/lenses.js';
import { TransportEventFactory } from '../src/transport/eventFactory.js';
import { HostAuthority } from '../src/transport/hostAuthority.js';
import { LocalBus } from '../src/transport/localBus.js';
import { createEphemeralTransportSession } from '../src/transport/session.js';
import { toRelayWebSocketUrl } from '../src/transport/nostrRelayBus.js';
import { createRelayJoinUrl, formatRelayIssueMessage, readMultiplayerUrlConfig } from '../src/transport/runtime.js';
import type { StateSnapshot, TransportEvent } from '../src/transport/types.js';
import type { PaktArticleId } from '../src/game/types.js';

function createResetSnapshot(): StateSnapshot {
  return {
    state: createGame(),
    lastAppliedSeqByPlayer: {},
    roleOwners: {},
    phaseStartedAt: null,
    pendingRoundClose: null,
  };
}

function createPaktAnswers(prefix: string): Record<PaktArticleId, string> {
  return Object.fromEntries(
    PAKT_ARTICLE_IDS.map((articleId, index) => [articleId, `${prefix} Artikel ${index + 1}`])
  ) as Record<PaktArticleId, string>;
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function mockSessionEnvironment(navigationType: 'navigate' | 'reload' | 'back_forward'): {
  restore: () => void;
} {
  const sessionStorage = new MemoryStorage();
  const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const originalPerformance = globalThis.performance;

  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: sessionStorage,
  });

  vi.stubGlobal('performance', {
    ...originalPerformance,
    getEntriesByType: (entryType: string) => entryType === 'navigation' ? [{ type: navigationType }] : [],
  });

  return {
    restore: () => {
      if (originalSessionStorage) {
        Object.defineProperty(globalThis, 'sessionStorage', originalSessionStorage);
      } else {
        delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
      }

      vi.stubGlobal('performance', originalPerformance);
      vi.unstubAllGlobals();
    },
  };
}

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
      validLensIds: LENSES.map((lens) => lens.id),
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

  it('liefert bei state-sync auch akzeptierte Stimmen und die naechste offene Rolle zurueck', async () => {
    const bus = new LocalBus();
    const hostSession = createEphemeralTransportSession(true);
    const joinerSession = createEphemeralTransportSession(false);
    const hostRole = ROLES.find((role) => role.id === 'theologin');
    const nextRole = ROLES.find((role) => role.id === 'juristin');
    if (!hostRole || !nextRole) {
      throw new Error('Testrollen nicht gefunden');
    }

    const joinerFactory = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerSession.clientInfo,
    });
    const voterFactory = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: hostSession.clientInfo,
    });
    const hostSnapshot: StateSnapshot = {
      state: {
        ...createGame(),
        activeRoles: [hostRole, nextRole],
        selectedRole: hostRole,
        currentRoleIndex: 0,
      },
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
      validLensIds: LENSES.map((lens) => lens.id),
      getCurrentRoundId: () => 'round-0',
      getAuthoritativeSnapshot: () => hostSnapshot,
    });

    hostAuthority.start();

    await bus.publish(voterFactory.createRoleClaimRequested({ roundId: 'round-0', roleId: 'theologin' }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(joinerFactory.createRoleClaimRequested({ roundId: 'round-0', roleId: 'juristin' }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(voterFactory.createVoteCastRequested({
      roundId: 'round-0',
      caseId: 1,
      roleId: 'theologin',
      optionId: 'sophia-1-a',
      isTieBreak: false,
    }));
    await Promise.resolve();
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

    const syncEvent = received.find((event) => event.eventName === 'state-sync-sent');

    expect(syncEvent).toMatchObject({
      eventName: 'state-sync-sent',
      authoritativePlayerId: hostSession.clientInfo.playerId,
      snapshot: {
        state: {
          roundVotes: {
            theologin: 'sophia-1-a',
          },
          selectedRole: {
            id: 'juristin',
          },
          currentRoleIndex: 1,
        },
      },
    });

    hostAuthority.stop();
    unsubscribe();
    bus.destroy();
  });

  it('ignoriert bei state-sync lokale nicht-autoritative Rundenvotes', async () => {
    const bus = new LocalBus();
    const hostSession = createEphemeralTransportSession(true);
    const joinerASession = createEphemeralTransportSession(false);
    const joinerBSession = createEphemeralTransportSession(false);
    const theologin = ROLES.find((role) => role.id === 'theologin');
    const entwicklerin = ROLES.find((role) => role.id === 'entwicklerin');
    const juristin = ROLES.find((role) => role.id === 'juristin');
    if (!theologin || !entwicklerin || !juristin) {
      throw new Error('Testrollen nicht gefunden');
    }

    const joinerAFactory = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerASession.clientInfo,
    });
    const joinerBFactory = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerBSession.clientInfo,
    });
    const voterFactory = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: hostSession.clientInfo,
    });
    const hostSnapshot: StateSnapshot = {
      state: {
        ...createGame(),
        activeRoles: [theologin, entwicklerin, juristin],
        selectedRole: theologin,
        currentRoleIndex: 0,
        roundVotes: {
          theologin: 'sophia-1-b',
          entwicklerin: 'sophia-1-b',
          juristin: 'sophia-1-b',
        },
      },
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
      validLensIds: LENSES.map((lens) => lens.id),
      getCurrentRoundId: () => 'round-0',
      getAuthoritativeSnapshot: () => hostSnapshot,
    });

    hostAuthority.start();

    await bus.publish(voterFactory.createRoleClaimRequested({ roundId: 'round-0', roleId: 'theologin' }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(joinerAFactory.createRoleClaimRequested({ roundId: 'round-0', roleId: 'entwicklerin' }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(joinerBFactory.createRoleClaimRequested({ roundId: 'round-0', roleId: 'juristin' }));
    await Promise.resolve();
    await Promise.resolve();

    await bus.publish(voterFactory.createVoteCastRequested({
      roundId: 'round-0',
      caseId: 1,
      roleId: 'theologin',
      optionId: 'sophia-1-b',
      isTieBreak: false,
    }));
    await Promise.resolve();
    await Promise.resolve();

    await new Promise((resolve) => setTimeout(resolve, 90));

    const syncEvent = received.findLast(
      (event) => event.eventName === 'state-sync-sent' && event.snapshot.state.roundVotes.theologin === 'sophia-1-b'
    );

    expect(syncEvent).toMatchObject({
      eventName: 'state-sync-sent',
      snapshot: {
        state: {
          roundVotes: {
            theologin: 'sophia-1-b',
          },
          selectedRole: {
            id: 'entwicklerin',
          },
          currentRoleIndex: 1,
        },
      },
    });

    hostAuthority.stop();
    unsubscribe();
    bus.destroy();
  });

  it('leitet bei state-sync den naechsten Zug vom zuletzt akzeptierten Vote ab', async () => {
    const bus = new LocalBus();
    const hostSession = createEphemeralTransportSession(true);
    const joinerASession = createEphemeralTransportSession(false);
    const joinerBSession = createEphemeralTransportSession(false);
    const theologin = ROLES.find((role) => role.id === 'theologin');
    const entwicklerin = ROLES.find((role) => role.id === 'entwicklerin');
    const juristin = ROLES.find((role) => role.id === 'juristin');
    if (!theologin || !entwicklerin || !juristin) {
      throw new Error('Testrollen nicht gefunden');
    }

    const hostFactory = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: hostSession.clientInfo,
    });
    const joinerAFactory = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerASession.clientInfo,
    });
    const joinerBFactory = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerBSession.clientInfo,
    });
    const hostSnapshot: StateSnapshot = {
      state: {
        ...createGame(),
        activeRoles: [theologin, entwicklerin, juristin],
        selectedRole: theologin,
        currentRoleIndex: 1,
      },
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
      validLensIds: LENSES.map((lens) => lens.id),
      getCurrentRoundId: () => 'round-0',
      getAuthoritativeSnapshot: () => hostSnapshot,
    });

    hostAuthority.start();

    await bus.publish(hostFactory.createRoleClaimRequested({ roundId: 'round-0', roleId: 'theologin' }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(joinerAFactory.createRoleClaimRequested({ roundId: 'round-0', roleId: 'entwicklerin' }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(joinerBFactory.createRoleClaimRequested({ roundId: 'round-0', roleId: 'juristin' }));
    await Promise.resolve();
    await Promise.resolve();

    await bus.publish(hostFactory.createVoteCastRequested({
      roundId: 'round-0',
      caseId: 1,
      phaseKey: 'round-0:base',
      roleId: 'theologin',
      optionId: 'sophia-1-b',
      isTieBreak: false,
    }));
    await Promise.resolve();
    await Promise.resolve();

    await new Promise((resolve) => setTimeout(resolve, 90));

    const syncEvent = received.findLast(
      (event) => event.eventName === 'state-sync-sent' && event.snapshot.state.roundVotes.theologin === 'sophia-1-b'
    );

    expect(syncEvent).toMatchObject({
      eventName: 'state-sync-sent',
      snapshot: {
        state: {
          roundVotes: {
            theologin: 'sophia-1-b',
          },
          selectedRole: {
            id: 'entwicklerin',
          },
          currentRoleIndex: 1,
        },
      },
    });

    hostAuthority.stop();
    unsubscribe();
    bus.destroy();
  });

  it('sendet nach einer akzeptierten Stimme schnell einen Follow-up-State-Sync', async () => {
    const bus = new LocalBus();
    const hostSession = createEphemeralTransportSession(true);
    const joinerSession = createEphemeralTransportSession(false);
    const hostRole = ROLES.find((role) => role.id === 'theologin');
    const nextRole = ROLES.find((role) => role.id === 'juristin');
    if (!hostRole || !nextRole) {
      throw new Error('Testrollen nicht gefunden');
    }

    const joinerFactory = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerSession.clientInfo,
    });
    let hostSnapshot: StateSnapshot = {
      state: {
        ...createGame(),
        activeRoles: [hostRole, nextRole],
        selectedRole: hostRole,
        currentRoleIndex: 0,
      },
      lastAppliedSeqByPlayer: {},
      roleOwners: {
        theologin: joinerSession.clientInfo.playerId,
      },
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
      validLensIds: LENSES.map((lens) => lens.id),
      getCurrentRoundId: () => 'round-0',
      getAuthoritativeSnapshot: () => hostSnapshot,
    });

    hostAuthority.start();

    await bus.publish(joinerFactory.createVoteCastRequested({
      roundId: 'round-0',
      caseId: 1,
      phaseKey: 'round-0:base',
      roleId: 'theologin',
      optionId: 'sophia-1-a',
      isTieBreak: false,
    }));
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 90));

    hostSnapshot = {
      ...hostSnapshot,
      state: {
        ...hostSnapshot.state,
        roundVotes: {
          theologin: 'sophia-1-a',
        },
        selectedRole: nextRole,
        currentRoleIndex: 1,
      },
    };

    const followupSync = received.findLast(
      (event) => event.eventName === 'state-sync-sent' && event.snapshot.state.roundVotes.theologin === 'sophia-1-a'
    );

    expect(followupSync).toMatchObject({
      eventName: 'state-sync-sent',
      authoritativePlayerId: hostSession.clientInfo.playerId,
      snapshot: {
        state: {
          roundVotes: {
            theologin: 'sophia-1-a',
          },
        },
      },
    });

    hostAuthority.stop();
    unsubscribe();
    bus.destroy();
  });

  it('setzt per game-reset Rollenbesitz und Snapshot fuer den gesamten Raum zurueck', async () => {
    const bus = new LocalBus();
    const hostSession = createEphemeralTransportSession(true);
    const joinerSession = createEphemeralTransportSession(false);
    const joinerFactory = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerSession.clientInfo,
    });
    let hostSnapshot: StateSnapshot = {
      state: {
        ...createGame(),
        activeRoles: [ROLES[0], ROLES[1]],
        selectedRole: ROLES[0],
      },
      lastAppliedSeqByPlayer: {},
      roleOwners: {},
    };
    const received: TransportEvent[] = [];

    const unsubscribe = bus.subscribe('game-1', (event) => {
      received.push(event);
      if (event.eventName === 'game-reset' && event.resetStatus === 'accepted' && event.snapshot) {
        hostSnapshot = event.snapshot;
      }
    });

    const hostAuthority = new HostAuthority({
      bus,
      gameId: 'game-1',
      session: hostSession,
      rulesVersion: 'v1',
      maxPlayers: 6,
      validRoleIds: ROLES.map((role) => role.id),
      validLensIds: LENSES.map((lens) => lens.id),
      getCurrentRoundId: () => 'round-0',
      getAuthoritativeSnapshot: () => hostSnapshot,
      getResetSnapshot: createResetSnapshot,
    });

    hostAuthority.start();

    await bus.publish(
      joinerFactory.createRoleClaimRequested({
        roundId: 'round-0',
        roleId: ROLES[0].id,
      })
    );
    await Promise.resolve();
    await Promise.resolve();

    await bus.publish(
      joinerFactory.createGameResetRequested({
        roundId: 'round-0',
      })
    );
    await Promise.resolve();
    await Promise.resolve();

    const resetEvent = received.findLast(
      (event) => event.eventName === 'game-reset' && event.resetStatus === 'accepted'
    );
    expect(resetEvent).toMatchObject({
      eventName: 'game-reset',
      resetStatus: 'accepted',
      requestedByPlayerId: joinerSession.clientInfo.playerId,
      authoritativePlayerId: hostSession.clientInfo.playerId,
      snapshot: {
        state: {
          currentCase: 0,
          activeRoles: [],
          selectedRole: null,
          roundVotes: {},
          protokoll: [],
        },
        roleOwners: {},
        pendingRoundClose: null,
      },
    });

    await bus.publish(
      joinerFactory.createStateSyncRequested({
        roundId: 'round-0',
        knownRoundId: 'round-0',
        knownSeqByPlayer: {},
      })
    );
    await Promise.resolve();
    await Promise.resolve();

    const syncEvent = received.findLast((event) => event.eventName === 'state-sync-sent');
    expect(syncEvent).toMatchObject({
      eventName: 'state-sync-sent',
      snapshot: {
        state: {
          activeRoles: [],
          selectedRole: null,
          roundVotes: {},
        },
        roleOwners: {},
        pendingRoundClose: null,
      },
    });

    hostAuthority.stop();
    unsubscribe();
    bus.destroy();
  });

  it('bestaetigt eine gemeinsame Deutungslinse der rotierenden Initiative und synchronisiert den Zeitbonus', async () => {
    const bus = new LocalBus();
    const hostSession = createEphemeralTransportSession(true);
    const joinerSession = createEphemeralTransportSession(false);
    const initiativeRole = ROLES.find((role) => role.id === 'theologin');
    const nextRole = ROLES.find((role) => role.id === 'juristin');
    const lens = LENSES.find((entry) => entry.id === 'werkzeug');
    if (!initiativeRole || !nextRole || !lens) {
      throw new Error('Testrahmen für Linsenwahl nicht gefunden');
    }

    const joinerFactory = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerSession.clientInfo,
    });
    const hostSnapshot: StateSnapshot = {
      state: {
        ...createGame(),
        activeRoles: [initiativeRole, nextRole],
        selectedRole: initiativeRole,
        currentRoleIndex: 0,
      },
      lastAppliedSeqByPlayer: {},
      roleOwners: {
        theologin: joinerSession.clientInfo.playerId,
      },
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
      validLensIds: LENSES.map((entry) => entry.id),
      getCurrentRoundId: () => 'round-0',
      getAuthoritativeSnapshot: () => hostSnapshot,
    });

    hostAuthority.start();

    await bus.publish(joinerFactory.createLensSelectedRequested({
      roundId: 'round-0',
      lensId: lens.id,
      selectedByRoleId: initiativeRole.id,
      timerBonusSeconds: 12,
    }));
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 80));

    const acceptedLens = received.find(
      (event) =>
        event.eventName === 'lens-selected' &&
        event.selectionStatus === 'accepted' &&
        event.lensId === lens.id &&
        event.selectedByRoleId === initiativeRole.id
    );
    const syncEvent = received.findLast(
      (event) =>
        event.eventName === 'state-sync-sent' &&
        event.snapshot.state.selectedLens?.id === lens.id
    );

    expect(acceptedLens).toMatchObject({
      eventName: 'lens-selected',
      selectionStatus: 'accepted',
      lensId: lens.id,
      timerBonusSeconds: 12,
      authoritativePlayerId: hostSession.clientInfo.playerId,
    });

    expect(syncEvent).toMatchObject({
      eventName: 'state-sync-sent',
      snapshot: {
        state: {
          selectedLens: {
            id: lens.id,
          },
          phaseTimerBonusSeconds: 12,
        },
      },
    });

    hostAuthority.stop();
    unsubscribe();
    bus.destroy();
  });

  it('liefert bei state-sync auch einen akzeptierten Rundenabschluss zurueck', async () => {
    const bus = new LocalBus();
    const hostSession = createEphemeralTransportSession(true);
    const joinerSession = createEphemeralTransportSession(false);
    const hostRole = ROLES.find((role) => role.id === 'theologin');
    const nextRole = ROLES.find((role) => role.id === 'juristin');
    if (!hostRole || !nextRole) {
      throw new Error('Testrollen nicht gefunden');
    }

    const joinerFactory = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerSession.clientInfo,
    });
    const hostFactory = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: hostSession.clientInfo,
    });
    const hostSnapshot: StateSnapshot = {
      state: {
        ...createGame(),
        activeRoles: [hostRole, nextRole],
        selectedRole: hostRole,
        currentRoleIndex: 0,
      },
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
      validLensIds: LENSES.map((lens) => lens.id),
      getCurrentRoundId: () => 'round-0',
      getAuthoritativeSnapshot: () => hostSnapshot,
    });

    hostAuthority.start();

    await bus.publish(hostFactory.createRoleClaimRequested({ roundId: 'round-0', roleId: 'theologin' }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(joinerFactory.createRoleClaimRequested({ roundId: 'round-0', roleId: 'juristin' }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(hostFactory.createVoteCastRequested({
      roundId: 'round-0',
      caseId: 1,
      roleId: 'theologin',
      optionId: 'sophia-1-b',
      isTieBreak: false,
    }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(joinerFactory.createVoteCastRequested({
      roundId: 'round-0',
      caseId: 1,
      roleId: 'juristin',
      optionId: 'sophia-1-b',
      isTieBreak: false,
    }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(hostFactory.createRoundClosedRequested({
      roundId: 'round-0',
      caseId: 1,
      resolvedOptionId: 'sophia-1-b',
      voteSummary: [
        { roleId: 'theologin', optionId: 'sophia-1-b', playerId: hostSession.clientInfo.playerId },
        { roleId: 'juristin', optionId: 'sophia-1-b', playerId: joinerSession.clientInfo.playerId },
      ],
    }));
    await Promise.resolve();
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

    const syncEvent = received.findLast((event) => event.eventName === 'state-sync-sent');

    expect(syncEvent).toMatchObject({
      eventName: 'state-sync-sent',
      snapshot: {
        pendingRoundClose: {
          roundId: 'round-0',
          caseId: 1,
          resolvedOptionId: 'sophia-1-b',
          voteSummary: [
            { roleId: 'theologin', optionId: 'sophia-1-b', playerId: hostSession.clientInfo.playerId },
            { roleId: 'juristin', optionId: 'sophia-1-b', playerId: joinerSession.clientInfo.playerId },
          ],
        },
      },
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
      validLensIds: LENSES.map((lens) => lens.id),
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


  it('bestaetigt Stimmen des Rollenbesitzers und lehnt doppelte oder fremde Stimmen ab', async () => {
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
      validLensIds: LENSES.map((lens) => lens.id),
      getCurrentRoundId: () => 'round-0',
      getAuthoritativeSnapshot: () => hostSnapshot,
    });

    hostAuthority.start();

    await bus.publish(
      factoryA.createRoleClaimRequested({
        roundId: 'round-0',
        roleId: 'prophetin',
      })
    );
    await Promise.resolve();
    await Promise.resolve();

    await bus.publish(
      factoryA.createVoteCastRequested({
        roundId: 'round-0',
        caseId: 1,
        roleId: 'prophetin',
        optionId: 'sophia-1-a',
        isTieBreak: false,
      })
    );
    await Promise.resolve();
    await Promise.resolve();

    await bus.publish(
      factoryA.createVoteCastRequested({
        roundId: 'round-0',
        caseId: 1,
        roleId: 'prophetin',
        optionId: 'sophia-1-b',
        isTieBreak: false,
      })
    );
    await Promise.resolve();
    await Promise.resolve();

    await bus.publish(
      factoryB.createVoteCastRequested({
        roundId: 'round-0',
        caseId: 1,
        roleId: 'prophetin',
        optionId: 'sophia-1-c',
        isTieBreak: false,
      })
    );
    await Promise.resolve();
    await Promise.resolve();

    const acceptedVote = received.find(
      (event) =>
        event.eventName === 'vote-cast' &&
        event.voteStatus === 'accepted' &&
        event.roleId === 'prophetin' &&
        event.playerId === joinerA.clientInfo.playerId
    );
    const duplicateVote = received.find(
      (event) =>
        event.eventName === 'vote-cast' &&
        event.voteStatus === 'rejected' &&
        event.roleId === 'prophetin' &&
        event.playerId === joinerA.clientInfo.playerId &&
        event.rejectionReason === 'ALREADY_VOTED'
    );
    const foreignVote = received.find(
      (event) =>
        event.eventName === 'vote-cast' &&
        event.voteStatus === 'rejected' &&
        event.roleId === 'prophetin' &&
        event.playerId === joinerB.clientInfo.playerId &&
        event.rejectionReason === 'ROLE_NOT_OWNED'
    );

    expect(acceptedVote).toMatchObject({
      eventName: 'vote-cast',
      voteStatus: 'accepted',
      roleId: 'prophetin',
      optionId: 'sophia-1-a',
      authoritativePlayerId: hostSession.clientInfo.playerId,
    });

    expect(duplicateVote).toMatchObject({
      eventName: 'vote-cast',
      voteStatus: 'rejected',
      roleId: 'prophetin',
      rejectionReason: 'ALREADY_VOTED',
      authoritativePlayerId: hostSession.clientInfo.playerId,
    });

    expect(foreignVote).toMatchObject({
      eventName: 'vote-cast',
      voteStatus: 'rejected',
      roleId: 'prophetin',
      rejectionReason: 'ROLE_NOT_OWNED',
      authoritativePlayerId: hostSession.clientInfo.playerId,
    });

    hostAuthority.stop();
    unsubscribe();
    bus.destroy();
  });

  it('lehnt Stimmen ab, wenn nicht die aktuelle Rolle am Zug ist', async () => {
    const bus = new LocalBus();
    const hostSession = createEphemeralTransportSession(true);
    const joinerA = createEphemeralTransportSession(false);
    const joinerB = createEphemeralTransportSession(false);
    const theologin = ROLES.find((role) => role.id === 'theologin');
    const juristin = ROLES.find((role) => role.id === 'juristin');
    if (!theologin || !juristin) {
      throw new Error('Testrollen nicht gefunden');
    }

    const factoryA = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerA.clientInfo,
    });
    const factoryB = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerB.clientInfo,
    });
    const hostSnapshot: StateSnapshot = {
      state: {
        ...createGame(),
        activeRoles: [theologin, juristin],
        selectedRole: theologin,
        currentRoleIndex: 0,
      },
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
      validLensIds: LENSES.map((lens) => lens.id),
      getCurrentRoundId: () => 'round-0',
      getAuthoritativeSnapshot: () => hostSnapshot,
    });

    hostAuthority.start();

    await bus.publish(factoryA.createRoleClaimRequested({ roundId: 'round-0', roleId: 'theologin' }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(factoryB.createRoleClaimRequested({ roundId: 'round-0', roleId: 'juristin' }));
    await Promise.resolve();
    await Promise.resolve();

    await bus.publish(factoryB.createVoteCastRequested({
      roundId: 'round-0',
      caseId: 1,
      roleId: 'juristin',
      optionId: 'sophia-1-b',
      isTieBreak: false,
    }));
    await Promise.resolve();
    await Promise.resolve();

    const rejectedVote = received.find(
      (event) =>
        event.eventName === 'vote-cast'
        && event.voteStatus === 'rejected'
        && event.roleId === 'juristin'
        && event.playerId === joinerB.clientInfo.playerId
        && event.rejectionReason === 'TURN_MISMATCH'
    );

    expect(rejectedVote).toMatchObject({
      eventName: 'vote-cast',
      voteStatus: 'rejected',
      roleId: 'juristin',
      rejectionReason: 'TURN_MISMATCH',
      authoritativePlayerId: hostSession.clientInfo.playerId,
    });

    hostAuthority.stop();
    unsubscribe();
    bus.destroy();
  });

  it('erlaubt neue Stimmen in der Stichwahl trotz gleicher roundId', async () => {
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
    let hostSnapshot: StateSnapshot = {
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
      validLensIds: LENSES.map((lens) => lens.id),
      getCurrentRoundId: () => 'round-0',
      getAuthoritativeSnapshot: () => hostSnapshot,
    });

    hostAuthority.start();

    await bus.publish(factoryA.createRoleClaimRequested({ roundId: 'round-0', roleId: 'theologin' }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(factoryB.createRoleClaimRequested({ roundId: 'round-0', roleId: 'juristin' }));
    await Promise.resolve();
    await Promise.resolve();

    await bus.publish(factoryA.createVoteCastRequested({ roundId: 'round-0', caseId: 1, roleId: 'theologin', optionId: 'sophia-1-a', isTieBreak: false }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(factoryB.createVoteCastRequested({ roundId: 'round-0', caseId: 1, roleId: 'juristin', optionId: 'sophia-1-b', isTieBreak: false }));
    await Promise.resolve();
    await Promise.resolve();

    hostSnapshot = {
      ...hostSnapshot,
      state: {
        ...hostSnapshot.state,
        tieBreakOptions: ['sophia-1-a', 'sophia-1-b'],
        tieBreakRound: 1,
        roundVotes: {},
      },
    };

    await bus.publish(factoryA.createVoteCastRequested({ roundId: 'round-0', caseId: 1, roleId: 'theologin', optionId: 'sophia-1-a', isTieBreak: true }));
    await Promise.resolve();
    await Promise.resolve();

    const acceptedTieBreakVote = received.find(
      (event) =>
        event.eventName === 'vote-cast' &&
        event.voteStatus === 'accepted' &&
        event.isTieBreak &&
        event.roleId === 'theologin'
    );

    expect(acceptedTieBreakVote).toMatchObject({
      eventName: 'vote-cast',
      voteStatus: 'accepted',
      isTieBreak: true,
      roleId: 'theologin',
      authoritativePlayerId: hostSession.clientInfo.playerId,
    });

    hostAuthority.stop();
    unsubscribe();
    bus.destroy();
  });

  it('akzeptiert in einer wiederholten Stichwahl neue Stimmen derselben Rollen', async () => {
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
    const theologin = ROLES.find((role) => role.id === 'theologin');
    const juristin = ROLES.find((role) => role.id === 'juristin');
    if (!theologin || !juristin) {
      throw new Error('Testrollen nicht gefunden');
    }

    let hostSnapshot: StateSnapshot = {
      state: {
        ...createGame(),
        activeRoles: [theologin, juristin],
        selectedRole: theologin,
        tieBreakOptions: ['sophia-1-a', 'sophia-1-b'],
        tieBreakRound: 1,
      },
      lastAppliedSeqByPlayer: {},
      roleOwners: {
        theologin: joinerA.clientInfo.playerId,
        juristin: joinerB.clientInfo.playerId,
      },
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
      validLensIds: LENSES.map((lens) => lens.id),
      getCurrentRoundId: () => 'round-0',
      getAuthoritativeSnapshot: () => hostSnapshot,
    });

    hostAuthority.start();

    await bus.publish(factoryA.createVoteCastRequested({ roundId: 'round-0', caseId: 1, phaseKey: 'round-0:tie-break-1', roleId: 'theologin', optionId: 'sophia-1-a', isTieBreak: true }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(factoryB.createVoteCastRequested({ roundId: 'round-0', caseId: 1, phaseKey: 'round-0:tie-break-1', roleId: 'juristin', optionId: 'sophia-1-b', isTieBreak: true }));
    await Promise.resolve();
    await Promise.resolve();

    hostSnapshot = {
      ...hostSnapshot,
      state: {
        ...hostSnapshot.state,
        selectedRole: theologin,
        tieBreakRound: 2,
        roundVotes: {},
      },
    };

    await bus.publish(factoryA.createVoteCastRequested({ roundId: 'round-0', caseId: 1, phaseKey: 'round-0:tie-break-2', roleId: 'theologin', optionId: 'sophia-1-b', isTieBreak: true }));
    await Promise.resolve();
    await Promise.resolve();

    const acceptedRepeatedTieBreakVote = received.findLast(
      (event) =>
        event.eventName === 'vote-cast' &&
        event.voteStatus === 'accepted' &&
        event.phaseKey === 'round-0:tie-break-2' &&
        event.roleId === 'theologin'
    );

    expect(acceptedRepeatedTieBreakVote).toMatchObject({
      eventName: 'vote-cast',
      voteStatus: 'accepted',
      phaseKey: 'round-0:tie-break-2',
      roleId: 'theologin',
      authoritativePlayerId: hostSession.clientInfo.playerId,
    });

    hostAuthority.stop();
    unsubscribe();
    bus.destroy();
  });

  it('bestaetigt gueltigen Rundenabschluss und lehnt unvollstaendige Abschluesse ab', async () => {
    const bus = new LocalBus();
    const hostSession = createEphemeralTransportSession(true);
    const joinerA = createEphemeralTransportSession(false);
    const joinerB = createEphemeralTransportSession(false);
    const joinerC = createEphemeralTransportSession(false);
    const factoryA = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerA.clientInfo,
    });
    const factoryB = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerB.clientInfo,
    });
    const factoryC = new TransportEventFactory({
      gameId: 'game-1',
      clientInfo: joinerC.clientInfo,
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
      validLensIds: LENSES.map((lens) => lens.id),
      getCurrentRoundId: () => 'round-0',
      getAuthoritativeSnapshot: () => hostSnapshot,
    });

    hostAuthority.start();

    const roleClaims = [
      factoryA.createRoleClaimRequested({ roundId: 'round-0', roleId: 'buergerin' }),
      factoryB.createRoleClaimRequested({ roundId: 'round-0', roleId: 'prophetin' }),
      factoryC.createRoleClaimRequested({ roundId: 'round-0', roleId: 'juristin' }),
    ];

    for (const claim of roleClaims) {
      await bus.publish(claim);
      await Promise.resolve();
      await Promise.resolve();
    }

    const earlyClose = factoryA.createRoundClosedRequested({
      roundId: 'round-0',
      caseId: 1,
      resolvedOptionId: 'sophia-1-a',
      voteSummary: [],
    });
    await bus.publish(earlyClose);
    await Promise.resolve();
    await Promise.resolve();

    const voteEvents = [
      factoryA.createVoteCastRequested({ roundId: 'round-0', caseId: 1, roleId: 'buergerin', optionId: 'sophia-1-a', isTieBreak: false }),
      factoryB.createVoteCastRequested({ roundId: 'round-0', caseId: 1, roleId: 'prophetin', optionId: 'sophia-1-a', isTieBreak: false }),
      factoryC.createVoteCastRequested({ roundId: 'round-0', caseId: 1, roleId: 'juristin', optionId: 'sophia-1-b', isTieBreak: false }),
    ];

    for (const vote of voteEvents) {
      await bus.publish(vote);
      await Promise.resolve();
      await Promise.resolve();
    }

    const validClose = factoryA.createRoundClosedRequested({
      roundId: 'round-0',
      caseId: 1,
      resolvedOptionId: 'sophia-1-a',
      voteSummary: [
        { roleId: 'buergerin', optionId: 'sophia-1-a', playerId: joinerA.clientInfo.playerId },
        { roleId: 'prophetin', optionId: 'sophia-1-a', playerId: joinerB.clientInfo.playerId },
        { roleId: 'juristin', optionId: 'sophia-1-b', playerId: joinerC.clientInfo.playerId },
      ],
    });
    await bus.publish(validClose);
    await Promise.resolve();
    await Promise.resolve();

    const rejectedClose = received.find(
      (event) =>
        event.eventName === 'round-closed' &&
        event.roundCloseStatus === 'rejected' &&
        event.rejectionReason === 'INCOMPLETE_VOTES'
    );
    const acceptedClose = received.find(
      (event) =>
        event.eventName === 'round-closed' &&
        event.roundCloseStatus === 'accepted' &&
        event.resolvedOptionId === 'sophia-1-a'
    );

    expect(rejectedClose).toMatchObject({
      eventName: 'round-closed',
      roundCloseStatus: 'rejected',
      rejectionReason: 'INCOMPLETE_VOTES',
      authoritativePlayerId: hostSession.clientInfo.playerId,
    });

    expect(acceptedClose).toMatchObject({
      eventName: 'round-closed',
      roundCloseStatus: 'accepted',
      resolvedOptionId: 'sophia-1-a',
      authoritativePlayerId: hostSession.clientInfo.playerId,
    });

    hostAuthority.stop();
    unsubscribe();
    bus.destroy();
  });

  it('uebernimmt im Finale bei zwei Rollen alle eingereichten Pakttexte ohne Bewertungsphase', async () => {
    const bus = new LocalBus();
    const hostSession = createEphemeralTransportSession(true);
    const playerA = createEphemeralTransportSession(false);
    const playerB = createEphemeralTransportSession(false);
    const roleA = ROLES.find((role) => role.id === 'theologin');
    const roleB = ROLES.find((role) => role.id === 'juristin');
    if (!roleA || !roleB) {
      throw new Error('Testrollen nicht gefunden');
    }

    const factoryA = new TransportEventFactory({ gameId: 'game-1', clientInfo: playerA.clientInfo });
    const factoryB = new TransportEventFactory({ gameId: 'game-1', clientInfo: playerB.clientInfo });
    const hostSnapshot: StateSnapshot = {
      state: {
        ...createGame(),
        currentCase: 7,
        activeRoles: [roleA, roleB],
      },
      lastAppliedSeqByPlayer: {},
      roleOwners: {
        theologin: playerA.clientInfo.playerId,
        juristin: playerB.clientInfo.playerId,
      },
      phaseStartedAt: null,
      pendingRoundClose: null,
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
      validLensIds: LENSES.map((lens) => lens.id),
      getCurrentRoundId: () => 'round-7',
      getAuthoritativeSnapshot: () => hostSnapshot,
    });

    hostAuthority.start();

    await bus.publish(factoryA.createPaktSubmittedRequested({ roundId: 'round-7', submittedByRoleId: 'theologin', answers: createPaktAnswers('Theologin') }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(factoryB.createPaktSubmittedRequested({ roundId: 'round-7', submittedByRoleId: 'juristin', answers: createPaktAnswers('Juristin') }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(factoryA.createStateSyncRequested({ roundId: 'round-7', knownRoundId: 'round-7', knownSeqByPlayer: {} }));
    await Promise.resolve();
    await Promise.resolve();

    const syncEvent = received.findLast((event) => event.eventName === 'state-sync-sent');
    expect(syncEvent).toMatchObject({
      eventName: 'state-sync-sent',
      snapshot: {
        state: {
          paktWinnersByArticle: {
            'artikel-1': ['theologin', 'juristin'],
          },
          pakt: {
            'artikel-1': 'Theologin Artikel 1\n\nJuristin Artikel 1',
          },
        },
      },
    });

    hostAuthority.stop();
    unsubscribe();
    bus.destroy();
  });

  it('lehnt im Finale Selbstwahl bei der Pakt-Wertung ab', async () => {
    const bus = new LocalBus();
    const hostSession = createEphemeralTransportSession(true);
    const playerA = createEphemeralTransportSession(false);
    const playerB = createEphemeralTransportSession(false);
    const playerC = createEphemeralTransportSession(false);
    const roles = [
      ROLES.find((role) => role.id === 'theologin'),
      ROLES.find((role) => role.id === 'juristin'),
      ROLES.find((role) => role.id === 'buergerin'),
    ];
    if (roles.some((role) => !role)) {
      throw new Error('Testrollen nicht gefunden');
    }

    const [roleA, roleB, roleC] = roles;
    const factoryA = new TransportEventFactory({ gameId: 'game-1', clientInfo: playerA.clientInfo });
    const factoryB = new TransportEventFactory({ gameId: 'game-1', clientInfo: playerB.clientInfo });
    const factoryC = new TransportEventFactory({ gameId: 'game-1', clientInfo: playerC.clientInfo });
    const hostSnapshot: StateSnapshot = {
      state: {
        ...createGame(),
        currentCase: 7,
        activeRoles: [roleA!, roleB!, roleC!],
      },
      lastAppliedSeqByPlayer: {},
      roleOwners: {
        theologin: playerA.clientInfo.playerId,
        juristin: playerB.clientInfo.playerId,
        buergerin: playerC.clientInfo.playerId,
      },
      phaseStartedAt: null,
      pendingRoundClose: null,
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
      validLensIds: LENSES.map((lens) => lens.id),
      getCurrentRoundId: () => 'round-7',
      getAuthoritativeSnapshot: () => hostSnapshot,
    });

    hostAuthority.start();

    await bus.publish(factoryA.createPaktSubmittedRequested({ roundId: 'round-7', submittedByRoleId: 'theologin', answers: createPaktAnswers('A') }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(factoryB.createPaktSubmittedRequested({ roundId: 'round-7', submittedByRoleId: 'juristin', answers: createPaktAnswers('B') }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(factoryC.createPaktSubmittedRequested({ roundId: 'round-7', submittedByRoleId: 'buergerin', answers: createPaktAnswers('C') }));
    await Promise.resolve();
    await Promise.resolve();

    await bus.publish(factoryA.createPaktVotedRequested({
      roundId: 'round-7',
      articleId: 'artikel-1',
      votedByRoleId: 'theologin',
      twoPointsRoleId: 'theologin',
      onePointRoleId: 'juristin',
    }));
    await Promise.resolve();
    await Promise.resolve();

    const rejectedVote = received.findLast(
      (event) => event.eventName === 'pakt-voted' && event.voteStatus === 'rejected'
    );
    expect(rejectedVote).toMatchObject({
      eventName: 'pakt-voted',
      voteStatus: 'rejected',
      rejectionReason: 'SELF_VOTE',
      authoritativePlayerId: hostSession.clientInfo.playerId,
    });

    hostAuthority.stop();
    unsubscribe();
    bus.destroy();
  });

  it('ermittelt nach vollstaendiger Pakt-Wertung den Siegertext je Artikel', async () => {
    const bus = new LocalBus();
    const hostSession = createEphemeralTransportSession(true);
    const playerA = createEphemeralTransportSession(false);
    const playerB = createEphemeralTransportSession(false);
    const playerC = createEphemeralTransportSession(false);
    const roles = [
      ROLES.find((role) => role.id === 'theologin'),
      ROLES.find((role) => role.id === 'juristin'),
      ROLES.find((role) => role.id === 'buergerin'),
    ];
    if (roles.some((role) => !role)) {
      throw new Error('Testrollen nicht gefunden');
    }

    const [roleA, roleB, roleC] = roles;
    const factoryA = new TransportEventFactory({ gameId: 'game-1', clientInfo: playerA.clientInfo });
    const factoryB = new TransportEventFactory({ gameId: 'game-1', clientInfo: playerB.clientInfo });
    const factoryC = new TransportEventFactory({ gameId: 'game-1', clientInfo: playerC.clientInfo });
    const hostSnapshot: StateSnapshot = {
      state: {
        ...createGame(),
        currentCase: 7,
        activeRoles: [roleA!, roleB!, roleC!],
      },
      lastAppliedSeqByPlayer: {},
      roleOwners: {
        theologin: playerA.clientInfo.playerId,
        juristin: playerB.clientInfo.playerId,
        buergerin: playerC.clientInfo.playerId,
      },
      phaseStartedAt: null,
      pendingRoundClose: null,
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
      validLensIds: LENSES.map((lens) => lens.id),
      getCurrentRoundId: () => 'round-7',
      getAuthoritativeSnapshot: () => hostSnapshot,
    });

    hostAuthority.start();

    await bus.publish(factoryA.createPaktSubmittedRequested({ roundId: 'round-7', submittedByRoleId: 'theologin', answers: createPaktAnswers('A') }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(factoryB.createPaktSubmittedRequested({ roundId: 'round-7', submittedByRoleId: 'juristin', answers: createPaktAnswers('B') }));
    await Promise.resolve();
    await Promise.resolve();
    await bus.publish(factoryC.createPaktSubmittedRequested({ roundId: 'round-7', submittedByRoleId: 'buergerin', answers: createPaktAnswers('C') }));
    await Promise.resolve();
    await Promise.resolve();

    for (const articleId of PAKT_ARTICLE_IDS) {
      await bus.publish(factoryA.createPaktVotedRequested({
        roundId: 'round-7',
        articleId,
        votedByRoleId: 'theologin',
        twoPointsRoleId: 'juristin',
        onePointRoleId: 'buergerin',
      }));
      await Promise.resolve();
      await Promise.resolve();
      await bus.publish(factoryB.createPaktVotedRequested({
        roundId: 'round-7',
        articleId,
        votedByRoleId: 'juristin',
        twoPointsRoleId: 'theologin',
        onePointRoleId: 'buergerin',
      }));
      await Promise.resolve();
      await Promise.resolve();
      await bus.publish(factoryC.createPaktVotedRequested({
        roundId: 'round-7',
        articleId,
        votedByRoleId: 'buergerin',
        twoPointsRoleId: 'juristin',
        onePointRoleId: 'theologin',
      }));
      await Promise.resolve();
      await Promise.resolve();
    }

    await bus.publish(factoryA.createStateSyncRequested({ roundId: 'round-7', knownRoundId: 'round-7', knownSeqByPlayer: {} }));
    await Promise.resolve();
    await Promise.resolve();

    const syncEvent = received.findLast((event) => event.eventName === 'state-sync-sent');
    expect(syncEvent).toMatchObject({
      eventName: 'state-sync-sent',
      snapshot: {
        state: {
          paktWinnersByArticle: {
            'artikel-1': ['juristin'],
          },
          pakt: {
            'artikel-1': 'B Artikel 1',
          },
        },
      },
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

  it('verwendet eine persistierte Relay-Identitaet beim Reload derselben Tab-Sitzung erneut', () => {
    const environment = mockSessionEnvironment('reload');

    try {
      const firstSession = createEphemeralTransportSession(false, 'genesis:test-session');
      const secondSession = createEphemeralTransportSession(false, 'genesis:test-session');

      expect(secondSession.clientInfo.playerId).toBe(firstSession.clientInfo.playerId);
      expect(Array.from(secondSession.secretKey)).toEqual(Array.from(firstSession.secretKey));
    } finally {
      environment.restore();
    }
  });

  it('rotiert die Relay-Identitaet bei frischer Navigation trotz kopiertem Session-Storage', () => {
    const environment = mockSessionEnvironment('navigate');

    try {
      const firstSession = createEphemeralTransportSession(false, 'genesis:test-session');
      const secondSession = createEphemeralTransportSession(false, 'genesis:test-session');

      expect(secondSession.clientInfo.playerId).not.toBe(firstSession.clientInfo.playerId);
      expect(Array.from(secondSession.secretKey)).not.toEqual(Array.from(firstSession.secretKey));
    } finally {
      environment.restore();
    }
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

describe('readMultiplayerUrlConfig', () => {
  it('liest host-konfiguration aus der URL', () => {
    expect(readMultiplayerUrlConfig('?mp=host&game=abc123&relay=http://localhost:7000/')).toEqual({
      mode: 'host',
      gameId: 'abc123',
      relayUrl: 'http://localhost:7000/',
    });
  });

  it('liefert null ohne gueltige Multiplayer-Parameter', () => {
    expect(readMultiplayerUrlConfig('?dev=1')).toBeNull();
  });
});

describe('createRelayJoinUrl', () => {
  it('erstellt einen Join-Link mit gameId und relay', () => {
    expect(createRelayJoinUrl('http://localhost:5173/?mp=host&game=abc123', {
      mode: 'host',
      gameId: 'abc123',
      relayUrl: 'http://localhost:7000/',
    })).toBe('http://localhost:5173/?mp=join&game=abc123&relay=http%3A%2F%2Flocalhost%3A7000%2F');
  });
});

describe('Relay-Fehlermeldungen', () => {
  it('formatiert einen klaren Hinweis fuer ein nicht erreichbares Relay', () => {
    expect(formatRelayIssueMessage('http://localhost:7000/')).toBe(
      'Das angegebene Relay http://localhost:7000/ ist nicht erreichbar. Prüfe die URL oder starte den Relay-Server.'
    );

    expect(formatRelayIssueMessage('ws://relay.invalid', 'Connection refused')).toBe(
      'Das angegebene Relay ws://relay.invalid ist nicht erreichbar. Prüfe die URL oder starte den Relay-Server. Details: Connection refused'
    );
  });
});