import { afterEach, describe, expect, it } from 'vitest';

import { createGame } from '../src/game/engine/createGame.js';
import { ROLES } from '../src/game/data/roles.js';
import { LENSES } from '../src/game/data/lenses.js';
import { TransportEventFactory } from '../src/transport/eventFactory.js';
import { HostAuthority } from '../src/transport/hostAuthority.js';
import { NostrRelayBus } from '../src/transport/nostrRelayBus.js';
import { createEphemeralTransportSession } from '../src/transport/session.js';
import type { StateSnapshot, TransportEvent, TransportMessageBus } from '../src/transport/types.js';

function createResetSnapshot(): StateSnapshot {
  return {
    state: createGame(),
    lastAppliedSeqByPlayer: {},
    roleOwners: {},
    phaseStartedAt: null,
    pendingRoundClose: null,
  };
}

const RELAY_URL = 'ws://localhost:7000/';

const destroyCallbacks: Array<() => void> = [];

afterEach(() => {
  while (destroyCallbacks.length) {
    const destroy = destroyCallbacks.pop();
    destroy?.();
  }
});

describe('NostrRelayBus smoke', () => {
  it(
    'traegt host-autoritativen Join-, Claim-, Vote- und Round-Close-Flow ueber das lokale Relay',
    async () => {
      const gameId = `smoke-${crypto.randomUUID()}`;
      const hostSession = createEphemeralTransportSession(true);
      const guestSession = createEphemeralTransportSession(false);
      const hostBus = new NostrRelayBus({
        relayUrls: [RELAY_URL],
        session: hostSession,
      });
      const guestBus = new NostrRelayBus({
        relayUrls: [RELAY_URL],
        session: guestSession,
      });
      destroyCallbacks.push(() => hostBus.destroy());
      destroyCallbacks.push(() => guestBus.destroy());

      const guestFactory = new TransportEventFactory({
        gameId,
        clientInfo: guestSession.clientInfo,
      });
      const hostSnapshot: StateSnapshot = {
        state: createGame(),
        lastAppliedSeqByPlayer: {},
        roleOwners: {},
      };

      const hostAuthority = new HostAuthority({
        bus: hostBus,
        gameId,
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
      destroyCallbacks.push(() => hostAuthority.stop());

      const guestEvents: TransportEvent[] = [];
      const unsubscribeGuest = guestBus.subscribe(gameId, (event) => {
        guestEvents.push(event);
      });
      destroyCallbacks.push(() => unsubscribeGuest());

      await delay(150);

      await hostAuthority.publishGameCreated();
      const createdEvent = await waitForEvent(
        guestEvents,
        (event) => event.eventName === 'game-created'
      );
      expect(createdEvent).toMatchObject({
        eventName: 'game-created',
        gameId,
        hostPlayerId: hostSession.clientInfo.playerId,
      });

      await guestBus.publish(
        guestFactory.createStateSyncRequested({
          roundId: 'round-0',
          knownRoundId: 'round-0',
          knownSeqByPlayer: {},
        })
      );
      const syncEvent = await waitForEvent(
        guestEvents,
        (event) => event.eventName === 'state-sync-sent'
      );
      expect(syncEvent).toMatchObject({
        eventName: 'state-sync-sent',
        authoritativePlayerId: hostSession.clientInfo.playerId,
      });

      await guestBus.publish(
        guestFactory.createRoleClaimRequested({
          roundId: 'round-0',
          roleId: 'buergerin',
        })
      );
      const claimEvent = await waitForEvent(
        guestEvents,
        (event) =>
          event.eventName === 'role-claimed' &&
          event.claimStatus === 'accepted' &&
          event.claimedByPlayerId === guestSession.clientInfo.playerId
      );
      expect(claimEvent).toMatchObject({
        eventName: 'role-claimed',
        claimStatus: 'accepted',
        roleId: 'buergerin',
      });

      await guestBus.publish(
        guestFactory.createVoteCastRequested({
          roundId: 'round-0',
          caseId: 1,
          roleId: 'buergerin',
          optionId: 'sophia-1-a',
          isTieBreak: false,
        })
      );
      const voteEvent = await waitForEvent(
        guestEvents,
        (event) =>
          event.eventName === 'vote-cast' &&
          event.voteStatus === 'accepted' &&
          event.roleId === 'buergerin'
      );
      expect(voteEvent).toMatchObject({
        eventName: 'vote-cast',
        voteStatus: 'accepted',
        optionId: 'sophia-1-a',
      });

      await guestBus.publish(
        guestFactory.createRoundClosedRequested({
          roundId: 'round-0',
          caseId: 1,
          resolvedOptionId: 'sophia-1-a',
          voteSummary: [
            {
              roleId: 'buergerin',
              optionId: 'sophia-1-a',
              playerId: guestSession.clientInfo.playerId,
            },
          ],
        })
      );
      const roundClosedEvent = await waitForEvent(
        guestEvents,
        (event) =>
          event.eventName === 'round-closed' && event.roundCloseStatus === 'accepted'
      );
      expect(roundClosedEvent).toMatchObject({
        eventName: 'round-closed',
        roundCloseStatus: 'accepted',
        resolvedOptionId: 'sophia-1-a',
      });
    },
    15000
  );
});

async function waitForEvent(
  events: TransportEvent[],
  predicate: (event: TransportEvent) => boolean,
  timeoutMs = 4000
): Promise<TransportEvent> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const match = events.find(predicate);
    if (match) {
      return match;
    }

    await delay(50);
  }

  throw new Error('Zeitueberschreitung beim Warten auf Relay-Event');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}