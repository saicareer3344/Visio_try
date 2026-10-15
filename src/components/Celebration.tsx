import type { CSSProperties } from 'react';
import { SparkleIcon } from './Illustrations';

const confettiColors = ['#d58b99', '#edc29c', '#aebb9e', '#bcaed0', '#f0d995', '#fffaf2'];

interface CelebrationProps {
  title: string;
  detail: string;
}

export function Celebration({ title, detail }: CelebrationProps) {
  return (
    <div className="celebration" role="status" aria-live="polite">
      <div className="confetti-burst" aria-hidden="true">
        {confettiColors.map((color, index) => (
          <i key={`${color}-${index}`} style={{ '--confetti-color': color, '--confetti-index': index } as CSSProperties} />
        ))}
      </div>
      <span className="celebration-icon"><SparkleIcon /></span>
      <p className="eyebrow">A LITTLE CELEBRATION</p>
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  );
}
