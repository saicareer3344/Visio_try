import { EnvelopeIcon } from './Illustrations';

interface ClueCardProps {
  children: string;
  index: 1 | 2;
}

export function ClueCard({ children, index }: ClueCardProps) {
  return (
    <section className="clue-card">
      <div className="clue-card-heading">
        <span className="clue-icon"><EnvelopeIcon /></span>
        <div>
          <p className="eyebrow">A PAPER CLUE · {index === 1 ? 'FIRST STOP' : 'SECOND STOP'}</p>
          <h2>Your next little clue</h2>
        </div>
      </div>
      <p className="clue-text">“{children}”</p>
      <p className="clue-footnote">Find the little paper, then bring its secret code back here. 💌</p>
    </section>
  );
}
