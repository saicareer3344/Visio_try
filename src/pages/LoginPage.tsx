import { useState, type FormEvent } from 'react';
import { content } from '../config/content';
import { matchesBirthdayPassword } from '../lib/auth';
import { EnvelopeIcon, FlowerMark, HeartIcon } from '../components/Illustrations';

interface LoginPageProps {
  onSuccess: () => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (matchesBirthdayPassword(password, content.login)) {
      setError('');
      onSuccess();
      return;
    }
    setError('That doesn’t look quite right, lovely. Give it another try. 💗');
  };

  return (
    <section className="login-page page-enter">
      <div className="login-ornament login-ornament-left" aria-hidden="true">✿</div>
      <div className="login-ornament login-ornament-right" aria-hidden="true">♡</div>
      <div className="login-card">
        <div className="login-stamp" aria-hidden="true">
          <span className="stamp-dots" />
          <EnvelopeIcon className="login-envelope" />
          <span className="stamp-heart"><HeartIcon /></span>
          <FlowerMark className="login-flower" />
        </div>
        <p className="eyebrow login-eyebrow"><span /> A LITTLE NOTE, JUST FOR YOU <span /></p>
        <h1>A Little Surprise<br /><em>Awaits...</em></h1>
        <p className="login-subtitle">A little adventure, made just for you.</p>
        <form className="login-form" onSubmit={submit} noValidate>
          <label className="field-label" htmlFor="birthday-password">Your secret password</label>
          <div className="password-input-wrap">
            <input
              id="birthday-password"
              className="text-input"
              type={visible ? 'text' : 'password'}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError('');
              }}
              placeholder="Enter the secret password"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-describedby={error ? 'login-error' : undefined}
              required
            />
            <button
              className="password-toggle"
              type="button"
              onClick={() => setVisible((current) => !current)}
              aria-label={visible ? 'Hide password' : 'Show password'}
              aria-pressed={visible}
            >
              {visible ? 'Hide' : 'Show'}
            </button>
          </div>
          {error && <p className="field-error login-error" id="login-error" role="alert">{error}</p>}
          <button className="button button-primary login-submit" type="submit">
            Let’s Begin <HeartIcon />
          </button>
        </form>
        <p className="login-footnote"><span aria-hidden="true">✧</span> A tiny adventure is waiting inside <span aria-hidden="true">✧</span></p>
      </div>
      <div className="login-bottom-note" aria-hidden="true">made with love, for you</div>
    </section>
  );
}
