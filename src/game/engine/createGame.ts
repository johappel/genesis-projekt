import type { GameState, GameValueKey } from '../types.js';
import {
  INITIAL_VALUES,
  INITIAL_MACHT,
} from '../data/balance.js';

export function createGame(): GameState {
  return {
    currentCase: 0,
    selectedRole: null,
    activeRoles: [],
    currentRoleIndex: 0,
    selectedLens: null,
    values: { ...INITIAL_VALUES } as Record<GameValueKey, number>,
    macht: INITIAL_MACHT,
    roundVotes: {},
    councilPreVoteOptionId: null,
    tieBreakOptions: null,
    abilities: {
      usedGlobalByRole: {},
      usedCaseAbilities: {},
      juristinShieldActive: false,
      buergerinForecastActive: false,
      prophetinVetoActive: false,
      activatedCount: {
        theologin: 0,
        entwicklerin: 0,
        juristin: 0,
        sozialarbeiterin: 0,
        buergerin: 0,
        prophetin: 0,
      },
      appliedCount: {
        theologin: 0,
        entwicklerin: 0,
        juristin: 0,
        sozialarbeiterin: 0,
        buergerin: 0,
        prophetin: 0,
      },
    },
    protokoll: [],
    linsenUsed: {},
    pakt: {},
  };
}
