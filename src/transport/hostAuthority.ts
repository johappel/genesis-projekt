import { TransportEventFactory } from './eventFactory.js';
import { createGame } from '../game/engine/createGame.js';
import { getNextPendingRole, haveAllActiveRolesVoted } from '../game/engine/voting.js';
import { MULTIPLAYER_TUNING } from './config.js';
import { GAMEPLAY_TIMING } from '../game/config.js';
import { LENSES } from '../game/data/lenses.js';
import type { EphemeralTransportSession } from './session.js';
import type {
  GameResetEvent,
  LensSelectedEvent,
  PendingRoundCloseState,
  RoleClaimedEvent,
  RoundClosedEvent,
  StateSnapshot,
  TransportMessageBus,
  VoteCastEvent,
} from './types.js';

export interface HostAuthorityOptions {
  bus: TransportMessageBus;
  gameId: string;
  session: EphemeralTransportSession;
  rulesVersion: string;
  maxPlayers: number;
  validLensIds: string[];
  validRoleIds: string[];
  getCurrentRoundId: () => string;
  getAuthoritativeSnapshot: () => StateSnapshot;
  getResetSnapshot?: () => StateSnapshot;
}

export class HostAuthority {
  private readonly bus: TransportMessageBus;

  private readonly gameId: string;

  private readonly rulesVersion: string;

  private readonly maxPlayers: number;

  private readonly validLensIds: Set<string>;

  private readonly validRoleIds: Set<string>;

  private readonly getCurrentRoundId: () => string;

  private readonly getAuthoritativeSnapshot: () => StateSnapshot;

  private readonly getResetSnapshot: () => StateSnapshot;

  private readonly eventFactory: TransportEventFactory;

  private readonly acceptedRoleOwners: Record<string, string> = {};

  private readonly acceptedLensSelectionsByRound: Record<string, LensSelectedEvent> = {};

  private readonly acceptedVotesByPhase: Record<string, Record<string, VoteCastEvent>> = {};

  private readonly acceptedRoundCloses: Record<string, PendingRoundCloseState> = {};

  private readonly closedRounds = new Set<string>();

  private unsubscribe: (() => void) | null = null;

  private pendingStateSyncTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: HostAuthorityOptions) {
    this.bus = options.bus;
    this.gameId = options.gameId;
    this.rulesVersion = options.rulesVersion;
    this.maxPlayers = options.maxPlayers;
    this.validLensIds = new Set(options.validLensIds);
    this.validRoleIds = new Set(options.validRoleIds);
    this.getCurrentRoundId = options.getCurrentRoundId;
    this.getAuthoritativeSnapshot = options.getAuthoritativeSnapshot;
    this.getResetSnapshot = options.getResetSnapshot ?? createDefaultResetSnapshot;
    this.eventFactory = new TransportEventFactory({
      gameId: options.gameId,
      clientInfo: options.session.clientInfo,
    });
  }

  start(): void {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = this.bus.subscribe(this.gameId, (event) => {
      if (event.eventName === 'state-sync-requested') {
        if (event.requestedByPlayerId !== event.playerId) {
          return;
        }

        const response = this.eventFactory.createStateSyncSent({
          roundId: this.getCurrentRoundId(),
          snapshot: this.getMergedSnapshot(),
        });
        void this.bus.publish(response);
        return;
      }

      if (event.eventName === 'role-claimed' && event.claimStatus === 'requested') {
        void this.handleRoleClaimRequested(event);
        return;
      }

      if (event.eventName === 'game-reset' && event.resetStatus === 'requested') {
        void this.handleGameResetRequested(event);
        return;
      }

      if (event.eventName === 'lens-selected' && event.selectionStatus === 'requested') {
        void this.handleLensSelectedRequested(event);
        return;
      }

      if (event.eventName === 'vote-cast' && event.voteStatus === 'requested') {
        void this.handleVoteCastRequested(event);
        return;
      }

      if (event.eventName === 'round-closed' && event.roundCloseStatus === 'requested') {
        void this.handleRoundClosedRequested(event);
      }
    });
  }

  async publishGameCreated(): Promise<void> {
    const event = this.eventFactory.createGameCreated({
      roundId: this.getCurrentRoundId(),
      rulesVersion: this.rulesVersion,
      maxPlayers: this.maxPlayers,
    });
    await this.bus.publish(event);
  }

  async publishGameReset(requestedByPlayerId: string): Promise<void> {
    this.clearAuthoritativeState();
    await this.bus.publish(
      this.eventFactory.createGameResetAccepted({
        roundId: 'round-0',
        requestedByPlayerId,
        snapshot: this.getResetSnapshot(),
      })
    );
  }

  async publishAuthoritativeVote(params: {
    roundId: string;
    caseId: number;
    phaseKey: string;
    roleId: string;
    optionId: string;
    isTieBreak: boolean;
  }): Promise<void> {
    if (params.roundId !== this.getCurrentRoundId()) {
      throw new Error('ROUND_MISMATCH');
    }

    if (params.phaseKey !== getVotePhaseKey(this.getMergedSnapshot().state)) {
      throw new Error('ROUND_MISMATCH');
    }

    const ownerPlayerId = this.getMergedSnapshot().roleOwners[params.roleId];
    if (!ownerPlayerId) {
      throw new Error('ROLE_NOT_CLAIMED');
    }

    const roundVotes = this.acceptedVotesByPhase[params.phaseKey] ?? {};
    if (roundVotes[params.roleId]) {
      throw new Error('ALREADY_VOTED');
    }

    const response = this.eventFactory.createVoteCastResolved({
      roundId: params.roundId,
      caseId: params.caseId,
      phaseKey: params.phaseKey,
      roleId: params.roleId,
      optionId: params.optionId,
      claimedByPlayerId: ownerPlayerId,
      isTieBreak: params.isTieBreak,
      voteStatus: 'accepted',
    });

    this.acceptedVotesByPhase[params.phaseKey] = {
      ...roundVotes,
      [params.roleId]: response,
    };

    await this.bus.publish(response);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.pendingStateSyncTimer !== null) {
      clearTimeout(this.pendingStateSyncTimer);
      this.pendingStateSyncTimer = null;
    }
  }

  private getMergedSnapshot(): StateSnapshot {
    const snapshot = this.getAuthoritativeSnapshot();
    const currentRoundId = `round-${snapshot.state.currentCase}`;
    const phaseKey = getVotePhaseKey(snapshot.state);
    const acceptedLensSelection = this.acceptedLensSelectionsByRound[currentRoundId] ?? null;
    const authoritativeRoundVotes = Object.values(this.acceptedVotesByPhase[phaseKey] ?? {}).reduce<Record<string, string>>(
      (votes, voteEvent) => {
        votes[voteEvent.roleId] = voteEvent.optionId;
        return votes;
      },
      {}
    );

    let mergedState = {
      ...snapshot.state,
      selectedLens: acceptedLensSelection
        ? LENSES.find((lens) => lens.id === acceptedLensSelection.lensId) ?? snapshot.state.selectedLens
        : snapshot.state.selectedLens,
      phaseTimerBonusSeconds: acceptedLensSelection
        ? acceptedLensSelection.timerBonusSeconds
        : snapshot.state.phaseTimerBonusSeconds,
      roundVotes: {
        ...snapshot.state.roundVotes,
        ...authoritativeRoundVotes,
      },
    };

    if (Object.keys(authoritativeRoundVotes).length > 0 && !haveAllActiveRolesVoted(mergedState)) {
      const { role, index } = getNextPendingRole(mergedState);
      mergedState = {
        ...mergedState,
        selectedRole: role,
        currentRoleIndex: index,
      };
    }

    return {
      ...snapshot,
      state: mergedState,
      roleOwners: {
        ...snapshot.roleOwners,
        ...this.acceptedRoleOwners,
      },
      pendingRoundClose: this.acceptedRoundCloses[currentRoundId] ?? null,
    };
  }

  private async handleRoleClaimRequested(event: RoleClaimedEvent): Promise<void> {
    const resolution = this.resolveRoleClaim(event);
    const response = this.eventFactory.createRoleClaimResolved({
      roundId: this.getCurrentRoundId(),
      roleId: event.roleId,
      claimedByPlayerId: event.claimedByPlayerId,
      claimStatus: resolution.claimStatus,
      rejectionReason: resolution.rejectionReason,
    });

    await this.bus.publish(response);
    if (resolution.claimStatus === 'accepted') {
      this.scheduleFollowupStateSync();
    }
  }

  private async handleGameResetRequested(event: GameResetEvent): Promise<void> {
    await this.publishGameReset(event.requestedByPlayerId);
  }

  private async handleLensSelectedRequested(event: LensSelectedEvent): Promise<void> {
    const resolution = this.resolveLensSelection(event);
    const response = this.eventFactory.createLensSelectedResolved({
      roundId: this.getCurrentRoundId(),
      lensId: event.lensId,
      selectedByRoleId: event.selectedByRoleId,
      selectedByPlayerId: event.selectedByPlayerId,
      timerBonusSeconds: resolution.selectionStatus === 'accepted' ? event.timerBonusSeconds : 0,
      selectionStatus: resolution.selectionStatus,
      rejectionReason: resolution.rejectionReason,
    });

    if (resolution.selectionStatus === 'accepted') {
      this.acceptedLensSelectionsByRound[this.getCurrentRoundId()] = response;
    }

    await this.bus.publish(response);
    if (resolution.selectionStatus === 'accepted') {
      this.scheduleFollowupStateSync();
    }
  }

  private async handleVoteCastRequested(event: VoteCastEvent): Promise<void> {
    const resolution = this.resolveVoteCast(event);
    const response = this.eventFactory.createVoteCastResolved({
      roundId: this.getCurrentRoundId(),
      caseId: event.caseId,
      phaseKey: event.phaseKey,
      roleId: event.roleId,
      optionId: event.optionId,
      claimedByPlayerId: event.playerId,
      isTieBreak: event.isTieBreak,
      voteStatus: resolution.voteStatus,
      rejectionReason: resolution.rejectionReason,
    });

    await this.bus.publish(response);
    if (resolution.voteStatus === 'accepted') {
      this.scheduleFollowupStateSync();
    }
  }

  private async handleRoundClosedRequested(event: RoundClosedEvent): Promise<void> {
    const resolution = this.resolveRoundClosed(event);
    const response = this.eventFactory.createRoundClosedResolved({
      roundId: this.getCurrentRoundId(),
      caseId: event.caseId,
      phaseKey: event.phaseKey,
      resolvedOptionId: event.resolvedOptionId,
      closedByPlayerId: event.closedByPlayerId,
      voteSummary: event.voteSummary,
      roundCloseStatus: resolution.roundCloseStatus,
      rejectionReason: resolution.rejectionReason,
    });

    await this.bus.publish(response);
    if (resolution.roundCloseStatus === 'accepted') {
      delete this.acceptedLensSelectionsByRound[event.roundId];
      this.scheduleFollowupStateSync();
    }
  }

  private scheduleFollowupStateSync(): void {
    if (!MULTIPLAYER_TUNING.followupStateSyncEnabled) {
      return;
    }

    if (this.pendingStateSyncTimer !== null) {
      clearTimeout(this.pendingStateSyncTimer);
    }

    this.pendingStateSyncTimer = setTimeout(() => {
      this.pendingStateSyncTimer = null;
      void this.bus.publish(
        this.eventFactory.createStateSyncSent({
          roundId: this.getCurrentRoundId(),
          snapshot: this.getMergedSnapshot(),
        })
      );
    }, MULTIPLAYER_TUNING.followupStateSyncDelayMs);
  }

  private clearAuthoritativeState(): void {
    for (const roleId of Object.keys(this.acceptedRoleOwners)) {
      delete this.acceptedRoleOwners[roleId];
    }

    for (const roundId of Object.keys(this.acceptedLensSelectionsByRound)) {
      delete this.acceptedLensSelectionsByRound[roundId];
    }

    for (const phaseKey of Object.keys(this.acceptedVotesByPhase)) {
      delete this.acceptedVotesByPhase[phaseKey];
    }

    for (const roundId of Object.keys(this.acceptedRoundCloses)) {
      delete this.acceptedRoundCloses[roundId];
    }

    this.closedRounds.clear();

    if (this.pendingStateSyncTimer !== null) {
      clearTimeout(this.pendingStateSyncTimer);
      this.pendingStateSyncTimer = null;
    }
  }

  private resolveRoleClaim(event: RoleClaimedEvent): {
    claimStatus: 'accepted' | 'rejected';
    rejectionReason?: RoleClaimedEvent['rejectionReason'];
  } {
    if (event.claimedByPlayerId !== event.playerId) {
      return {
        claimStatus: 'rejected',
        rejectionReason: 'PLAYER_ALREADY_HAS_ROLE',
      };
    }

    if (!this.validRoleIds.has(event.roleId)) {
      return {
        claimStatus: 'rejected',
        rejectionReason: 'ROLE_NOT_FOUND',
      };
    }

    const currentOwners = this.getMergedSnapshot().roleOwners;
    const alreadyOwnedRole = Object.entries(currentOwners).find(([, playerId]) => playerId === event.claimedByPlayerId);
    if (alreadyOwnedRole && alreadyOwnedRole[0] !== event.roleId) {
      return {
        claimStatus: 'rejected',
        rejectionReason: 'PLAYER_ALREADY_HAS_ROLE',
      };
    }

    if (!currentOwners[event.roleId] && Object.keys(currentOwners).length >= Math.min(this.maxPlayers, this.validRoleIds.size)) {
      return {
        claimStatus: 'rejected',
        rejectionReason: 'GAME_FULL',
      };
    }

    if (currentOwners[event.roleId] && currentOwners[event.roleId] !== event.claimedByPlayerId) {
      return {
        claimStatus: 'rejected',
        rejectionReason: 'ROLE_ALREADY_TAKEN',
      };
    }

    this.acceptedRoleOwners[event.roleId] = event.claimedByPlayerId;
    return {
      claimStatus: 'accepted',
    };
  }

  private resolveLensSelection(event: LensSelectedEvent): {
    selectionStatus: 'accepted' | 'rejected';
    rejectionReason?: LensSelectedEvent['rejectionReason'];
  } {
    if (event.roundId !== this.getCurrentRoundId()) {
      return {
        selectionStatus: 'rejected',
        rejectionReason: 'ROUND_MISMATCH',
      };
    }

    if (!this.validLensIds.has(event.lensId)) {
      return {
        selectionStatus: 'rejected',
        rejectionReason: 'LENS_NOT_FOUND',
      };
    }

    const snapshot = this.getMergedSnapshot();
    const ownerPlayerId = snapshot.roleOwners[event.selectedByRoleId];
    if (!ownerPlayerId) {
      return {
        selectionStatus: 'rejected',
        rejectionReason: 'ROLE_NOT_CLAIMED',
      };
    }

    if (ownerPlayerId !== event.playerId || event.selectedByPlayerId !== event.playerId) {
      return {
        selectionStatus: 'rejected',
        rejectionReason: 'ROLE_NOT_OWNED',
      };
    }

    const initiativeRole = getLensInitiativeRole(snapshot.state);
    if (!initiativeRole || initiativeRole.id !== event.selectedByRoleId) {
      return {
        selectionStatus: 'rejected',
        rejectionReason: 'ROLE_NOT_INITIATOR',
      };
    }

    if (snapshot.state.selectedLens || this.acceptedLensSelectionsByRound[event.roundId]) {
      return {
        selectionStatus: 'rejected',
        rejectionReason: 'LENS_ALREADY_SELECTED',
      };
    }

    const usedLensIds = snapshot.state.usedLensIdsByRole[event.selectedByRoleId] ?? [];
    if (usedLensIds.includes(event.lensId)) {
      return {
        selectionStatus: 'rejected',
        rejectionReason: 'LENS_ALREADY_USED',
      };
    }

    if (event.timerBonusSeconds !== GAMEPLAY_TIMING.lensSelectionBonusSeconds) {
      return {
        selectionStatus: 'rejected',
        rejectionReason: 'ROUND_MISMATCH',
      };
    }

    return {
      selectionStatus: 'accepted',
    };
  }

  private resolveVoteCast(event: VoteCastEvent): {
    voteStatus: 'accepted' | 'rejected';
    rejectionReason?: VoteCastEvent['rejectionReason'];
  } {
    if (event.roundId !== this.getCurrentRoundId()) {
      return {
        voteStatus: 'rejected',
        rejectionReason: 'ROUND_MISMATCH',
      };
    }

    if (event.phaseKey !== getVotePhaseKey(this.getMergedSnapshot().state)) {
      return {
        voteStatus: 'rejected',
        rejectionReason: 'ROUND_MISMATCH',
      };
    }

    const roleOwners = this.getMergedSnapshot().roleOwners;
    const ownerPlayerId = roleOwners[event.roleId];
    if (!ownerPlayerId) {
      return {
        voteStatus: 'rejected',
        rejectionReason: 'ROLE_NOT_CLAIMED',
      };
    }

    if (ownerPlayerId !== event.playerId) {
      return {
        voteStatus: 'rejected',
        rejectionReason: 'ROLE_NOT_OWNED',
      };
    }

    const expectedRoleId = this.getMergedSnapshot().state.selectedRole?.id;
    if (expectedRoleId && expectedRoleId !== event.roleId) {
      return {
        voteStatus: 'rejected',
        rejectionReason: 'TURN_MISMATCH',
      };
    }

    const roundVotes = this.acceptedVotesByPhase[event.phaseKey] ?? {};
    if (roundVotes[event.roleId]) {
      return {
        voteStatus: 'rejected',
        rejectionReason: 'ALREADY_VOTED',
      };
    }

    this.acceptedVotesByPhase[event.phaseKey] = {
      ...roundVotes,
      [event.roleId]: event,
    };

    return {
      voteStatus: 'accepted',
    };
  }

  private resolveRoundClosed(event: RoundClosedEvent): {
    roundCloseStatus: 'accepted' | 'rejected';
    rejectionReason?: RoundClosedEvent['rejectionReason'];
  } {
    if (event.roundId !== this.getCurrentRoundId()) {
      return {
        roundCloseStatus: 'rejected',
        rejectionReason: 'ROUND_MISMATCH',
      };
    }

    if (event.phaseKey !== getVotePhaseKey(this.getMergedSnapshot().state)) {
      return {
        roundCloseStatus: 'rejected',
        rejectionReason: 'ROUND_MISMATCH',
      };
    }

    if (this.closedRounds.has(event.roundId)) {
      return {
        roundCloseStatus: 'rejected',
        rejectionReason: 'ROUND_ALREADY_CLOSED',
      };
    }

    const claimedRoles = Object.keys(this.getMergedSnapshot().roleOwners);
    const acceptedVotes = Object.values(
      this.acceptedVotesByPhase[event.phaseKey] ?? {}
    );
    if (!claimedRoles.length || acceptedVotes.length !== claimedRoles.length) {
      return {
        roundCloseStatus: 'rejected',
        rejectionReason: 'INCOMPLETE_VOTES',
      };
    }

    const summaryMatchesVotes = this.matchesAcceptedVoteSummary(event.voteSummary, acceptedVotes);
    if (!summaryMatchesVotes) {
      return {
        roundCloseStatus: 'rejected',
        rejectionReason: 'INVALID_RESULT',
      };
    }

    const resolvedOptionId = this.resolveAcceptedRoundOption(acceptedVotes);
    if (!resolvedOptionId || resolvedOptionId !== event.resolvedOptionId) {
      return {
        roundCloseStatus: 'rejected',
        rejectionReason: 'INVALID_RESULT',
      };
    }

    this.closedRounds.add(event.roundId);
    this.acceptedRoundCloses[event.roundId] = {
      roundId: event.roundId,
      caseId: event.caseId,
      resolvedOptionId: event.resolvedOptionId,
      voteSummary: event.voteSummary,
    };
    for (const phaseKey of Object.keys(this.acceptedVotesByPhase)) {
      if (phaseKey.startsWith(`${event.roundId}:`)) {
        delete this.acceptedVotesByPhase[phaseKey];
      }
    }
    return {
      roundCloseStatus: 'accepted',
    };
  }

  private matchesAcceptedVoteSummary(
    voteSummary: RoundClosedEvent['voteSummary'],
    acceptedVotes: VoteCastEvent[]
  ): boolean {
    if (voteSummary.length !== acceptedVotes.length) {
      return false;
    }

    const expectedSummary = acceptedVotes
      .map((vote) => ({
        roleId: vote.roleId,
        optionId: vote.optionId,
        playerId: vote.playerId,
      }))
      .sort(compareVoteSummaryEntry);

    const actualSummary = [...voteSummary].sort(compareVoteSummaryEntry);

    return expectedSummary.every((expected, index) => {
      const actual = actualSummary[index];
      return Boolean(actual)
        && actual.roleId === expected.roleId
        && actual.optionId === expected.optionId
        && actual.playerId === expected.playerId;
    });
  }

  private resolveAcceptedRoundOption(acceptedVotes: VoteCastEvent[]): string | null {
    const voteCounts = new Map<string, number>();
    for (const vote of acceptedVotes) {
      voteCounts.set(vote.optionId, (voteCounts.get(vote.optionId) ?? 0) + 1);
    }

    const maxVotes = Math.max(...voteCounts.values());
    const winningOptions = [...voteCounts.entries()]
      .filter(([, count]) => count === maxVotes)
      .map(([optionId]) => optionId);

    return winningOptions.length === 1 ? winningOptions[0] : null;
  }
}

function compareVoteSummaryEntry(
  left: { roleId: string; optionId: string; playerId: string },
  right: { roleId: string; optionId: string; playerId: string }
): number {
  const leftKey = `${left.roleId}:${left.playerId}:${left.optionId}`;
  const rightKey = `${right.roleId}:${right.playerId}:${right.optionId}`;
  return leftKey.localeCompare(rightKey);
}

function getVotePhaseKey(state: StateSnapshot['state']): string {
  return state.tieBreakOptions
    ? `round-${state.currentCase}:tie-break-${state.tieBreakRound}`
    : `round-${state.currentCase}:base`;
}

function createDefaultResetSnapshot(): StateSnapshot {
  return {
    state: createGame(),
    lastAppliedSeqByPlayer: {},
    roleOwners: {},
    phaseStartedAt: null,
    pendingRoundClose: null,
  };
}

function getLensInitiativeRole(state: StateSnapshot['state']): StateSnapshot['state']['selectedRole'] {
  if (!state.activeRoles.length) {
    return null;
  }

  return state.activeRoles[state.lensInitiativeIndex % state.activeRoles.length] ?? null;
}