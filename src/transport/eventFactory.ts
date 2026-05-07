import type {
  GameCreatedEvent,
  GameResetEvent,
  LensSelectedEvent,
  PaktSubmittedEvent,
  PaktVotedEvent,
  PhaseOpenedEvent,
  RoundClosedEvent,
  RoleClaimedEvent,
  StateSnapshot,
  StateSyncRequestedEvent,
  StateSyncSentEvent,
  TransportClientInfo,
  TransportEnvelope,
  VoteCastEvent,
} from './types.js';

export interface TransportEventFactoryOptions {
  gameId: string;
  clientInfo: TransportClientInfo;
  initialSeq?: number;
}

export class TransportEventFactory {
  private readonly gameId: string;

  private readonly clientInfo: TransportClientInfo;

  private seq: number;

  constructor(options: TransportEventFactoryOptions) {
    this.gameId = options.gameId;
    this.clientInfo = options.clientInfo;
    this.seq = options.initialSeq ?? 0;
  }

  createGameCreated(params: {
    roundId: string;
    rulesVersion: string;
    maxPlayers: number;
  }): GameCreatedEvent {
    return {
      ...this.createEnvelope<'game-created'>('game-created', params.roundId),
      hostPlayerId: this.clientInfo.playerId,
      rulesVersion: params.rulesVersion,
      maxPlayers: params.maxPlayers,
    };
  }

  createGameResetRequested(params: {
    roundId: string;
  }): GameResetEvent {
    return {
      ...this.createEnvelope<'game-reset'>('game-reset', params.roundId),
      requestedByPlayerId: this.clientInfo.playerId,
      resetStatus: 'requested',
    };
  }

  createGameResetAccepted(params: {
    roundId: string;
    requestedByPlayerId: string;
    snapshot: StateSnapshot;
  }): GameResetEvent {
    return {
      ...this.createEnvelope<'game-reset'>('game-reset', params.roundId),
      playerId: params.requestedByPlayerId,
      requestedByPlayerId: params.requestedByPlayerId,
      resetStatus: 'accepted',
      authoritativePlayerId: this.clientInfo.playerId,
      snapshot: params.snapshot,
    };
  }

  createPaktSubmittedRequested(params: {
    roundId: string;
    submittedByRoleId: string;
    answers: PaktSubmittedEvent['answers'];
  }): PaktSubmittedEvent {
    return {
      ...this.createEnvelope<'pakt-submitted'>('pakt-submitted', params.roundId),
      submittedByRoleId: params.submittedByRoleId,
      submittedByPlayerId: this.clientInfo.playerId,
      answers: params.answers,
      submitStatus: 'requested',
    };
  }

  createPaktSubmittedResolved(params: {
    roundId: string;
    submittedByRoleId: string;
    submittedByPlayerId: string;
    answers: PaktSubmittedEvent['answers'];
    submitStatus: 'accepted' | 'rejected';
    rejectionReason?: PaktSubmittedEvent['rejectionReason'];
  }): PaktSubmittedEvent {
    return {
      ...this.createEnvelope<'pakt-submitted'>('pakt-submitted', params.roundId),
      playerId: params.submittedByPlayerId,
      submittedByRoleId: params.submittedByRoleId,
      submittedByPlayerId: params.submittedByPlayerId,
      answers: params.answers,
      submitStatus: params.submitStatus,
      authoritativePlayerId: this.clientInfo.playerId,
      rejectionReason: params.rejectionReason,
    };
  }

  createPaktVotedRequested(params: {
    roundId: string;
    articleId: PaktVotedEvent['articleId'];
    votedByRoleId: string;
    twoPointsRoleId: string;
    onePointRoleId: string;
  }): PaktVotedEvent {
    return {
      ...this.createEnvelope<'pakt-voted'>('pakt-voted', params.roundId),
      articleId: params.articleId,
      votedByRoleId: params.votedByRoleId,
      votedByPlayerId: this.clientInfo.playerId,
      twoPointsRoleId: params.twoPointsRoleId,
      onePointRoleId: params.onePointRoleId,
      voteStatus: 'requested',
    };
  }

  createPaktVotedResolved(params: {
    roundId: string;
    articleId: PaktVotedEvent['articleId'];
    votedByRoleId: string;
    votedByPlayerId: string;
    twoPointsRoleId: string;
    onePointRoleId: string;
    voteStatus: 'accepted' | 'rejected';
    rejectionReason?: PaktVotedEvent['rejectionReason'];
  }): PaktVotedEvent {
    return {
      ...this.createEnvelope<'pakt-voted'>('pakt-voted', params.roundId),
      playerId: params.votedByPlayerId,
      articleId: params.articleId,
      votedByRoleId: params.votedByRoleId,
      votedByPlayerId: params.votedByPlayerId,
      twoPointsRoleId: params.twoPointsRoleId,
      onePointRoleId: params.onePointRoleId,
      voteStatus: params.voteStatus,
      authoritativePlayerId: this.clientInfo.playerId,
      rejectionReason: params.rejectionReason,
    };
  }

  createPhaseOpened(params: {
    roundId: string;
    snapshot: StateSnapshot;
  }): PhaseOpenedEvent {
    return {
      ...this.createEnvelope<'phase-opened'>('phase-opened', params.roundId),
      authoritativePlayerId: this.clientInfo.playerId,
      snapshot: params.snapshot,
    };
  }

  createLensSelectedRequested(params: {
    roundId: string;
    lensId: string;
    selectedByRoleId: string;
    timerBonusSeconds: number;
  }): LensSelectedEvent {
    return {
      ...this.createEnvelope<'lens-selected'>('lens-selected', params.roundId),
      lensId: params.lensId,
      selectedByRoleId: params.selectedByRoleId,
      selectedByPlayerId: this.clientInfo.playerId,
      timerBonusSeconds: params.timerBonusSeconds,
      selectionStatus: 'requested',
    };
  }

  createLensSelectedResolved(params: {
    roundId: string;
    lensId: string;
    selectedByRoleId: string;
    selectedByPlayerId: string;
    timerBonusSeconds: number;
    selectionStatus: 'accepted' | 'rejected';
    rejectionReason?: LensSelectedEvent['rejectionReason'];
  }): LensSelectedEvent {
    return {
      ...this.createEnvelope<'lens-selected'>('lens-selected', params.roundId),
      playerId: params.selectedByPlayerId,
      lensId: params.lensId,
      selectedByRoleId: params.selectedByRoleId,
      selectedByPlayerId: params.selectedByPlayerId,
      timerBonusSeconds: params.timerBonusSeconds,
      selectionStatus: params.selectionStatus,
      authoritativePlayerId: this.clientInfo.playerId,
      rejectionReason: params.rejectionReason,
    };
  }

  createRoleClaimRequested(params: {
    roundId: string;
    roleId: string;
  }): RoleClaimedEvent {
    return {
      ...this.createEnvelope<'role-claimed'>('role-claimed', params.roundId),
      roleId: params.roleId,
      claimedByPlayerId: this.clientInfo.playerId,
      claimStatus: 'requested',
    };
  }

  createRoleClaimResolved(params: {
    roundId: string;
    roleId: string;
    claimedByPlayerId: string;
    claimStatus: 'accepted' | 'rejected';
    rejectionReason?: RoleClaimedEvent['rejectionReason'];
  }): RoleClaimedEvent {
    return {
      ...this.createEnvelope<'role-claimed'>('role-claimed', params.roundId),
      roleId: params.roleId,
      claimedByPlayerId: params.claimedByPlayerId,
      claimStatus: params.claimStatus,
      authoritativePlayerId: this.clientInfo.playerId,
      rejectionReason: params.rejectionReason,
    };
  }

  createVoteCastRequested(params: {
    roundId: string;
    caseId: number;
    phaseKey?: string;
    roleId: string;
    optionId: string;
    isTieBreak: boolean;
  }): VoteCastEvent {
    return {
      ...this.createEnvelope<'vote-cast'>('vote-cast', params.roundId),
      caseId: params.caseId,
      phaseKey: params.phaseKey ?? getDefaultPhaseKey(params.roundId, params.isTieBreak),
      roleId: params.roleId,
      optionId: params.optionId,
      isTieBreak: params.isTieBreak,
      voteStatus: 'requested',
    };
  }

  createVoteCastResolved(params: {
    roundId: string;
    caseId: number;
    phaseKey?: string;
    roleId: string;
    optionId: string;
    claimedByPlayerId: string;
    isTieBreak: boolean;
    voteStatus: 'accepted' | 'rejected';
    rejectionReason?: VoteCastEvent['rejectionReason'];
  }): VoteCastEvent {
    return {
      ...this.createEnvelope<'vote-cast'>('vote-cast', params.roundId),
      playerId: params.claimedByPlayerId,
      caseId: params.caseId,
      phaseKey: params.phaseKey ?? getDefaultPhaseKey(params.roundId, params.isTieBreak),
      roleId: params.roleId,
      optionId: params.optionId,
      isTieBreak: params.isTieBreak,
      voteStatus: params.voteStatus,
      authoritativePlayerId: this.clientInfo.playerId,
      rejectionReason: params.rejectionReason,
    };
  }

  createRoundClosedRequested(params: {
    roundId: string;
    caseId: number;
    phaseKey?: string;
    resolvedOptionId: string;
    voteSummary: RoundClosedEvent['voteSummary'];
  }): RoundClosedEvent {
    return {
      ...this.createEnvelope<'round-closed'>('round-closed', params.roundId),
      caseId: params.caseId,
      phaseKey: params.phaseKey ?? getDefaultPhaseKey(params.roundId, false),
      resolvedOptionId: params.resolvedOptionId,
      closedByPlayerId: this.clientInfo.playerId,
      voteSummary: params.voteSummary,
      roundCloseStatus: 'requested',
    };
  }

  createRoundClosedResolved(params: {
    roundId: string;
    caseId: number;
    phaseKey?: string;
    resolvedOptionId: string;
    closedByPlayerId: string;
    voteSummary: RoundClosedEvent['voteSummary'];
    roundCloseStatus: 'accepted' | 'rejected';
    rejectionReason?: RoundClosedEvent['rejectionReason'];
  }): RoundClosedEvent {
    return {
      ...this.createEnvelope<'round-closed'>('round-closed', params.roundId),
      playerId: params.closedByPlayerId,
      caseId: params.caseId,
      phaseKey: params.phaseKey ?? getDefaultPhaseKey(params.roundId, false),
      resolvedOptionId: params.resolvedOptionId,
      closedByPlayerId: params.closedByPlayerId,
      voteSummary: params.voteSummary,
      roundCloseStatus: params.roundCloseStatus,
      authoritativePlayerId: this.clientInfo.playerId,
      rejectionReason: params.rejectionReason,
    };
  }

  createStateSyncRequested(params: {
    roundId: string;
    knownRoundId: string;
    knownSeqByPlayer: Record<string, number>;
  }): StateSyncRequestedEvent {
    return {
      ...this.createEnvelope<'state-sync-requested'>('state-sync-requested', params.roundId),
      requestedByPlayerId: this.clientInfo.playerId,
      knownRoundId: params.knownRoundId,
      knownSeqByPlayer: params.knownSeqByPlayer,
    };
  }

  createStateSyncSent(params: {
    roundId: string;
    snapshot: StateSnapshot;
  }): StateSyncSentEvent {
    return {
      ...this.createEnvelope<'state-sync-sent'>('state-sync-sent', params.roundId),
      authoritativePlayerId: this.clientInfo.playerId,
      snapshot: params.snapshot,
    };
  }

  private createEnvelope<TEventName extends TransportEnvelope['eventName']>(
    eventName: TEventName,
    roundId: string
  ): Omit<TransportEnvelope, 'eventName'> & { eventName: TEventName } {
    this.seq += 1;

    return {
      eventName,
      gameId: this.gameId,
      roundId,
      playerId: this.clientInfo.playerId,
      seq: this.seq,
      sentAt: Date.now(),
      actorPubkey: this.clientInfo.pubkey,
      protocolVersion: 1,
    };
  }
}

function getDefaultPhaseKey(roundId: string, isTieBreak: boolean): string {
  return isTieBreak ? `${roundId}:tie-break-1` : `${roundId}:base`;
}