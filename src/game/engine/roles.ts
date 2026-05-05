import type { GameState, Role } from '../types.js';
import { ROLES } from '../data/roles.js';

export type RoleResult =
  | { ok: true; state: GameState }
  | { ok: false; error: 'ROLE_NOT_FOUND' | 'ROLE_ALREADY_TAKEN' };

/**
 * Weist dem Spielzustand eine Rolle zu.
 * – Unbekannte IDs werden abgelehnt.
 * – Eine bereits vergebene Rolle (selectedRole bereits gesetzt und gleiche ID) wird abgelehnt.
 */
export function assignRole(state: GameState, roleId: string): RoleResult {
  const role: Role | undefined = ROLES.find((r) => r.id === roleId);
  if (!role) {
    return { ok: false, error: 'ROLE_NOT_FOUND' };
  }
  if (state.activeRoles.some((activeRole) => activeRole.id === roleId)) {
    return { ok: false, error: 'ROLE_ALREADY_TAKEN' };
  }

  const nextActiveRoles = [...state.activeRoles, role];
  return {
    ok: true,
    state: {
      ...state,
      activeRoles: nextActiveRoles,
      selectedRole: role,
    },
  };
}
