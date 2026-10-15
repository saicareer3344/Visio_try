import type { JourneyPage, JourneyProgress } from '../types';

export const STORAGE_KEY = 'moms-birthday-treasure-hunt:v1';

export function createInitialProgress(): JourneyProgress {
  return {
    authenticated: false,
    puzzleCompleted: false,
    firstCodeUnlocked: false,
    quizCompleted: false,
    secondCodeUnlocked: false,
    openedEnvelopes: [],
    finalPageEntered: false,
    letterRead: false,
  };
}

export function sanitizeProgress(value: unknown): JourneyProgress {
  if (typeof value !== 'object' || value === null) return createInitialProgress();
  const raw = value as Partial<JourneyProgress>;
  const authenticated = raw.authenticated === true;
  const puzzleCompleted = authenticated && raw.puzzleCompleted === true;
  const firstCodeUnlocked = puzzleCompleted && raw.firstCodeUnlocked === true;
  const quizCompleted = firstCodeUnlocked && raw.quizCompleted === true;
  const secondCodeUnlocked = quizCompleted && raw.secondCodeUnlocked === true;

  const openedEnvelopes = secondCodeUnlocked && Array.isArray(raw.openedEnvelopes)
    ? [...new Set(raw.openedEnvelopes.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 4))].sort()
    : [];
  const firstFourOpened = [1, 2, 3, 4].every((number) => openedEnvelopes.includes(number));
  if (firstFourOpened && secondCodeUnlocked && Array.isArray(raw.openedEnvelopes) && raw.openedEnvelopes.includes(5)) {
    openedEnvelopes.push(5);
  }

  const finalPageEntered = canEnterFinal({
    authenticated,
    puzzleCompleted,
    firstCodeUnlocked,
    quizCompleted,
    secondCodeUnlocked,
    openedEnvelopes,
    finalPageEntered: false,
    letterRead: false,
  }) && raw.finalPageEntered === true;

  return {
    authenticated,
    puzzleCompleted,
    firstCodeUnlocked,
    quizCompleted,
    secondCodeUnlocked,
    openedEnvelopes,
    finalPageEntered,
    letterRead: finalPageEntered && raw.letterRead === true,
  };
}

export function getCurrentPage(progress: JourneyProgress): JourneyPage {
  if (!progress.authenticated) return 'login';
  if (!progress.puzzleCompleted || !progress.firstCodeUnlocked) return 'puzzle';
  if (!progress.quizCompleted || !progress.secondCodeUnlocked) return 'quiz';
  if (!progress.finalPageEntered || !canEnterFinal(progress)) return 'envelopes';
  return 'final';
}

export function canAccessEnvelopes(progress: JourneyProgress): boolean {
  return progress.authenticated &&
    progress.puzzleCompleted &&
    progress.firstCodeUnlocked &&
    progress.quizCompleted &&
    progress.secondCodeUnlocked;
}

export function canOpenEnvelope(envelopeNumber: number, openedEnvelopes: number[]): boolean {
  if (!Number.isInteger(envelopeNumber) || envelopeNumber < 1 || envelopeNumber > 5) return false;
  if (envelopeNumber !== 5) return true;
  return [1, 2, 3, 4].every((number) => openedEnvelopes.includes(number));
}

export function areFirstFourEnvelopesOpen(progress: JourneyProgress): boolean {
  return [1, 2, 3, 4].every((number) => progress.openedEnvelopes.includes(number));
}

export function canEnterFinal(progress: JourneyProgress): boolean {
  return canAccessEnvelopes(progress) &&
    areFirstFourEnvelopesOpen(progress) &&
    progress.openedEnvelopes.includes(5);
}

export function markAuthenticated(progress: JourneyProgress): JourneyProgress {
  return progress.authenticated ? progress : { ...progress, authenticated: true };
}

export function completePuzzle(progress: JourneyProgress): JourneyProgress {
  if (!progress.authenticated || progress.puzzleCompleted) return progress;
  return { ...progress, puzzleCompleted: true };
}

export function normalizeCode(value: string, rules: { trimWhitespace: boolean; ignoreCase: boolean }): string {
  let normalized = value;
  if (rules.trimWhitespace) normalized = normalized.trim();
  if (rules.ignoreCase) normalized = normalized.toLocaleUpperCase();
  return normalized;
}

export function isCodeCorrect(
  candidate: string,
  expected: string,
  rules: { trimWhitespace: boolean; ignoreCase: boolean },
): boolean {
  return normalizeCode(candidate, rules) === normalizeCode(expected, rules);
}

export function unlockFirstCode(
  progress: JourneyProgress,
  candidate: string,
  expected: string,
  rules: { trimWhitespace: boolean; ignoreCase: boolean },
): JourneyProgress {
  if (!progress.puzzleCompleted || progress.firstCodeUnlocked || !isCodeCorrect(candidate, expected, rules)) return progress;
  return { ...progress, firstCodeUnlocked: true };
}

export function completeQuiz(progress: JourneyProgress): JourneyProgress {
  if (!progress.firstCodeUnlocked || progress.quizCompleted) return progress;
  return { ...progress, quizCompleted: true };
}

export function unlockSecondCode(
  progress: JourneyProgress,
  candidate: string,
  expected: string,
  rules: { trimWhitespace: boolean; ignoreCase: boolean },
): JourneyProgress {
  if (!progress.quizCompleted || progress.secondCodeUnlocked || !isCodeCorrect(candidate, expected, rules)) return progress;
  return { ...progress, secondCodeUnlocked: true };
}

/** This is the authoritative envelope guard. Envelope 5 is a no-op until 1–4 are recorded. */
export function markEnvelopeOpened(progress: JourneyProgress, envelopeNumber: number): JourneyProgress {
  if (!canAccessEnvelopes(progress) || !canOpenEnvelope(envelopeNumber, progress.openedEnvelopes)) return progress;
  if (progress.openedEnvelopes.includes(envelopeNumber)) return progress;
  return {
    ...progress,
    openedEnvelopes: [...progress.openedEnvelopes, envelopeNumber].sort((a, b) => a - b),
  };
}

export function enterFinalPage(progress: JourneyProgress): JourneyProgress {
  if (!canEnterFinal(progress) || progress.finalPageEntered) return progress;
  return { ...progress, finalPageEntered: true };
}

export function markLetterRead(progress: JourneyProgress): JourneyProgress {
  if (!progress.finalPageEntered || !canEnterFinal(progress) || progress.letterRead) return progress;
  return { ...progress, letterRead: true };
}
