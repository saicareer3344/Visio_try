import { useEffect, useState } from 'react';
import { content } from '../config/content';
import { Celebration } from '../components/Celebration';
import { EnvelopeIcon, HeartIcon, PlayIcon, SparkleIcon } from '../components/Illustrations';

const FALLBACK_POSTER = '/assets/birthday-video-placeholder.svg';

interface FinalPageProps {
  letterRead: boolean;
  onMarkLetterRead: () => void;
}

export function FinalPage({ letterRead, onMarkLetterRead }: FinalPageProps) {
  return (
    <div className="journey-page final-page page-enter">
      <header className="page-heading final-heading">
        <p className="eyebrow chapter-label"><span className="chapter-number">05</span> FROM THE HEART</p>
        <h1>The last little<br className="mobile-break" /> piece is for you.</h1>
        <p className="page-lede">Take your time. This part is made with all my love. <span aria-hidden="true">♡</span></p>
        <span className="heading-swish" aria-hidden="true" />
      </header>

      {!letterRead ? (
        <LetterPage onMarkRead={onMarkLetterRead} />
      ) : (
        <VideoSection />
      )}
    </div>
  );
}

function LetterPage({ onMarkRead }: { onMarkRead: () => void }) {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setOpened(true);
      return;
    }
    const timer = window.setTimeout(() => setOpened(true), 420);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section className={`letter-reveal ${opened ? 'is-opened' : ''}`}>
      <div className="letter-envelope-scene" aria-hidden="true">
        <div className="letter-paper-peek"><HeartIcon /></div>
        <div className="letter-envelope-back"><span /></div>
        <div className="letter-envelope-flap" />
        <div className="letter-seal"><HeartIcon /></div>
      </div>
      <div className="letter-card" aria-live="polite">
        <div className="letter-card-topline"><span>WITH ALL MY LOVE</span><HeartIcon /></div>
        <div className="letter-copy handwritten-copy">{content.letter.text}</div>
        <div className="letter-card-flower" aria-hidden="true">✿</div>
      </div>
      <div className="letter-read-prompt">
        <p>Have you read your little letter? <span aria-hidden="true">❤️</span></p>
        <button className="button button-primary" type="button" onClick={onMarkRead}>
          I’ve Read It <EnvelopeIcon />
        </button>
        <span className="letter-read-note">The next part will be waiting whenever you’re ready.</span>
      </div>
    </section>
  );
}

function VideoSection() {
  const [videoFailed, setVideoFailed] = useState(false);
  const videoSource = content.video.src.trim();
  const posterSource = content.video.poster.trim() || FALLBACK_POSTER;
  const showVideo = Boolean(videoSource) && !videoFailed;

  return (
    <section className="video-section page-enter">
      <div className="video-intro">
        <span className="video-sparkle"><SparkleIcon /></span>
        <p className="eyebrow">ONE MORE LITTLE SURPRISE</p>
        <h2>There’s one more thing<br />I made just for you...</h2>
      </div>
      <div className="video-frame-wrap">
        <div className="video-frame">
          {showVideo ? (
            <video
              className="birthday-video"
              controls
              playsInline
              preload="metadata"
              poster={posterSource}
              onError={() => setVideoFailed(true)}
              aria-label="A personal birthday video"
            >
              <source src={videoSource} />
              Your browser doesn’t support embedded video.
            </video>
          ) : (
            <div className="video-placeholder">
              <img
                src={posterSource}
                alt=""
                className="video-placeholder-image"
                onError={(event) => { event.currentTarget.style.display = 'none'; }}
              />
              <div className="video-placeholder-overlay">
                <span className="video-play-badge"><PlayIcon /></span>
                <p className="eyebrow">A LITTLE FILM FOR MOM</p>
                <p>{videoFailed ? 'Your video file could not be loaded.' : 'Your birthday video will live here.'}</p>
                {!videoFailed && <span className="video-placeholder-hint">Add your video in the content settings when it’s ready.</span>}
              </div>
            </div>
          )}
        </div>
        <p className="video-caption"><span>♡</span> Press play whenever you’re ready <span>♡</span></p>
      </div>
      <div className="final-message-card">
        <div className="final-message-rule"><span /><HeartIcon /><span /></div>
        <Celebration title="Love You, Mom ❤️" detail="Happy Birthday!" />
        <p className="final-message-signoff">Today, tomorrow, and always <span aria-hidden="true">♡</span></p>
      </div>
    </section>
  );
}
