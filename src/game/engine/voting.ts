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
  caseId: number,
  optionId: string,
  availableOptionIds: string[]
): VoteResult {
  if (!state.selectedRole) {
    return { ok: false, error: 'NO_ROLE_SELECTED' };
  }
  const voteKey = `case-${caseId}-${state.selectedRole.id}`;
  if (state.abilities.usedCases[voteKey]) {
    return { ok: false, error: 'ALREADY_VOTED' };
  }
  if (!availableOptionIds.includes(optionId)) {
    return { ok: false, error: 'UNKNOWN_OPTION' };
  }

  const newUsedCases = { ...state.abilities.usedCases, [voteKey]: true };
  return {
    ok: true,
    state: {
      ...state,
      abilities: { ...state.abilities, usedCases: newUsedCases },
    },
  };
}

/**
 * Wendet gesammelte Effekte nach dem Rundenabschluss an.
 * Gibt den veränderten Zustand zurück.
 */
export function applyRoundEffect(state: GameState, effect: BalanceEffect): GameState {
  return applyEffect(state, effect);
}
