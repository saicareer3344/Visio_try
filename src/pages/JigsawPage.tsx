import { content } from '../config/content';
import { Celebration } from '../components/Celebration';
import { ClueCard } from '../components/ClueCard';
import { CodeEntry } from '../components/CodeEntry';
import { PuzzleBoard } from '../components/PuzzleBoard';
import { FlowerMark } from '../components/Illustrations';

interface JigsawPageProps {
  completed: boolean;
  onComplete: () => void;
  onUnlockCode: (value: string) => boolean;
}

export function JigsawPage({ completed, onComplete, onUnlockCode }: JigsawPageProps) {
  return (
    <div className="journey-page jigsaw-page page-enter">
      <header className="page-heading">
        <p className="eyebrow chapter-label"><span className="chapter-number">02</span> PIECE BY PIECE</p>
        <h1>Some memories are meant to be remembered.<br className="desktop-break" />Some are meant to be found.</h1>
        <p className="page-lede">Put the pieces together to discover what awaits you next. <span aria-hidden="true">❤️</span></p>
        <span className="heading-swish" aria-hidden="true" />
      </header>

      <section className="game-card puzzle-card">
        <div className="game-card-topline">
          <div className="game-card-label"><span className="tiny-heart">♥</span> A LITTLE PUZZLE FOR YOU</div>
          <span className="piece-count-badge">{content.puzzle.rows * content.puzzle.columns} pieces</span>
        </div>
        {!completed ? (
          <PuzzleBoard
            imageSrc={content.puzzle.image}
            fallbackImage={content.puzzle.fallbackImage}
            rows={content.puzzle.rows}
            columns={content.puzzle.columns}
            initiallyCompleted={false}
            onComplete={onComplete}
          />
        ) : (
          <div className="puzzle-finished">
            <Celebration title="Look what you put together!" detail="Every little piece found its place. 💕" />
            <PuzzleBoard
              imageSrc={content.puzzle.image}
              fallbackImage={content.puzzle.fallbackImage}
              rows={content.puzzle.rows}
              columns={content.puzzle.columns}
              initiallyCompleted
              onComplete={onComplete}
            />
          </div>
        )}
      </section>

      {completed && (
        <div className="clue-reveal page-enter">
          <div className="clue-divider"><span /><FlowerMark /><span /></div>
          <ClueCard index={1}>{content.puzzle.firstClue}</ClueCard>
          <div className="code-card">
            <div className="code-card-heading">
              <span className="code-lock" aria-hidden="true">✦</span>
              <div>
                <p className="eyebrow">A LITTLE SECRET</p>
                <h2>Your next memory is waiting to be unlocked.</h2>
              </div>
            </div>
            <CodeEntry onSubmit={onUnlockCode} />
          </div>
        </div>
      )}
    </div>
  );
}
