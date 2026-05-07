import type { GameState, PaktArticleId, PaktArticleVote } from '../types.js';

export const PAKT_ARTICLE_IDS: PaktArticleId[] = [
  'artikel-1',
  'artikel-2',
  'artikel-3',
  'artikel-4',
  'artikel-5',
];

export function isPaktScoringRequired(state: GameState): boolean {
  return state.activeRoles.length > 2;
}

export function haveAllActiveRolesSubmittedPakt(state: GameState): boolean {
  return state.activeRoles.length > 0 && state.activeRoles.every((role) => Boolean(state.paktSubmissionsByRole[role.id]));
}

export function haveAllActiveRolesVotedOnArticle(state: GameState, articleId: PaktArticleId): boolean {
  if (!isPaktScoringRequired(state)) {
    return haveAllActiveRolesSubmittedPakt(state);
  }

  const votesByRole = state.paktArticleVotesByArticle[articleId] ?? {};
  return state.activeRoles.length > 0 && state.activeRoles.every((role) => Boolean(votesByRole[role.id]));
}

export function haveAllActiveRolesCompletedPaktVoting(state: GameState): boolean {
  if (!haveAllActiveRolesSubmittedPakt(state)) {
    return false;
  }

  if (!isPaktScoringRequired(state)) {
    return true;
  }

  return PAKT_ARTICLE_IDS.every((articleId) => haveAllActiveRolesVotedOnArticle(state, articleId));
}

export function deriveResolvedPakt(state: GameState): {
  finalPakt: Record<PaktArticleId, string>;
  winnersByArticle: Partial<Record<PaktArticleId, string[]>>;
} {
  if (!haveAllActiveRolesSubmittedPakt(state)) {
    return {
      finalPakt: {} as Record<PaktArticleId, string>,
      winnersByArticle: {},
    };
  }

  const finalPakt = {} as Record<PaktArticleId, string>;
  const winnersByArticle: Partial<Record<PaktArticleId, string[]>> = {};

  for (const articleId of PAKT_ARTICLE_IDS) {
    const winnerRoleIds = isPaktScoringRequired(state)
      ? deriveArticleWinnerRoleIds(state, articleId)
      : state.activeRoles.map((role) => role.id).filter((roleId) => Boolean(state.paktSubmissionsByRole[roleId]));

    if (!winnerRoleIds.length) {
      continue;
    }

    winnersByArticle[articleId] = winnerRoleIds;
    finalPakt[articleId] = winnerRoleIds
      .map((roleId) => state.paktSubmissionsByRole[roleId]?.answers[articleId] ?? '')
      .filter((value) => value.trim().length > 0)
      .join('\n\n');
  }

  return {
    finalPakt,
    winnersByArticle,
  };
}

export function createEmptyPaktAnswers(): Record<PaktArticleId, string> {
  return PAKT_ARTICLE_IDS.reduce<Record<PaktArticleId, string>>((answers, articleId) => {
    answers[articleId] = '';
    return answers;
  }, {} as Record<PaktArticleId, string>);
}

export function normalizePaktAnswers(answers: Record<PaktArticleId, string>): Record<PaktArticleId, string> {
  return PAKT_ARTICLE_IDS.reduce<Record<PaktArticleId, string>>((normalized, articleId) => {
    normalized[articleId] = (answers[articleId] ?? '').trim();
    return normalized;
  }, {} as Record<PaktArticleId, string>);
}

export function isCompletePaktSubmission(answers: Record<PaktArticleId, string>): boolean {
  return PAKT_ARTICLE_IDS.every((articleId) => (answers[articleId] ?? '').trim().length > 0);
}

function deriveArticleWinnerRoleIds(state: GameState, articleId: PaktArticleId): string[] {
  if (!haveAllActiveRolesVotedOnArticle(state, articleId)) {
    return [];
  }

  const scores = new Map<string, number>();
  const votes = Object.values(state.paktArticleVotesByArticle[articleId] ?? {}) as PaktArticleVote[];
  for (const vote of votes) {
    scores.set(vote.twoPointsRoleId, (scores.get(vote.twoPointsRoleId) ?? 0) + 2);
    scores.set(vote.onePointRoleId, (scores.get(vote.onePointRoleId) ?? 0) + 1);
  }

  const highestScore = Math.max(...scores.values());
  return Array.from(scores.entries())
    .filter(([, score]) => score === highestScore)
    .map(([roleId]) => roleId);
}