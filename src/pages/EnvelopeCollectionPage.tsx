import { useEffect, useState } from 'react';
import { content } from '../config/content';
import type { EnvelopeContent, JourneyProgress } from '../types';
import { ArrowRightIcon, FlowerMark, HeartIcon, LockIcon } from '../components/Illustrations';
import { areFirstFourEnvelopesOpen } from '../lib/progression';

interface EnvelopeCollectionPageProps {
  progress: JourneyProgress;
  onOpenEnvelope: (envelopeNumber: number) => boolean;
  onNavigateToFinal: () => boolean;
}

export function EnvelopeCollectionPage({ progress, onOpenEnvelope, onNavigateToFinal }: EnvelopeCollectionPageProps) {
  const [activeEnvelope, setActiveEnvelope] = useState<number | null>(null);
  const [hint, setHint] = useState('');
  const firstFourOpen = areFirstFourEnvelopesOpen(progress);
  const fifthOpened = progress.openedEnvelopes.includes(5);

  useEffect(() => {
    if (!activeEnvelope) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveEnvelope(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [activeEnvelope]);

  const requestOpen = (envelopeNumber: number) => {
    if (envelopeNumber === 5 && !firstFourOpen) {
      setHint('Open the other four envelopes first! 💌');
      window.setTimeout(() => setHint(''), 3200);
      return;
    }
    if (!onOpenEnvelope(envelopeNumber)) {
      setHint('A little more of the adventure is waiting first. 💗');
      window.setTimeout(() => setHint(''), 3200);
      return;
    }
    setHint('');
    setActiveEnvelope(envelopeNumber);
  };

  const activeMessage = activeEnvelope ? content.envelopes[activeEnvelope - 1] : null;

  return (
    <div className="journey-page envelopes-page page-enter">
      <header className="page-heading">
        <p className="eyebrow chapter-label"><span className="chapter-number">04</span> LITTLE LETTERS</p>
        <h1>Five tiny envelopes.<br />A whole lot of love.</h1>
        <p className="page-lede">Open them in any order and find the little words waiting inside. 💌</p>
        <span className="heading-swish" aria-hidden="true" />
      </header>

      <div className="envelope-note-strip">
        <FlowerMark />
        <p>Each one holds a little something just for you.</p>
        <HeartIcon />
      </div>

      <div className="envelope-grid" aria-label="Five birthday envelopes">
        {content.envelopes.map((envelope, index) => {
          const number = index + 1;
          const isSpecial = number === 5;
          const locked = isSpecial && !firstFourOpen;
          const opened = progress.openedEnvelopes.includes(number);
          return (
            <EnvelopeCard
              key={number}
              number={number}
              content={envelope}
              isSpecial={isSpecial}
              isLocked={locked}
              isUnlocked={isSpecial && firstFourOpen}
              isOpened={opened}
              onClick={() => requestOpen(number)}
            />
          );
        })}
      </div>

      <div className="envelopes-progress-note" aria-live="polite">
        <span className="envelope-progress-heart"><HeartIcon /></span>
        <span>{progress.openedEnvelopes.filter((number) => number <= 4).length} of 4 little letters opened</span>
        {!firstFourOpen && <span className="envelope-progress-hint">Your special surprise is tucked away for now.</span>}
        {firstFourOpen && !fifthOpened && <span className="envelope-progress-hint">A little lock has just clicked open. ✨</span>}
        {fifthOpened && <span className="envelope-progress-hint">All five are open. Your last surprise is ready. 💗</span>}
      </div>

      {hint && <div className="envelope-toast" role="status">{hint}</div>}

      {activeEnvelope && activeMessage && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setActiveEnvelope(null);
        }}>
          <section className="envelope-modal" role="dialog" aria-modal="true" aria-labelledby="envelope-modal-title">
            <button className="modal-close" type="button" onClick={() => setActiveEnvelope(null)} aria-label="Close envelope">×</button>
            <div className={`modal-seal ${activeEnvelope === 5 ? 'seal-special' : ''}`} aria-hidden="true">
              {activeEnvelope === 5 ? <HeartIcon /> : <span>{String(activeEnvelope).padStart(2, '0')}</span>}
            </div>
            <p className="eyebrow">A NOTE FROM THE HEART</p>
            <h2 id="envelope-modal-title">{activeMessage.title}</h2>
            <p className="modal-message">{activeMessage.message}</p>
            {activeEnvelope === 5 && firstFourOpen && (
              <button
                type="button"
                className="button button-primary final-surprise-button"
                onClick={() => {
                  if (onNavigateToFinal()) setActiveEnvelope(null);
                  else setHint('There’s one little step left before your final surprise. 💌');
                }}
              >
                Open Your Final Surprise <ArrowRightIcon />
              </button>
            )}
            {activeEnvelope !== 5 && <p className="modal-signoff">A little love, folded just for you <span>♥</span></p>}
          </section>
        </div>
      )}
    </div>
  );
}

function EnvelopeCard({
  number,
  content: envelope,
  isSpecial,
  isLocked,
  isUnlocked,
  isOpened,
  onClick,
}: {
  number: number;
  content: EnvelopeContent;
  isSpecial: boolean;
  isLocked: boolean;
  isUnlocked: boolean;
  isOpened: boolean;
  onClick: () => void;
}) {
  const className = [
    'envelope-card',
    `envelope-card-${number}`,
    isSpecial ? 'is-special' : '',
    isLocked ? 'is-locked' : '',
    isUnlocked ? 'is-unlocked' : '',
    isOpened ? 'is-opened' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      className={className}
      type="button"
      aria-disabled={isLocked}
      aria-label={isLocked ? 'Envelope 5 locked. A special surprise awaits. Open the other four envelopes first.' : `Open envelope ${number}: ${envelope.title}${isOpened ? ', already opened' : ''}`}
      onClick={onClick}
    >
      <span className="envelope-card-inner">
        <span className="envelope-number">{String(number).padStart(2, '0')}</span>
        <span className="envelope-illustration" aria-hidden="true">
          <span className="envelope-paper" />
          <span className="envelope-flap" />
          <span className="envelope-seal">{isLocked ? <LockIcon /> : <HeartIcon />}</span>
          {isSpecial && <span className="envelope-sparkle">✦</span>}
        </span>
        {isLocked ? (
          <span className="envelope-card-label locked-label">A special surprise<br />awaits… <span>💗</span></span>
        ) : isUnlocked && isSpecial ? (
          <span className="envelope-card-label unlocked-label">Your final surprise<br />is here! <span>💌</span></span>
        ) : (
          <span className="envelope-card-label">{envelope.title}</span>
        )}
        {isOpened && <span className="opened-ribbon"><HeartIcon /> Opened</span>}
        {isSpecial && isUnlocked && <span className="special-ready-dot" aria-label="Unlocked">✦</span>}
      </span>
    </button>
  );
}
