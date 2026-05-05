import { describe, it, expect } from 'vitest';
import { createGame } from '../src/game/engine/createGame.js';
import { assignRole } from '../src/game/engine/roles.js';
import {
  advanceToNextRole,
  beginTieBreak,
  castVote,
  determineRoundDecision,
  haveAllActiveRolesVoted,
} from '../src/game/engine/voting.js';

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

  it('kennt den naechsten abstimmenden Rollenwechsel', () => {
    let state = createGame();
    const firstRole = assignRole(state, 'theologin');
    if (!firstRole.ok) return;
    const secondRole = assignRole(firstRole.state, 'juristin');
    if (!secondRole.ok) return;

    const voted = castVote(secondRole.state, 1, 'sophia-1-a', OPTION_IDS);
    expect(voted.ok).toBe(true);
    if (!voted.ok) return;

    const nextState = advanceToNextRole(voted.state);
    expect(nextState.selectedRole?.id).toBe('theologin');
  });

  it('bestimmt Mehrheitsentscheidung nach letzter Stimme', () => {
    let state = createGame();
    const roleA = assignRole(state, 'theologin');
    if (!roleA.ok) return;
    const roleB = assignRole(roleA.state, 'juristin');
    if (!roleB.ok) return;
    const roleC = assignRole(roleB.state, 'entwicklerin');
    if (!roleC.ok) return;

    const voteA = castVote(roleC.state, 1, 'sophia-1-a', OPTION_IDS);
    if (!voteA.ok) return;
    const nextA = advanceToNextRole(voteA.state);
    const voteB = castVote(nextA, 1, 'sophia-1-b', OPTION_IDS);
    if (!voteB.ok) return;
    const nextB = advanceToNextRole(voteB.state);
    const voteC = castVote(nextB, 1, 'sophia-1-b', OPTION_IDS);
    if (!voteC.ok) return;

    expect(haveAllActiveRolesVoted(voteC.state)).toBe(true);
    expect(determineRoundDecision(voteC.state, OPTION_IDS)).toEqual({
      status: 'resolved',
      optionId: 'sophia-1-b',
      voteCount: 2,
    });
  });

  it('zaehlt das Vorvotum nicht als zusaetzliche Stimme mit', () => {
    let state = createGame();
    const roleA = assignRole(state, 'theologin');
    if (!roleA.ok) return;
    const roleB = assignRole(roleA.state, 'juristin');
    if (!roleB.ok) return;

    state = {
      ...roleB.state,
      councilPreVoteOptionId: 'sophia-1-a',
    };

    const voteA = castVote(state, 1, 'sophia-1-a', OPTION_IDS);
    if (!voteA.ok) return;
    const nextA = advanceToNextRole(voteA.state);
    const voteB = castVote(nextA, 1, 'sophia-1-b', OPTION_IDS);
    if (!voteB.ok) return;

    expect(determineRoundDecision(voteB.state, OPTION_IDS)).toEqual({
      status: 'tie-break',
      optionIds: ['sophia-1-a', 'sophia-1-b'],
      voteCount: 1,
    });
  });

  it('erzeugt Stichwahlstatus bei Gleichstand', () => {
    let state = createGame();
    const roleA = assignRole(state, 'theologin');
    if (!roleA.ok) return;
    const roleB = assignRole(roleA.state, 'juristin');
    if (!roleB.ok) return;

    const voteA = castVote(roleB.state, 1, 'sophia-1-a', OPTION_IDS);
    if (!voteA.ok) return;
    const nextA = advanceToNextRole(voteA.state);
    const voteB = castVote(nextA, 1, 'sophia-1-b', OPTION_IDS);
    if (!voteB.ok) return;

    const decision = determineRoundDecision(voteB.state, OPTION_IDS);
    expect(decision).toEqual({
      status: 'tie-break',
      optionIds: ['sophia-1-a', 'sophia-1-b'],
      voteCount: 1,
    });

    if (decision?.status !== 'tie-break') return;
    const tieBreakState = beginTieBreak(voteB.state, decision.optionIds);
    expect(tieBreakState.roundVotes).toEqual({});
    expect(tieBreakState.councilPreVoteOptionId).toBeNull();
    expect(tieBreakState.tieBreakOptions).toEqual(['sophia-1-a', 'sophia-1-b']);
    expect(tieBreakState.selectedRole?.id).toBe('theologin');
  });
});
