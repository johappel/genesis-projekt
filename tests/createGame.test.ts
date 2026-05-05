import { describe, it, expect } from 'vitest';
import { createGame } from '../src/game/engine/createGame.js';
import { INITIAL_MACHT } from '../src/game/data/balance.js';

describe('createGame()', () => {
  it('erzeugt einen vollständigen Startzustand', () => {
    const state = createGame();
    expect(state.currentCase).toBe(0);
    expect(state.selectedRole).toBeNull();
    expect(state.activeRoles).toEqual([]);
    expect(state.roundVotes).toEqual({});
    expect(state.councilPreVoteOptionId).toBeNull();
    expect(state.tieBreakOptions).toBeNull();
    expect(state.selectedLens).toBeNull();
  });

  it('setzt Werte auf Startwerte', () => {
    const state = createGame();
    expect(state.values.nutzen).toBe(0);
    expect(state.values.gerechtigkeit).toBe(0);
    expect(state.values.frieden).toBe(0);
    expect(state.values.schoepfung).toBe(0);
    expect(state.values.autonomie).toBe(0);
  });

  it('setzt Sonderwerte korrekt', () => {
    const state = createGame();
    expect(state.macht).toBe(INITIAL_MACHT);
  });

  it('ist mit JSON.stringify serialisierbar', () => {
    const state = createGame();
    expect(() => JSON.stringify(state)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(state));
    expect(parsed.currentCase).toBe(0);
  });

  it('erzeugt unabhängige Werteobjekte bei mehrfachem Aufruf', () => {
    const a = createGame();
    const b = createGame();
    a.values.nutzen = 3;
    expect(b.values.nutzen).toBe(0);
  });
});
