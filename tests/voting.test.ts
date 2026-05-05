import { describe, it, expect } from 'vitest';
import { createGame } from '../src/game/engine/createGame.js';
import { assignRole } from '../src/game/engine/roles.js';
import { castVote } from '../src/game/engine/voting.js';

const OPTION_IDS = ['sophia-1-a', 'sophia-1-b', 'sophia-1-c', 'sophia-1-d'];

describe('castVote()', () => {
  it('speichert eine Stimme erfolgreich', () => {
    let state = createGame();
    const roleResult = assignRole(state, 'theologin');
    expect(roleResult.ok).toBe(true);
    if (!roleResult.ok) return;
    state = roleResult.state;

    const result = castVote(state, 1, 'sophia-1-b', OPTION_IDS);
    expect(result.ok).toBe(true);
  });

  it('lässt Bilanzwerte nach dem Voting unverändert', () => {
    let state = createGame();
    const roleResult = assignRole(state, 'theologin');
    if (!roleResult.ok) return;
    state = roleResult.state;

    const result = castVote(state, 1, 'sophia-1-a', OPTION_IDS);
    if (!result.ok) return;
    // Effekte werden erst beim Rundenabschluss angewendet
    expect(result.state.values.nutzen).toBe(0);
    expect(result.state.macht).toBe(state.macht);
  });

  it('lehnt eine Doppelstimme ab', () => {
    let state = createGame();
    const roleResult = assignRole(state, 'entwicklerin');
    if (!roleResult.ok) return;
    state = roleResult.state;

    const first = castVote(state, 1, 'sophia-1-a', OPTION_IDS);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = castVote(first.state, 1, 'sophia-1-b', OPTION_IDS);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toBe('ALREADY_VOTED');
    }
  });

  it('lehnt eine unbekannte Option ab', () => {
    let state = createGame();
    const roleResult = assignRole(state, 'juristin');
    if (!roleResult.ok) return;
    state = roleResult.state;

    const result = castVote(state, 1, 'unknown-option-xyz', OPTION_IDS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('UNKNOWN_OPTION');
    }
  });

  it('lehnt Abstimmung ohne ausgewählte Rolle ab', () => {
    const state = createGame();
    const result = castVote(state, 1, 'sophia-1-a', OPTION_IDS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('NO_ROLE_SELECTED');
    }
  });

  it('erlaubt zwei verschiedene Rollen für denselben Fall', () => {
    let state = createGame();

    let r1 = assignRole(state, 'theologin');
    if (!r1.ok) return;
    let v1 = castVote(r1.state, 1, 'sophia-1-a', OPTION_IDS);
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;

    let r2 = assignRole(v1.state, 'juristin');
    if (!r2.ok) return;
    let v2 = castVote(r2.state, 1, 'sophia-1-c', OPTION_IDS);
    expect(v2.ok).toBe(true);
  });
});
