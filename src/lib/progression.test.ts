import assert from 'node:assert/strict';
import test from 'node:test';
import { content } from '../config/content';
import type { JourneyProgress } from '../types';
import {
  canEnterFinal,
  canOpenEnvelope,
  completePuzzle,
  completeQuiz,
  createInitialProgress,
  enterFinalPage,
  getCurrentPage,
  isCodeCorrect,
  markAuthenticated,
  markEnvelopeOpened,
  sanitizeProgress,
  unlockFirstCode,
  unlockSecondCode,
} from './progression';

const atEnvelopePage = (): JourneyProgress => {
  let progress = markAuthenticated(createInitialProgress());
  progress = completePuzzle(progress);
  progress = unlockFirstCode(progress, content.puzzle.firstCode, content.puzzle.firstCode, content.codeRules);
  progress = completeQuiz(progress);
  progress = unlockSecondCode(progress, content.quiz.secondCode, content.quiz.secondCode, content.codeRules);
  return progress;
};

test('the page sequence only advances after each required gate', () => {
  let progress = createInitialProgress();
  assert.equal(getCurrentPage(progress), 'login');
  progress = markAuthenticated(progress);
  assert.equal(getCurrentPage(progress), 'puzzle');
  progress = completePuzzle(progress);
  assert.equal(getCurrentPage(progress), 'puzzle');
  progress = unlockFirstCode(progress, content.puzzle.firstCode, content.puzzle.firstCode, content.codeRules);
  assert.equal(getCurrentPage(progress), 'quiz');
  progress = completeQuiz(progress);
  assert.equal(getCurrentPage(progress), 'quiz');
  progress = unlockSecondCode(progress, content.quiz.secondCode, content.quiz.secondCode, content.codeRules);
  assert.equal(getCurrentPage(progress), 'envelopes');
});

test('code matching trims surrounding spaces and ignores case according to config', () => {
  assert.equal(isCodeCorrect('  teatime  ', 'TEATIME', content.codeRules), true);
  assert.equal(isCodeCorrect('wrong', 'TEATIME', content.codeRules), false);
});

test('Envelope 5 stays locked with zero or three earlier envelopes open', () => {
  const progress = atEnvelopePage();
  assert.equal(canOpenEnvelope(5, []), false);
  assert.equal(canOpenEnvelope(5, [1, 2, 3]), false);
  assert.deepEqual(markEnvelopeOpened(progress, 5), progress);
  const afterThree = [1, 2, 3].reduce((state, number) => markEnvelopeOpened(state, number), progress);
  assert.deepEqual(afterThree.openedEnvelopes, [1, 2, 3]);
  assert.equal(canOpenEnvelope(5, afterThree.openedEnvelopes), false);
  assert.deepEqual(markEnvelopeOpened(afterThree, 5), afterThree);
  assert.equal(canEnterFinal(afterThree), false);
});

test('Envelope 5 unlocks only after all four first envelopes, and final entry is guarded', () => {
  let progress = atEnvelopePage();
  progress = [1, 3, 2, 4].reduce((state, number) => markEnvelopeOpened(state, number), progress);
  assert.deepEqual(progress.openedEnvelopes, [1, 2, 3, 4]);
  assert.equal(canOpenEnvelope(5, progress.openedEnvelopes), true);
  progress = markEnvelopeOpened(progress, 5);
  assert.equal(canEnterFinal(progress), true);
  progress = enterFinalPage(progress);
  assert.equal(getCurrentPage(progress), 'final');
});

test('persisted progress is sanitized so impossible envelope access is discarded', () => {
  const progress = sanitizeProgress({
    authenticated: true,
    puzzleCompleted: true,
    firstCodeUnlocked: true,
    quizCompleted: true,
    secondCodeUnlocked: true,
    openedEnvelopes: [1, 2, 3, 5],
    finalPageEntered: true,
    letterRead: true,
  });
  assert.deepEqual(progress.openedEnvelopes, [1, 2, 3]);
  assert.equal(progress.finalPageEntered, false);
  assert.equal(progress.letterRead, false);
  assert.equal(getCurrentPage(progress), 'envelopes');
});
