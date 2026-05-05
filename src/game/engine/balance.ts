import type { BalanceEffect, GameState, GameValueKey } from '../types.js';
import {
  VALUE_MIN,
  VALUE_MAX,
  SPECIAL_MIN,
  SPECIAL_MAX,
} from '../data/balance.js';

// -------- Hilfsfunktionen --------

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Wendet einen BalanceEffect auf den Spielzustand an.
 * Gibt den veränderten Zustand zurück (immutabel).
 */
export function applyEffect(state: GameState, effect: BalanceEffect): GameState {
  const newValues = { ...state.values };
  let macht = state.macht;

  for (const [key, delta] of Object.entries(effect) as [string, number][]) {
    if (!delta) continue;
    if (key === 'macht') {
      macht = clamp(macht + delta, SPECIAL_MIN.macht, SPECIAL_MAX.macht);
    } else if (Object.prototype.hasOwnProperty.call(newValues, key)) {
      const k = key as GameValueKey;
      newValues[k] = clamp(newValues[k] + delta, VALUE_MIN[k], VALUE_MAX[k]);
    }
  }

  return { ...state, values: newValues, macht };
}

/**
 * Zählt die Werte, die auf oder unter dem tiefen Krisenschwellwert liegen.
 */
export function countDeepCrisisValues(state: GameState, threshold = -3): number {
  return (['nutzen', 'gerechtigkeit', 'frieden', 'autonomie'] as GameValueKey[]).filter(
    (k) => state.values[k] <= threshold
  ).length;
}
