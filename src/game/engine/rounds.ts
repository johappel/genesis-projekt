import type { BalanceEffect, GameState, ProtocolEntry } from '../types.js';
import { CASES } from '../data/cases.js';
import { applyEffect } from './balance.js';

export type RoundCloseResult =
  | { ok: true; state: GameState; systemicNotes: string[] }
  | { ok: false; error: 'VOTES_INCOMPLETE' | 'CASE_ALREADY_CLOSED' };

export function getAppliedRoundEffect(chosenEffect: BalanceEffect): BalanceEffect {
  const appliedEffect: BalanceEffect = { ...chosenEffect };

  // Wachsende algorithmische Macht hat fast immer infrastrukturelle und ökologische Kosten.
  if ((chosenEffect.macht ?? 0) > 0) {
    appliedEffect.schoepfung = (appliedEffect.schoepfung ?? 0) - 1;
  }

  return appliedEffect;
}

/**
 * Schließt die aktuelle Runde ab:
 * 1. Prüft, ob eine Abstimmung vorliegt (mind. 1 Stimme).
 * 2. Wendet Entscheidungseffekte an.
 * 3. Wendet systemische Folgeeffekte an.
 * 4. Protokolliert das Ergebnis.
 * 5. Rückt zum nächsten Fall vor oder markiert das Finale.
 */
export function closeRound(
  state: GameState,
  chosenEffect: BalanceEffect,
  decisionText: string,
  lensName: string
): RoundCloseResult {
  const caseData = CASES[state.currentCase];
  if (!caseData) {
    return { ok: false, error: 'CASE_ALREADY_CLOSED' };
  }

  // Effekte anwenden
  let nextState = applyEffect(state, getAppliedRoundEffect(chosenEffect));

  // Systemische Folgewirkungen berechnen
  const { nextState: afterSystemic, notes } = applySystemicConsequences(nextState);
  nextState = afterSystemic;

  // Protokolleintrag
  const entry: ProtocolEntry = {
    fall: `Fall ${caseData.id}: ${caseData.title}`,
    entscheidung: decisionText,
    linse: lensName,
  };

  // Linsen-Nutzung tracken
  const linsenUsed = { ...nextState.linsenUsed };
  if (lensName && lensName !== '–') {
    linsenUsed[lensName] = (linsenUsed[lensName] ?? 0) + 1;
  }

  nextState = {
    ...nextState,
    protokoll: [...nextState.protokoll, entry],
    linsenUsed,
    currentCase: nextState.currentCase + 1,
  };

  return { ok: true, state: nextState, systemicNotes: notes };
}

/**
 * Berechnet systemische Folgewirkungen nach jeder Entscheidung.
 * Gibt veränderten Zustand und Erklärungsnotizen zurück.
 */
function applySystemicConsequences(
  state: GameState
): { nextState: GameState; notes: string[] } {
  const notes: string[] = [];
  let s = state;

  const { nutzen, gerechtigkeit, autonomie, schoepfung } = s.values;

  if (nutzen <= -2) {
    s = applyEffect(s, { frieden: -1 });
    notes.push('Zu geringer Nutzen schwächt Bildung, Gesundheit oder Sicherheit spürbar.');
    if (gerechtigkeit <= -1) {
      s = applyEffect(s, { frieden: -1 });
      notes.push(
        'Weil die Versorgungslücke ungleich verteilt ist, tragen benachteiligte Gruppen die Folgen zuerst.'
      );
    }
  }

  if (nutzen >= 2 && gerechtigkeit <= -2) {
    s = applyEffect(s, { frieden: -1 });
    notes.push(
      'Hoher Systemnutzen bei niedriger Gerechtigkeit erzeugt technokratische Ruhe statt sozialem Frieden.'
    );
  }

  if (autonomie <= -2 && s.macht >= 7) {
    s = applyEffect(s, { frieden: -1 });
    notes.push(
      'Wenn Macht wächst und menschliche Letztentscheidung schwindet, kippt Hilfe in Fremdsteuerung.'
    );
  }

  if (schoepfung <= -2) {
    s = applyEffect(s, { nutzen: -1 });
    notes.push('Steigende ökologische und infrastrukturelle Kosten fressen den praktischen Nutzen des KI-Einsatzes auf.');
  }

  if (schoepfung <= -3 && nutzen <= 0) {
    s = applyEffect(s, { frieden: -1 });
    notes.push('Hohe ökologische Kosten ohne klaren Gemeinwohlnutzen verschärfen den Verteilungskonflikt in der Stadt.');
  }

  if (schoepfung <= -2 && gerechtigkeit <= -1) {
    s = applyEffect(s, { frieden: -1 });
    notes.push(
      'Wenn ökologische Lasten ungleich verteilt werden, wird Nachhaltigkeit als soziale Zumutung erlebt.'
    );
  }

  if (gerechtigkeit <= -3 && s.values.frieden <= 0) {
    s = applyEffect(s, { frieden: -1 });
    notes.push('Tiefe Ungerechtigkeit verschärft Protest, Rückzug und soziale Eskalation.');
  }

  if (schoepfung >= 2 && gerechtigkeit >= 1 && nutzen >= 0 && s.macht <= 6) {
    s = applyEffect(s, { frieden: 1 });
    notes.push(
      'Nachhaltige und fair verteilte KI-Nutzung stabilisiert den sozialen Zusammenhalt.'
    );
  }

  return { nextState: s, notes };
}

/**
 * Prüft ob ein Notfall-Ende ausgelöst werden soll
 * (vor regulärer Endauswertung zu prüfen).
 */
export function getEmergencyEndingBadge(state: GameState): string | null {
  if (state.macht >= 10 || state.values.autonomie <= -5) {
    return '👁️'; // PAX DOMINUS
  }
  if (state.values.nutzen <= -5) {
    return '🧨'; // Versorgungskollaps
  }
  if (state.values.gerechtigkeit <= -5) {
    return '🏚️'; // Soziale Unruhen
  }
  if (state.values.frieden <= -5) {
    return '⚔️'; // Kampf um Ressourcen
  }
  if (state.values.schoepfung <= -5) {
    return '🌪️'; // Klimakostenexplosion
  }
  return null;
}

/**
 * Systemisches Risikowarnungs-Label für die UI.
 */
export function getSystemicRiskWarning(state: GameState): string {
  if (state.values.nutzen <= -4) {
    return '⚠️ Versorgungskollaps droht: KI bringt der Stadt weniger, als sie sie kostet.';
  }
  if (state.values.gerechtigkeit <= -4) {
    return '⚠️ Soziale Unruhen drohen: Ungerechtigkeit hat eine kritische Schwelle erreicht.';
  }
  if (state.values.frieden <= -4) {
    return '⚠️ Kampf um Ressourcen droht: Der soziale Zusammenhalt kippt in offene Konkurrenz.';
  }
  if (state.values.schoepfung <= -4) {
    return '⚠️ Klimakostenexplosion droht: Die ökologischen und infrastrukturellen Schäden werden untragbar.';
  }
  if (state.macht >= 9 || state.values.autonomie <= -4) {
    return '⚠️ PAX DOMINUS droht: Macht und Kontrollverlust kippen in Fremdsteuerung.';
  }
  if (state.values.schoepfung <= -1) {
    return '⚠️ Die ökologischen und infrastrukturellen Kosten des KI-Einsatzes steigen deutlich.';
  }
  if (state.values.nutzen <= -2) {
    return '⚠️ Zu geringer Nutzen: zentrale Systeme für Bildung, Gesundheit oder Sicherheit verlieren spürbar Leistung.';
  }
  return '';
}

/** Gibt das passende Ende anhand des Spielzustands zurück. */
export function resolveEnding(state: GameState) {
  const all = {
    ...state.values,
    macht: state.macht,
  };
  // Import hier vermeiden; Endings werden in der UI direkt geprüft
  return all;
}
