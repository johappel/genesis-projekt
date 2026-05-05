import { describe, it, expect } from 'vitest';
import { createGame } from '../src/game/engine/createGame.js';
import { assignRole } from '../src/game/engine/roles.js';
import { activateAbility } from '../src/game/rules/abilities.js';

describe('activateAbility()', () => {
  it('gibt der Jurist:in +1 Gerechtigkeit und aktiviert den Friedensschild', () => {
    let state = createGame();
    const roleResult = assignRole(state, 'juristin');
    expect(roleResult.ok).toBe(true);
    if (!roleResult.ok) return;
    state = roleResult.state;

    const result = activateAbility(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.values.gerechtigkeit).toBe(1);
    expect(result.state.abilities.juristinShieldActive).toBe(true);
    expect(result.effectDescription).toContain('+Gerechtigkeit');
  });
});