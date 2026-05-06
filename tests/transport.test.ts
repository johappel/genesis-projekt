import { describe, expect, it } from 'vitest';

import { createGame } from '../src/game/engine/createGame.js';
import { ROLES } from '../src/game/data/roles.js';
import { TransportEventFactory } from '../src/transport/eventFactory.js';
import { HostAuthority } from '../src/transport/hostAuthority.js';
import { LocalBus } from '../src/transport/localBus.js';
import { createEphemeralTransportSession } from '../src/transport/session.js';
import { toRelayWebSocketUrl } from '../src/transport/nostrRelayBus.js';
import { createRelayJoinUrl, readMultiplayerUrlConfig } from '../src/transport/runtime.js';
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