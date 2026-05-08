import type { GameState } from '../game/types.js';

import { MULTIPLAYER_DEFAULTS, MULTIPLAYER_TUNING } from '../config.js';
import { TransportEventFactory } from './eventFactory.js';
import { HostAuthority } from './hostAuthority.js';
import { NostrRelayBus } from './nostrRelayBus.js';
import { createEphemeralTransportSession } from './session.js';
import type {
  LensSelectedEvent,
  PaktSubmittedEvent,
  PaktVotedEvent,
  RoundClosedEvent,
  RoleClaimedEvent,
  StateSnapshot,
  TransportEvent,
  VoteCastEvent,
} from './types.js';

const REQUEST_SYNC_DELAY_MS = MULTIPLAYER_TUNING.initialStateSyncDelayMs;

export function formatRelayIssueMessage(relayUrl: string, detail?: string): string {
  const normalizedDetail = detail?.trim();
  return normalizedDetail
    ? `Das angegebene Relay ${relayUrl} ist nicht erreichbar. Prüfe die URL oder starte den Relay-Server. Details: ${normalizedDetail}`
    : `Das angegebene Relay ${relayUrl} ist nicht erreichbar. Prüfe die URL oder starte den Relay-Server.`;
}

export interface MultiplayerUrlConfig {
  mode: 'host' | 'join';
  gameId: string;
  relayUrl: string;
  relayUrls: string[];
}

function getSessionPersistenceKey(config: MultiplayerUrlConfig): string {
  return `genesis:transport-session:${config.mode}:${config.gameId}:${config.relayUrls.join(',')}`;
}

export interface RelayMultiplayerRuntimeOptions {
  config: MultiplayerUrlConfig;
  rulesVersion: string;
  maxPlayers: number;
  validLensIds: string[];
  validRoleIds: string[];
  getCurrentRoundId: () => string;
  getAuthoritativeState: () => GameState;
  createResetState: () => GameState;
  getPhaseStartedAt: () => number | null;
  onRelayIssue?: (message: string) => void;
}

type TransportListener = (event: TransportEvent) => void;

function parseRelayUrlList(input: string): string[] {
  const raw = input.trim();
  if (!raw) {
    return [];
  }

  const relayUrls = raw
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().replace(/^[\[\]"']+|[\[\]"']+$/g, ''))
    .filter(Boolean);

  return Array.from(new Set(relayUrls));
}

export function readMultiplayerUrlConfig(search: string): MultiplayerUrlConfig | null {
  const params = new URLSearchParams(search);
  const mode = params.get('mp');
  const gameId = params.get('game')?.trim();
  const relayValues = params.getAll('relay');
  const relayUrls = relayValues.length > 0
    ? parseRelayUrlList(relayValues.join(','))
    : [...MULTIPLAYER_DEFAULTS.relayUrls];
  const relayUrl = relayUrls[0] ?? MULTIPLAYER_DEFAULTS.relayUrls[0];

  if ((mode !== 'host' && mode !== 'join') || !gameId) {
    return null;
  }

  return {
    mode,
    gameId,
    relayUrl,
    relayUrls: relayUrls.length > 0 ? relayUrls : [...MULTIPLAYER_DEFAULTS.relayUrls],
  };
}

export function createRelayJoinUrl(baseUrl: string, config: MultiplayerUrlConfig): string {
  const url = new URL(baseUrl);
  url.searchParams.set('mp', 'join');
  url.searchParams.set('game', config.gameId);
  url.searchParams.set('relay', config.relayUrls.join(','));
  return url.toString();
}

export class RelayMultiplayerRuntime {
  private readonly config: MultiplayerUrlConfig;

  private readonly eventFactory: TransportEventFactory;

  private readonly bus: NostrRelayBus;

  private readonly hostAuthority: HostAuthority | null;

  private readonly getCurrentRoundId: () => string;

  private readonly getAuthoritativeState: () => GameState;

  private readonly createResetState: () => GameState;

  private readonly getPhaseStartedAt: () => number | null;

  private readonly listeners = new Set<TransportListener>();

  private readonly onRelayIssue?: (message: string) => void;

  private readonly seenEventIds = new Set<string>();

  private unsubscribe: (() => void) | null = null;

  private readonly session;

  private roleOwners: Record<string, string> = {};

  private authoritativeHostPlayerId: string | null = null;

  private lastRelayIssueMessage: string | null = null;

  constructor(options: RelayMultiplayerRuntimeOptions) {
    this.config = options.config;
    this.getCurrentRoundId = options.getCurrentRoundId;
    this.getAuthoritativeState = options.getAuthoritativeState;
    this.createResetState = options.createResetState;
    this.getPhaseStartedAt = options.getPhaseStartedAt;
    this.onRelayIssue = options.onRelayIssue;
    this.session = createEphemeralTransportSession(
      options.config.mode === 'host',
      getSessionPersistenceKey(options.config),
    );
    this.bus = new NostrRelayBus({
      relayUrls: options.config.relayUrls,
      session: this.session,
      onConnectionIssue: ({ relayUrls, reason }) => {
        this.reportRelayIssue(formatRelayIssueMessage(relayUrls.join(', '), reason));
      },
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
          validLensIds: options.validLensIds,
          validRoleIds: options.validRoleIds,
          getCurrentRoundId: options.getCurrentRoundId,
          getAuthoritativeSnapshot: () => this.getAuthoritativeSnapshot(),
          getResetSnapshot: () => this.getResetSnapshot(),
        })
      : null;

    if (options.config.mode === 'host') {
      this.authoritativeHostPlayerId = this.session.clientInfo.playerId;
    }
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

  get relayUrls(): string[] {
    return [...this.config.relayUrls];
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
      this.lastRelayIssueMessage = null;
      const eventId = event.messageId ?? `${event.actorPubkey}:${event.seq}`;
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
      void this.hostAuthority?.publishGameCreated().catch((error: unknown) => {
        this.reportRelayIssue(
          formatRelayIssueMessage(
            this.config.relayUrl,
            error instanceof Error ? error.message : 'Der Host-Start konnte nicht an das Relay gesendet werden.'
          )
        );
      });
      return;
    }

    setTimeout(() => {
      void this.requestStateSync().catch((error: unknown) => {
        this.reportRelayIssue(
          formatRelayIssueMessage(
            this.config.relayUrl,
            error instanceof Error ? error.message : 'Die erste Synchronisierung mit dem Relay ist fehlgeschlagen.'
          )
        );
      });
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

  async selectLens(params: {
    lensId: string;
    selectedByRoleId: string;
    timerBonusSeconds: number;
  }): Promise<void> {
    await this.bus.publish(
      this.eventFactory.createLensSelectedRequested({
        roundId: this.getCurrentRoundId(),
        lensId: params.lensId,
        selectedByRoleId: params.selectedByRoleId,
        timerBonusSeconds: params.timerBonusSeconds,
      })
    );
  }

  async openPhase(): Promise<void> {
    await this.bus.publish(
      this.eventFactory.createPhaseOpened({
        roundId: this.getCurrentRoundId(),
        snapshot: this.getAuthoritativeSnapshot(),
      })
    );
  }

  async castVote(params: {
    caseId: number;
    phaseKey: string;
    roleId: string;
    optionId: string;
    isTieBreak: boolean;
  }): Promise<void> {
    await this.bus.publish(
      this.eventFactory.createVoteCastRequested({
        roundId: this.getCurrentRoundId(),
        caseId: params.caseId,
        phaseKey: params.phaseKey,
        roleId: params.roleId,
        optionId: params.optionId,
        isTieBreak: params.isTieBreak,
      })
    );
  }

  async closeRound(params: {
    caseId: number;
    phaseKey: string;
    resolvedOptionId: string;
    voteSummary: RoundClosedEvent['voteSummary'];
  }): Promise<void> {
    await this.bus.publish(
      this.eventFactory.createRoundClosedRequested({
        roundId: this.getCurrentRoundId(),
        caseId: params.caseId,
        phaseKey: params.phaseKey,
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

  async requestGameReset(): Promise<void> {
    await this.bus.publish(
      this.eventFactory.createGameResetRequested({
        roundId: this.getCurrentRoundId(),
      })
    );
  }

  async submitPakt(params: {
    submittedByRoleId: string;
    answers: PaktSubmittedEvent['answers'];
  }): Promise<void> {
    await this.bus.publish(
      this.eventFactory.createPaktSubmittedRequested({
        roundId: this.getCurrentRoundId(),
        submittedByRoleId: params.submittedByRoleId,
        answers: params.answers,
      })
    );
  }

  async votePaktArticle(params: {
    articleId: PaktVotedEvent['articleId'];
    votedByRoleId: string;
    twoPointsRoleId: string;
    onePointRoleId: string;
  }): Promise<void> {
    await this.bus.publish(
      this.eventFactory.createPaktVotedRequested({
        roundId: this.getCurrentRoundId(),
        articleId: params.articleId,
        votedByRoleId: params.votedByRoleId,
        twoPointsRoleId: params.twoPointsRoleId,
        onePointRoleId: params.onePointRoleId,
      })
    );
  }

  async resolveTimedOutVote(params: {
    caseId: number;
    phaseKey: string;
    roleId: string;
    optionId: string;
    isTieBreak: boolean;
  }): Promise<void> {
    if (!this.isHost || !this.hostAuthority) {
      return;
    }

    await this.hostAuthority.publishAuthoritativeVote({
      roundId: this.getCurrentRoundId(),
      caseId: params.caseId,
      phaseKey: params.phaseKey,
      roleId: params.roleId,
      optionId: params.optionId,
      isTieBreak: params.isTieBreak,
    });
  }

  async broadcastStateSync(): Promise<void> {
    if (!this.isHost) {
      return;
    }

    await this.bus.publish(
      this.eventFactory.createStateSyncSent({
        roundId: this.getCurrentRoundId(),
        snapshot: this.getAuthoritativeSnapshot(),
      })
    );
  }

  private getAuthoritativeSnapshot(): StateSnapshot {
    return {
      state: this.getAuthoritativeState(),
      lastAppliedSeqByPlayer: {},
      roleOwners: this.getRoleOwners(),
      phaseStartedAt: this.getPhaseStartedAt(),
    };
  }

  private getResetSnapshot(): StateSnapshot {
    return {
      state: this.createResetState(),
      lastAppliedSeqByPlayer: {},
      roleOwners: {},
      phaseStartedAt: null,
      pendingRoundClose: null,
    };
  }

  private applyRuntimeEffects(event: TransportEvent): void {
    if (event.eventName === 'game-created') {
      this.authoritativeHostPlayerId = event.hostPlayerId;
      return;
    }

    if (event.eventName === 'state-sync-sent') {
      this.authoritativeHostPlayerId = event.authoritativePlayerId;
      this.roleOwners = { ...event.snapshot.roleOwners };
      return;
    }

    if (event.eventName === 'game-reset' && event.resetStatus === 'accepted' && event.snapshot) {
      this.authoritativeHostPlayerId = event.authoritativePlayerId ?? this.authoritativeHostPlayerId;
      this.roleOwners = { ...event.snapshot.roleOwners };
      return;
    }

    if (event.eventName === 'phase-opened') {
      if (this.authoritativeHostPlayerId && event.authoritativePlayerId !== this.authoritativeHostPlayerId) {
        return;
      }

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

  private reportRelayIssue(message: string): void {
    if (this.lastRelayIssueMessage === message) {
      return;
    }

    this.lastRelayIssueMessage = message;
    this.onRelayIssue?.(message);
  }
}

export function isAcceptedRoleClaim(event: TransportEvent): event is RoleClaimedEvent {
  return event.eventName === 'role-claimed' && event.claimStatus === 'accepted';
}

export function isAcceptedLensSelection(event: TransportEvent): event is LensSelectedEvent {
  return event.eventName === 'lens-selected' && event.selectionStatus === 'accepted';
}

export function isAcceptedPaktSubmission(event: TransportEvent): event is PaktSubmittedEvent {
  return event.eventName === 'pakt-submitted' && event.submitStatus === 'accepted';
}

export function isAcceptedPaktVote(event: TransportEvent): event is PaktVotedEvent {
  return event.eventName === 'pakt-voted' && event.voteStatus === 'accepted';
}

export function isAcceptedVote(event: TransportEvent): event is VoteCastEvent {
  return event.eventName === 'vote-cast' && event.voteStatus === 'accepted';
}

export function isAcceptedRoundClose(event: TransportEvent): event is RoundClosedEvent {
  return event.eventName === 'round-closed' && event.roundCloseStatus === 'accepted';
}