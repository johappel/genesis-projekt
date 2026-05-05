import type { GameState } from '../game/types.js';

import { TransportEventFactory } from './eventFactory.js';
import { HostAuthority } from './hostAuthority.js';
import { NostrRelayBus } from './nostrRelayBus.js';
import { createEphemeralTransportSession } from './session.js';
import type {
  RoundClosedEvent,
  RoleClaimedEvent,
  StateSnapshot,
  TransportEvent,
  VoteCastEvent,
} from './types.js';

const DEFAULT_RELAY_URL = 'http://localhost:7000/';
const REQUEST_SYNC_DELAY_MS = 120;

export interface MultiplayerUrlConfig {
  mode: 'host' | 'join';
  gameId: string;
  relayUrl: string;
}

export interface RelayMultiplayerRuntimeOptions {
  config: MultiplayerUrlConfig;
  rulesVersion: string;
  maxPlayers: number;
  validRoleIds: string[];
  getCurrentRoundId: () => string;
  getAuthoritativeState: () => GameState;
}

type TransportListener = (event: TransportEvent) => void;

export function readMultiplayerUrlConfig(search: string): MultiplayerUrlConfig | null {
  const params = new URLSearchParams(search);
  const mode = params.get('mp');
  const gameId = params.get('game')?.trim();
  const relayUrl = params.get('relay')?.trim() || DEFAULT_RELAY_URL;

  if ((mode !== 'host' && mode !== 'join') || !gameId) {
    return null;
  }

  return {
    mode,
    gameId,
    relayUrl,
  };
}

export function createRelayJoinUrl(baseUrl: string, config: MultiplayerUrlConfig): string {
  const url = new URL(baseUrl);
  url.searchParams.set('mp', 'join');
  url.searchParams.set('game', config.gameId);
  url.searchParams.set('relay', config.relayUrl);
  return url.toString();
}

export class RelayMultiplayerRuntime {
  private readonly config: MultiplayerUrlConfig;

  private readonly eventFactory: TransportEventFactory;

  private readonly bus: NostrRelayBus;

  private readonly hostAuthority: HostAuthority | null;

  private readonly getCurrentRoundId: () => string;

  private readonly getAuthoritativeState: () => GameState;

  private readonly listeners = new Set<TransportListener>();

  private readonly seenEventIds = new Set<string>();

  private unsubscribe: (() => void) | null = null;

  private readonly session;

  private roleOwners: Record<string, string> = {};

  constructor(options: RelayMultiplayerRuntimeOptions) {
    this.config = options.config;
    this.getCurrentRoundId = options.getCurrentRoundId;
    this.getAuthoritativeState = options.getAuthoritativeState;
    this.session = createEphemeralTransportSession(options.config.mode === 'host');
    this.bus = new NostrRelayBus({
      relayUrls: [options.config.relayUrl],
      session: this.session,
    });
    this.eventFactory = new TransportEventFactory({
      gameId: options.config.gameId,
      clientInfo: this.session.clientInfo,
    });
    this.hostAuthority = options.config.mode === 'host'
      ? new HostAuthority({
          bus: this.bus,
          gameId: options.config.gameId,
          session: this.session,
          rulesVersion: options.rulesVersion,
          maxPlayers: options.maxPlayers,
          validRoleIds: options.validRoleIds,
          getCurrentRoundId: options.getCurrentRoundId,
          getAuthoritativeSnapshot: () => this.getAuthoritativeSnapshot(),
        })
      : null;
  }

  get isEnabled(): true {
    return true;
  }

  get isHost(): boolean {
    return this.config.mode === 'host';
  }

  get gameId(): string {
    return this.config.gameId;
  }

  get relayUrl(): string {
    return this.config.relayUrl;
  }

  get playerId(): string {
    return this.session.clientInfo.playerId;
  }

  get playerPubkey(): string {
    return this.session.clientInfo.pubkey;
  }

  getRoleOwners(): Record<string, string> {
    return { ...this.roleOwners };
  }

  ownsRole(roleId: string): boolean {
    return this.roleOwners[roleId] === this.playerId;
  }

  onEvent(listener: TransportListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = this.bus.subscribe(this.gameId, (event) => {
      const eventId = `${event.playerId}:${event.seq}`;
      if (this.seenEventIds.has(eventId)) {
        return;
      }

      this.seenEventIds.add(eventId);
      this.applyRuntimeEffects(event);
      for (const listener of this.listeners) {
        listener(event);
      }
    });

    this.hostAuthority?.start();

    if (this.isHost) {
      void this.hostAuthority?.publishGameCreated();
      return;
    }

    setTimeout(() => {
      void this.requestStateSync();
    }, REQUEST_SYNC_DELAY_MS);
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.hostAuthority?.stop();
    this.bus.destroy();
  }

  async claimRole(roleId: string): Promise<void> {
    await this.bus.publish(
      this.eventFactory.createRoleClaimRequested({
        roundId: this.getCurrentRoundId(),
        roleId,
      })
    );
  }

  async castVote(params: {
    caseId: number;
    roleId: string;
    optionId: string;
    isTieBreak: boolean;
  }): Promise<void> {
    await this.bus.publish(
      this.eventFactory.createVoteCastRequested({
        roundId: this.getCurrentRoundId(),
        caseId: params.caseId,
        roleId: params.roleId,
        optionId: params.optionId,
        isTieBreak: params.isTieBreak,
      })
    );
  }

  async closeRound(params: {
    caseId: number;
    resolvedOptionId: string;
    voteSummary: RoundClosedEvent['voteSummary'];
  }): Promise<void> {
    await this.bus.publish(
      this.eventFactory.createRoundClosedRequested({
        roundId: this.getCurrentRoundId(),
        caseId: params.caseId,
        resolvedOptionId: params.resolvedOptionId,
        voteSummary: params.voteSummary,
      })
    );
  }

  async requestStateSync(): Promise<void> {
    await this.bus.publish(
      this.eventFactory.createStateSyncRequested({
        roundId: this.getCurrentRoundId(),
        knownRoundId: this.getCurrentRoundId(),
        knownSeqByPlayer: {},
      })
    );
  }

  private getAuthoritativeSnapshot(): StateSnapshot {
    return {
      state: this.getAuthoritativeState(),
      lastAppliedSeqByPlayer: {},
      roleOwners: this.getRoleOwners(),
    };
  }

  private applyRuntimeEffects(event: TransportEvent): void {
    if (event.eventName === 'state-sync-sent') {
      this.roleOwners = { ...event.snapshot.roleOwners };
      return;
    }

    if (event.eventName === 'role-claimed' && event.claimStatus === 'accepted') {
      this.roleOwners[event.roleId] = event.claimedByPlayerId;
      return;
    }

    if (event.eventName === 'player-left') {
      const nextOwners = { ...this.roleOwners };
      for (const roleId of event.releasedRoleIds) {
        delete nextOwners[roleId];
      }
      this.roleOwners = nextOwners;
    }
  }
}

export function isAcceptedRoleClaim(event: TransportEvent): event is RoleClaimedEvent {
  return event.eventName === 'role-claimed' && event.claimStatus === 'accepted';
}

export function isAcceptedVote(event: TransportEvent): event is VoteCastEvent {
  return event.eventName === 'vote-cast' && event.voteStatus === 'accepted';
}

export function isAcceptedRoundClose(event: TransportEvent): event is RoundClosedEvent {
  return event.eventName === 'round-closed' && event.roundCloseStatus === 'accepted';
}