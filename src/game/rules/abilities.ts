import type { BalanceEffect, GameState } from '../types.js';
import { applyEffect } from '../engine/balance.js';

export type AbilityResult =
  | { ok: true; state: GameState; effectDescription: string }
  | { ok: false; error: 'ABILITY_ALREADY_USED' | 'NO_ROLE' | 'PASSIVE_ONLY' };

/**
 * Aktiviert die Sonderfähigkeit der ausgewählten Rolle.
 * Gibt den veränderten Zustand und eine Beschreibung zurück.
 */
export function activateAbility(state: GameState): AbilityResult {
  if (!state.selectedRole) {
    return { ok: false, error: 'NO_ROLE' };
  }
  const roleId = state.selectedRole.id;
  const caseKey = `case-${state.currentCase}`;

  if (roleId === 'sozialarbeiterin') {
    return { ok: false, error: 'PASSIVE_ONLY' };
  }

  if (roleId === 'theologin') {
    if (state.abilities.usedCases[caseKey]) {
      return { ok: false, error: 'ABILITY_ALREADY_USED' };
    }
    const effect: BalanceEffect = { gerechtigkeit: 1, autonomie: 1, macht: -1 };
    let next = applyEffect(state, effect);
    next = {
      ...next,
      abilities: {
        ...next.abilities,
        usedCases: { ...next.abilities.usedCases, [caseKey]: true },
        activatedCount: {
          ...next.abilities.activatedCount,
          theologin: next.abilities.activatedCount['theologin'] + 1,
        },
        appliedCount: {
          ...next.abilities.appliedCount,
          theologin: next.abilities.appliedCount['theologin'] + 1,
        },
      },
    };
    return {
      ok: true,
      state: next,
      effectDescription:
        '✝️ Tiefenfrage gestellt: Anthropologische Risiken wurden sichtbar (+Gerechtigkeit, +Autonomie, -Macht).',
    };
  }

  if (state.abilities.usedGlobal) {
    return { ok: false, error: 'ABILITY_ALREADY_USED' };
  }

  if (roleId === 'entwicklerin') {
    const effect: BalanceEffect = { nutzen: 1, macht: -1 };
    let next = applyEffect(state, effect);
    next = markGlobalUsed(next, 'entwicklerin');
    return {
      ok: true,
      state: next,
      effectDescription: '💻 Technische Zusatzinfos aufgedeckt (+Nutzen, -Macht).',
    };
  }

  if (roleId === 'juristin') {
    let next = markGlobalUsed(state, 'juristin');
    next = { ...next, abilities: { ...next.abilities, juristinShieldActive: true } };
    return {
      ok: true,
      state: next,
      effectDescription:
        '⚖️ Regulierungs-Schutz aktiviert: Der nächste negative Friedenseffekt zählt nicht.',
    };
  }

  if (roleId === 'buergerin') {
    let next = markGlobalUsed(state, 'buergerin');
    next = { ...next, abilities: { ...next.abilities, buergerinForecastActive: true } };
    return {
      ok: true,
      state: next,
      effectDescription:
        '🗣️ Öffentliche Reaktion aktiviert: Der nächste Friedenseffekt wird verdoppelt.',
    };
  }

  if (roleId === 'prophetin') {
    let next = markGlobalUsed(state, 'prophetin');
    next = { ...next, abilities: { ...next.abilities, prophetinVetoActive: true } };
    return {
      ok: true,
      state: next,
      effectDescription:
        '🔥 Prophetisches Veto bereit: Die nächste Entscheidung wird gestoppt und neu beraten.',
    };
  }

  return { ok: false, error: 'NO_ROLE' };
}

function markGlobalUsed(state: GameState, roleId: string): GameState {
  return {
    ...state,
    abilities: {
      ...state.abilities,
      usedGlobal: true,
      activatedCount: {
        ...state.abilities.activatedCount,
        [roleId]: (state.abilities.activatedCount[roleId] ?? 0) + 1,
      },
    },
  };
}

/** Gibt zurück ob die Fähigkeit der aktuell ausgewählten Rolle verfügbar ist. */
export function isAbilityAvailable(state: GameState): boolean {
  if (!state.selectedRole) return false;
  const roleId = state.selectedRole.id;
  if (roleId === 'sozialarbeiterin') return false;
  if (roleId === 'theologin') {
    const caseKey = `case-${state.currentCase}`;
    return !state.abilities.usedCases[caseKey];
  }
  return !state.abilities.usedGlobal;
}
