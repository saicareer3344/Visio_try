import type { JourneyPage } from '../types';
import { HeartIcon } from './Illustrations';

const chapterNames: Record<JourneyPage, string> = {
  login: 'The invitation',
  puzzle: 'Piece by piece',
  quiz: 'Sweet memories',
  envelopes: 'Little letters',
  final: 'From the heart',
};

const pageOrder: JourneyPage[] = ['login', 'puzzle', 'quiz', 'envelopes', 'final'];

interface ProgressIndicatorProps {
  page: JourneyPage;
}

export function ProgressIndicator({ page }: ProgressIndicatorProps) {
  const current = pageOrder.indexOf(page) + 1;
  return (
    <div className="progress-indicator" aria-label={`Chapter ${current} of 5: ${chapterNames[page]}`}>
      <div className="progress-copy">
        <span className="progress-kicker">YOUR LITTLE ADVENTURE</span>
        <span className="progress-title">Chapter {current} <span>of 5</span></span>
      </div>
      <div className="progress-hearts" aria-hidden="true">
        {pageOrder.map((chapter, index) => (
          <span
            className={`progress-heart ${index + 1 < current ? 'is-complete' : ''} ${index + 1 === current ? 'is-current' : ''}`}
            key={chapter}
          >
            <HeartIcon />
          </span>
        ))}
      </div>
    </div>
  );
}
