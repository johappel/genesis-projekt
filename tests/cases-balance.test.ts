import { describe, expect, it } from 'vitest';
import { CASES } from '../src/game/data/cases.js';

describe('cases balance', () => {
  function countVisibleNegativeTradeoffs(effect: Record<string, number>): number {
    return Object.entries(effect).filter(([key, value]) => {
      if (value === 0) return false;
      if (key === 'macht') return value > 0;
      return value < 0;
    }).length;
  }

  it('enthaelt keine rein positive Standardantwort mit drei oder mehr Vorteilen', () => {
    for (const gameCase of CASES) {
      for (const decision of gameCase.decisions) {
        const deltas = Object.values(decision.effects);
        const positiveCount = deltas.filter((value) => value > 0).length;
        const negativeCount = deltas.filter((value) => value < 0).length;

        expect(
          positiveCount >= 3 && negativeCount === 0,
          `${decision.id} in Fall ${gameCase.id} ist zu eindeutig positiv`
        ).toBe(false);
      }
    }
  });

  it('erzwingt bei vier Vorteilen mindestens einen harten Gegenpreis', () => {
    for (const gameCase of CASES) {
      for (const decision of gameCase.decisions) {
        const deltas = Object.values(decision.effects);
        const positiveCount = deltas.filter((value) => value > 0).length;
        const negatives = deltas.filter((value) => value < 0);
        const strongestNegative = Math.min(0, ...negatives);

        expect(
          positiveCount >= 4 && negatives.length === 1 && strongestNegative > -1,
          `${decision.id} in Fall ${gameCase.id} hat zu viele Vorteile ohne spürbaren Gegenpreis`
        ).toBe(false);
      }
    }
  });

  it('zeigt in jeder Entscheidung mindestens einen sichtbaren Preis', () => {
    for (const gameCase of CASES) {
      for (const decision of gameCase.decisions) {
        expect(
          countVisibleNegativeTradeoffs(decision.effects),
          `${decision.id} in Fall ${gameCase.id} wirkt im UI weiterhin komplett grün`
        ).toBeGreaterThanOrEqual(1);
      }
    }
  });
});