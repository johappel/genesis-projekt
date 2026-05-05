import { describe, it, expect } from 'vitest';
import { createGame } from '../src/game/engine/createGame.js';
import { assignRole } from '../src/game/engine/roles.js';

describe('assignRole()', () => {
  it('vergibt eine bekannte Rolle', () => {
    const state = createGame();
    const result = assignRole(state, 'theologin');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.selectedRole?.id).toBe('theologin');
      expect(result.state.activeRoles.map((role) => role.id)).toEqual(['theologin']);
    }
  });

  it('lehnt eine unbekannte Rollen-ID ab', () => {
    const state = createGame();
    const result = assignRole(state, 'unbekannte-rolle');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('ROLE_NOT_FOUND');
    }
  });

  it('lehnt dieselbe Rolle zweimal ab', () => {
    const state = createGame();
    const first = assignRole(state, 'juristin');
    expect(first.ok).toBe(true);
    if (first.ok) {
      const second = assignRole(first.state, 'juristin');
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.error).toBe('ROLE_ALREADY_TAKEN');
      }
    }
  });

  it('erlaubt Rollenwechsel auf eine andere Rolle', () => {
    const state = createGame();
    const first = assignRole(state, 'theologin');
    expect(first.ok).toBe(true);
    if (first.ok) {
      const second = assignRole(first.state, 'entwicklerin');
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(second.state.selectedRole?.id).toBe('entwicklerin');
        expect(second.state.activeRoles.map((role) => role.id)).toEqual([
          'theologin',
          'entwicklerin',
        ]);
      }
    }
  });

  it('verändert den Original-Zustand nicht (immutabel)', () => {
    const state = createGame();
    assignRole(state, 'buergerin');
    expect(state.selectedRole).toBeNull();
  });
});
