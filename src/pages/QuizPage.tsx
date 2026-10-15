import { useState } from 'react';
import { content } from '../config/content';
import { Celebration } from '../components/Celebration';
import { ClueCard } from '../components/ClueCard';
import { CodeEntry } from '../components/CodeEntry';
import { FlowerMark } from '../components/Illustrations';

interface QuizPageProps {
  completed: boolean;
  onComplete: () => void;
  onUnlockCode: (value: string) => boolean;
}

export function QuizPage({ completed, onComplete, onUnlockCode }: QuizPageProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answeredCorrectly, setAnsweredCorrectly] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | ''>('');
  const question = content.quiz.questions[questionIndex];
  const questionCount = content.quiz.questions.length;

  const checkOrContinue = () => {
    if (!answeredCorrectly) {
      if (selectedAnswer === null) {
        setFeedback('Choose an answer first, lovely. 💌');
        setFeedbackType('error');
        return;
      }
      if (selectedAnswer !== question.correctAnswerIndex) {
        setFeedback(question.incorrectFeedback);
        setFeedbackType('error');
        return;
      }
      setAnsweredCorrectly(true);
      setFeedback(question.correctFeedback);
      setFeedbackType('success');
      return;
    }

    if (questionIndex === questionCount - 1) {
      onComplete();
      return;
    }
    setQuestionIndex((current) => current + 1);
    setSelectedAnswer(null);
    setAnsweredCorrectly(false);
    setFeedback('');
    setFeedbackType('');
  };

  return (
    <div className="journey-page quiz-page page-enter">
      <header className="page-heading">
        <p className="eyebrow chapter-label"><span className="chapter-number">03</span> SWEET MEMORIES</p>
        <h1>{content.quiz.introduction}</h1>
        <p className="page-lede">{content.quiz.supportingText}</p>
        <span className="heading-swish" aria-hidden="true" />
      </header>

      {!completed ? (
        <section className="game-card quiz-card" aria-label="Memory quiz">
          <div className="quiz-progress-row">
            <span className="eyebrow">A LITTLE TRIP THROUGH TIME</span>
            <span className="quiz-progress-count">Question <strong>{questionIndex + 1}</strong> of {questionCount}</span>
          </div>
          <div className="quiz-progress-track" aria-hidden="true">
            <span style={{ width: `${((questionIndex + 1) / questionCount) * 100}%` }} />
          </div>
          <div className="quiz-question-block" key={questionIndex}>
            <span className="question-ornament" aria-hidden="true">✿</span>
            <h2>{question.prompt}</h2>
            <div className="answer-list" role="group" aria-label="Answer choices">
              {question.choices.map((choice, index) => (
                <button
                  type="button"
                  className={`answer-choice ${selectedAnswer === index ? 'is-selected' : ''} ${answeredCorrectly && selectedAnswer === index ? 'is-correct' : ''}`}
                  key={`${questionIndex}-${index}`}
                  aria-pressed={selectedAnswer === index}
                  disabled={answeredCorrectly}
                  onClick={() => {
                    setSelectedAnswer(index);
                    setFeedback('');
                    setFeedbackType('');
                  }}
                >
                  <span className="choice-letter">{String.fromCharCode(65 + index)}</span>
                  <span>{choice}</span>
                  <span className="choice-check" aria-hidden="true">{selectedAnswer === index && answeredCorrectly ? '✓' : ''}</span>
                </button>
              ))}
            </div>
            <div className="quiz-action-row">
              <p className={`quiz-feedback ${feedbackType ? `is-${feedbackType}` : ''}`} role={feedbackType === 'error' ? 'alert' : 'status'}>
                {feedback || 'Choose the answer that feels right.'}
              </p>
              <button
                type="button"
                className="button button-primary quiz-action"
                onClick={checkOrContinue}
                disabled={selectedAnswer === null && !answeredCorrectly}
              >
                {!answeredCorrectly ? 'Check my answer' : questionIndex === questionCount - 1 ? 'Find my next clue' : 'Next memory'}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
          <div className="quiz-little-note"><FlowerMark /> No rush, no score—just a few little memories.</div>
        </section>
      ) : (
        <div className="clue-reveal page-enter">
          <Celebration title="You remembered every little thing!" detail="What a beautiful story you've lived. 💕" />
          <div className="clue-divider"><span /><FlowerMark /><span /></div>
          <ClueCard index={2}>{content.quiz.secondClue}</ClueCard>
          <div className="code-card">
            <div className="code-card-heading">
              <span className="code-lock" aria-hidden="true">✦</span>
              <div>
                <p className="eyebrow">THE NEXT DOOR</p>
                <h2>Bring your little paper’s code back to unlock what’s next.</h2>
              </div>
            </div>
            <CodeEntry onSubmit={onUnlockCode} />
          </div>
        </div>
      )}
    </div>
  );
}
