import { describe, it, expect } from 'vitest';
import { createGame } from '../src/game/engine/createGame.js';
import { assignRole } from '../src/game/engine/roles.js';
import { closeRound, getEmergencyEndingBadge } from '../src/game/engine/rounds.js';
import { CASES } from '../src/game/data/cases.js';

describe('closeRound()', () => {
  it('wendet Effekte genau einmal an', () => {
    let state = createGame();
    const r = assignRole(state, 'theologin');
    if (!r.ok) return;
    state = r.state;

    const effect = { nutzen: 2, macht: 1 };
    const result = closeRound(state, effect, 'Test-Entscheidung', 'werkzeug');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Effekte sind angewendet
    expect(result.state.values.nutzen).toBe(2);
    // Runde weitergerückt
    expect(result.state.currentCase).toBe(1);
  });

  it('schreibt einen Protokolleintrag', () => {
    let state = createGame();
    const r = assignRole(state, 'juristin');
    if (!r.ok) return;
    state = r.state;

    const result = closeRound(state, { gerechtigkeit: 1 }, 'Regulierungsoption', 'macht');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.protokoll.length).toBe(1);
    expect(result.state.protokoll[0].entscheidung).toBe('Regulierungsoption');
  });

  it('clampt Werte auf Maximalwert', () => {
    let state = createGame();
    const r = assignRole(state, 'theologin');
    if (!r.ok) return;
    state = r.state;

    // Mehrmals hintereinander abschließen mit großem Positiveffekt
    let s = state;
    for (let i = 0; i < CASES.length; i++) {
      const res = closeRound(s, { nutzen: 5 }, `Runde ${i}`, '–');
      if (!res.ok) break;
      s = res.state;
    }
    expect(s.values.nutzen).toBeLessThanOrEqual(5);
  });

  it('clampt Macht auf Maximalwert 10', () => {
    let state = createGame();
    const r = assignRole(state, 'entwicklerin');
    if (!r.ok) return;
    state = r.state;

    let s = state;
    for (let i = 0; i < CASES.length; i++) {
      const res = closeRound(s, { macht: 5 }, `Runde ${i}`, '–');
      if (!res.ok) break;
      s = res.state;
    }
    expect(s.macht).toBeLessThanOrEqual(10);
  });

  it('zieht Schöpfung bei wachsender Macht nach unten', () => {
    let state = createGame();
    const r = assignRole(state, 'entwicklerin');
    if (!r.ok) return;
    state = r.state;

    const result = closeRound(state, { macht: 1 }, 'Machtausbau', '–');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.values.schoepfung).toBe(-1);
  });

  it('zieht bei Schöpfungskrise zusätzlich Nutzen ab', () => {
    let state = createGame();
    const r = assignRole(state, 'juristin');
    if (!r.ok) return;
    state = r.state;

    const result = closeRound(state, { schoepfung: -2 }, 'Ökokrise', '–');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.values.schoepfung).toBe(-2);
    expect(result.state.values.nutzen).toBe(-1);
    expect(getEmergencyEndingBadge(result.state)).toBeNull();
  });
});
