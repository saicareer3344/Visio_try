import { useState, type FormEvent } from 'react';
import { ArrowRightIcon } from './Illustrations';

interface CodeEntryProps {
  onSubmit: (value: string) => boolean;
  label?: string;
}

export function CodeEntry({ onSubmit, label = 'Enter the code from your little paper' }: CodeEntryProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value.trim()) {
      setError('Pop in the code from your paper when you’re ready. 💌');
      return;
    }
    if (onSubmit(value)) {
      setError('');
      setValue('');
      return;
    }
    setError('That code doesn’t seem quite right. Check your little paper and try again. 💗');
  };

  return (
    <form className="code-entry" onSubmit={handleSubmit} noValidate>
      <label className="field-label" htmlFor="physical-code">{label}</label>
      <div className="code-entry-row">
        <input
          id="physical-code"
          className="text-input code-input"
          type="text"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError('');
          }}
          placeholder="Enter your secret code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={48}
          aria-describedby={error ? 'code-error' : undefined}
        />
        <button className="button button-primary code-submit" type="submit">
          Unlock <ArrowRightIcon />
        </button>
      </div>
      {error && <p className="field-error" id="code-error" role="alert">{error}</p>}
    </form>
  );
}
