import { CASES } from '../src/game/data/cases.js';
import { ENDINGS } from '../src/game/data/endings.js';
import { createGame } from '../src/game/engine/createGame.js';
import { closeRound, getEmergencyEndingBadge } from '../src/game/engine/rounds.js';

const counts = new Map<string, number>();
const suffixPathCounts = Array.from({ length: CASES.length + 1 }, () => 1);
for (let index = CASES.length - 1; index >= 0; index -= 1) {
  suffixPathCounts[index] = suffixPathCounts[index + 1] * CASES[index].decisions.length;
}

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
    if (!result.ok) continue;

    const emergencyBadge = getEmergencyEndingBadge(result.state);
    if (emergencyBadge) {
      counts.set(emergencyBadge, (counts.get(emergencyBadge) ?? 0) + suffixPathCounts[caseIndex + 1]);
    } else {
      walk(caseIndex + 1, result.state);
    }
  }
}

walk(0, createGame());
console.log(JSON.stringify(Object.fromEntries([...counts.entries()].sort()), null, 2));
