import { content } from './config/content';
import { FlowerMark, HeartIcon } from './components/Illustrations';
import { ProgressIndicator } from './components/ProgressIndicator';
import { EnvelopeCollectionPage } from './pages/EnvelopeCollectionPage';
import { FinalPage } from './pages/FinalPage';
import { JigsawPage } from './pages/JigsawPage';
import { LoginPage } from './pages/LoginPage';
import { QuizPage } from './pages/QuizPage';
import { useJourneyProgress } from './lib/useJourneyProgress';
import {
  canAccessEnvelopes,
  canEnterFinal,
  canOpenEnvelope,
  completePuzzle,
  completeQuiz,
  enterFinalPage,
  getCurrentPage,
  markAuthenticated,
  markEnvelopeOpened,
  markLetterRead,
  unlockFirstCode,
  unlockSecondCode,
} from './lib/progression';

export default function App() {
  const { progress, progressRef, updateProgress } = useJourneyProgress();
  const page = getCurrentPage(progress);

  const unlockCodeOne = (value: string) => updateProgress((current) =>
    unlockFirstCode(current, value, content.puzzle.firstCode, content.codeRules));
  const unlockCodeTwo = (value: string) => updateProgress((current) =>
    unlockSecondCode(current, value, content.quiz.secondCode, content.codeRules));

  const openEnvelope = (envelopeNumber: number): boolean => {
    const current = progressRef.current;
    if (!canAccessEnvelopes(current) || !canOpenEnvelope(envelopeNumber, current.openedEnvelopes)) return false;
    if (current.openedEnvelopes.includes(envelopeNumber)) return true;
    return updateProgress((latest) => markEnvelopeOpened(latest, envelopeNumber));
  };

  const navigateToFinal = (): boolean => {
    const current = progressRef.current;
    if (!canEnterFinal(current)) return false;
    if (current.finalPageEntered) return true;
    return updateProgress((latest) => enterFinalPage(latest));
  };

  return (
    <div className={`site-frame site-frame-${page}`}>
      <header className="site-header">
        <div className="site-brand" aria-label="A little birthday adventure">
          <span className="brand-flower"><FlowerMark /></span>
          <span className="brand-copy">
            <span className="brand-name">a day for mom</span>
            <span className="brand-subtitle">THE LITTLE BIRTHDAY HUNT</span>
          </span>
        </div>
        {page === 'login' ? (
          <div className="topbar-note">a little note, just for you <HeartIcon /></div>
        ) : (
          <ProgressIndicator page={page} />
        )}
      </header>

      <main className={`main-content main-content-${page}`}>
        {page === 'login' && (
          <LoginPage onSuccess={() => updateProgress(markAuthenticated)} />
        )}
        {page === 'puzzle' && (
          <JigsawPage
            completed={progress.puzzleCompleted}
            onComplete={() => updateProgress(completePuzzle)}
            onUnlockCode={unlockCodeOne}
          />
        )}
        {page === 'quiz' && (
          <QuizPage
            completed={progress.quizCompleted}
            onComplete={() => updateProgress(completeQuiz)}
            onUnlockCode={unlockCodeTwo}
          />
        )}
        {page === 'envelopes' && (
          <EnvelopeCollectionPage
            progress={progress}
            onOpenEnvelope={openEnvelope}
            onNavigateToFinal={navigateToFinal}
          />
        )}
        {page === 'final' && (
          <FinalPage
            letterRead={progress.letterRead}
            onMarkLetterRead={() => updateProgress(markLetterRead)}
          />
        )}
      </main>

      <footer className="site-footer">
        <span className="footer-heart"><HeartIcon /></span>
        <span>made with a whole lot of love</span>
        <span className="footer-heart"><HeartIcon /></span>
      </footer>
    </div>
  );
}
