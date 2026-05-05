import { describe, expect, it } from 'vitest';
import { CASES } from '../src/game/data/cases.js';
import { ENDINGS } from '../src/game/data/endings.js';
import { createGame } from '../src/game/engine/createGame.js';
import { closeRound, getEmergencyEndingBadge } from '../src/game/engine/rounds.js';

function simulateEndingDistribution(): { total: number; counts: Map<string, number> } {
  const counts = new Map<string, number>();
  const suffixPathCounts = Array.from({ length: CASES.length + 1 }, () => 1);
  for (let index = CASES.length - 1; index >= 0; index -= 1) {
    suffixPathCounts[index] = suffixPathCounts[index + 1] * CASES[index].decisions.length;
  }
  const total = suffixPathCounts[0];

  function resolveEndingBadge(state: ReturnType<typeof createGame>): string {
    const allValues = {
      ...state.values,
      macht: state.macht,
    };

    return (ENDINGS.find((ending) => ending.condition(allValues)) ?? ENDINGS[ENDINGS.length - 1]).badge;
  }

  function walk(caseIndex: number, state: ReturnType<typeof createGame>): void {
    if (caseIndex >= CASES.length) {
      const badge = resolveEndingBadge(state);
      counts.set(badge, (counts.get(badge) ?? 0) + 1);
      return;
    }

    for (const decision of CASES[caseIndex].decisions) {
      const result = closeRound(state, decision.effects, decision.text, '–');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const emergencyBadge = getEmergencyEndingBadge(result.state);
      if (emergencyBadge) {
        counts.set(
          emergencyBadge,
          (counts.get(emergencyBadge) ?? 0) + suffixPathCounts[caseIndex + 1]
        );
      } else {
        walk(caseIndex + 1, result.state);
      }
    }
  }

  walk(0, createGame());
  return { total, counts };
}

describe('ending distribution', () => {
  it('haelt alle Enden erreichbar', () => {
    const { counts } = simulateEndingDistribution();

    for (const ending of ENDINGS) {
      expect(counts.get(ending.badge) ?? 0).toBeGreaterThanOrEqual(25);
    }
  });

  it('laesst kein Ende die Verteilung dominieren', () => {
    const { total, counts } = simulateEndingDistribution();
    const maxCount = Math.max(...counts.values());

    expect(maxCount).toBeLessThan(total * 0.4);
  });
});