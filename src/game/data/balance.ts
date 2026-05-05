import type { GameValueKey } from '../types.js';

// -------- Skalengrenzen --------
export const VALUE_MIN: Record<GameValueKey, number> = {
  nutzen: -5,
  gerechtigkeit: -5,
  frieden: -5,
  schoepfung: -5,
  autonomie: -5,
};

export const VALUE_MAX: Record<GameValueKey, number> = {
  nutzen: 5,
  gerechtigkeit: 5,
  frieden: 5,
  schoepfung: 5,
  autonomie: 5,
};

export const SPECIAL_MIN = { macht: 0 } as const;
export const SPECIAL_MAX = { macht: 10 } as const;

// -------- Startwerte --------
export const INITIAL_VALUES: Record<GameValueKey, number> = {
  nutzen: 0,
  gerechtigkeit: 0,
  frieden: 0,
  schoepfung: 0,
  autonomie: 0,
};

export const INITIAL_MACHT = 5;

// -------- Krisenschwellen --------

/** Ab diesem Macht-Wert beginnt die kritische Phase. */
export const MACHT_WARN_THRESHOLD = 6;
/** Ab diesem Macht-Wert ist PAX DOMINUS möglich. */
export const MACHT_CRITICAL_THRESHOLD = 8;

/** Tiefe Krise für einen Einzelwert. */
export const DEEP_CRISIS_THRESHOLD = -3;

// -------- Entscheidungs-Timer --------
export const DECISION_TIMER_SECONDS = 90;

// -------- Wertelabels --------
export const VALUE_LABELS: Record<string, string> = {
  nutzen: '📈 Nutzen',
  gerechtigkeit: '⚖️ Gerechtigkeit',
  frieden: '☮️ Frieden',
  schoepfung: '🌱 Schöpfung',
  autonomie: '🤲 Autonomie',
  macht: '⚡ Macht',
};
