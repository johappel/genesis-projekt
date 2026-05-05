import type { GameState } from '../game/types.js';

export type TransportEventName =
  | 'game-created'
  | 'role-claimed'
  | 'vote-cast'
  | 'round-closed'
  | 'player-left'
  | 'state-sync-requested'
  | 'state-sync-sent';

export interface TransportEnvelope {
  eventName: TransportEventName;
  gameId: string;
  roundId: string;
  playerId: string;
  seq: number;
  sentAt: number;
  actorPubkey: string;
  protocolVersion: 1;
}

export interface VoteSummaryEntry {
  roleId: string;
  optionId: string;
  playerId: string;
}

export interface StateSnapshot {
  state: GameState;
  lastAppliedSeqByPlayer: Record<string, number>;
  roleOwners: Record<string, string>;
}

export interface GameCreatedEvent extends TransportEnvelope {
  eventName: 'game-created';
  hostPlayerId: string;
  rulesVersion: string;
  maxPlayers: number;
}

export interface RoleClaimedEvent extends TransportEnvelope {
  eventName: 'role-claimed';
  roleId: string;
  claimedByPlayerId: string;
}

export interface VoteCastEvent extends TransportEnvelope {
  eventName: 'vote-cast';
  caseId: number;
  roleId: string;
  optionId: string;
  isTieBreak: boolean;
}

export interface RoundClosedEvent extends TransportEnvelope {
  eventName: 'round-closed';
  caseId: number;
  resolvedOptionId: string;
  closedByPlayerId: string;
  voteSummary: VoteSummaryEntry[];
}

export interface PlayerLeftEvent extends TransportEnvelope {
  eventName: 'player-left';
  leftPlayerId: string;
  releasedRoleIds: string[];
}

export interface StateSyncRequestedEvent extends TransportEnvelope {
  eventName: 'state-sync-requested';
  requestedByPlayerId: string;
  knownRoundId: string;
  knownSeqByPlayer: Record<string, number>;
}

export interface StateSyncSentEvent extends TransportEnvelope {
  eventName: 'state-sync-sent';
  authoritativePlayerId: string;
  snapshot: StateSnapshot;
}

export type TransportEvent =
  | GameCreatedEvent
  | RoleClaimedEvent
  | VoteCastEvent
  | RoundClosedEvent
  | PlayerLeftEvent
  | StateSyncRequestedEvent
  | StateSyncSentEvent;

export interface TransportClientInfo {
  playerId: string;
  pubkey: string;
  isHost: boolean;
}

export interface TransportMessageBus {
  publish(event: TransportEvent): Promise<void>;
  subscribe(gameId: string, onEvent: (event: TransportEvent) => void): () => void;
  destroy?(): void;
}