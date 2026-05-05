import type { BalanceEffect, GameState } from '../types.js';
import { applyEffect } from './balance.js';

export type VoteResult =
  | { ok: true; state: GameState }
  | { ok: false; error: 'NO_ROLE_SELECTED' | 'ALREADY_VOTED' | 'UNKNOWN_OPTION' };

/**
 * Registriert die Stimme einer Rolle für eine Entscheidungsoption.
 *
 * Regeln:
 * – Eine Rolle muss ausgewählt sein.
 * – Eine Rolle kann pro Fall nur einmal abstimmen.
 * – Die Entscheidungs-ID muss bekannt sein.
 * – Effekte werden NICHT sofort angewendet (erst bei Rundenabschluss).
 */
export function castVote(
  state: GameState,
  _caseId: number,
  optionId: string,
  availableOptionIds: string[]
): VoteResult {
  if (!state.selectedRole) {
    return { ok: false, error: 'NO_ROLE_SELECTED' };
  }
  const roleId = state.selectedRole.id;
  if (state.roundVotes[roleId]) {
    return { ok: false, error: 'ALREADY_VOTED' };
  }
  if (!availableOptionIds.includes(optionId)) {
    return { ok: false, error: 'UNKNOWN_OPTION' };
  }

  return {
    ok: true,
    state: {
      ...state,
      roundVotes: {
        ...state.roundVotes,
        [roleId]: optionId,
      },
    },
  };
}

export function haveAllActiveRolesVoted(state: GameState): boolean {
  return state.activeRoles.length > 0 && state.activeRoles.every((role) => Boolean(state.roundVotes[role.id]));
}

export function getNextPendingRole(state: GameState): { role: GameState['selectedRole']; index: number } {
  for (let offset = 1; offset <= state.activeRoles.length; offset += 1) {
    const nextIndex = (state.currentRoleIndex + offset) % state.activeRoles.length;
    const role = state.activeRoles[nextIndex];
    if (role && !state.roundVotes[role.id]) {
      return { role, index: nextIndex };
    }
  }

  return { role: null, index: state.currentRoleIndex };
}

export function advanceToNextRole(state: GameState): GameState {
  const { role, index } = getNextPendingRole(state);
  return {
    ...state,
    selectedRole: role,
    currentRoleIndex: index,
  };
}

export type RoundDecisionResult =
  | { status: 'resolved'; optionId: string; voteCount: number }
  | { status: 'tie-break'; optionIds: string[]; voteCount: number };

export function determineRoundDecision(
  state: GameState,
  availableOptionIds: string[]
): RoundDecisionResult | null {
  if (!haveAllActiveRolesVoted(state)) {
    return null;
  }

  const voteCounts = new Map<string, number>();
  for (const optionId of Object.values(state.roundVotes)) {
    voteCounts.set(optionId, (voteCounts.get(optionId) ?? 0) + 1);
  }

  const maxVotes = Math.max(...voteCounts.values());
  const topOptionIds = availableOptionIds.filter((optionId) => (voteCounts.get(optionId) ?? 0) === maxVotes);

  if (topOptionIds.length === 1) {
    return { status: 'resolved', optionId: topOptionIds[0], voteCount: maxVotes };
  }

  return { status: 'tie-break', optionIds: topOptionIds, voteCount: maxVotes };
}

export function beginTieBreak(state: GameState, optionIds: string[]): GameState {
  return {
    ...state,
    roundVotes: {},
    councilPreVoteOptionId: null,
    tieBreakOptions: [...optionIds],
    currentRoleIndex: 0,
    selectedRole: state.activeRoles[0] ?? null,
  };
}

export function resetRoundVotingState(state: GameState): GameState {
  return {
    ...state,
    roundVotes: {},
    councilPreVoteOptionId: null,
    tieBreakOptions: null,
    currentRoleIndex: 0,
    selectedRole: state.activeRoles[0] ?? null,
  };
}

/**
 * Wendet gesammelte Effekte nach dem Rundenabschluss an.
 * Gibt den veränderten Zustand zurück.
 */
export function applyRoundEffect(state: GameState, effect: BalanceEffect): GameState {
  return applyEffect(state, effect);
}
