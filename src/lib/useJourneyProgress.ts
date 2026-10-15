import { useCallback, useRef, useState } from 'react';
import type { JourneyProgress } from '../types';
import { createInitialProgress, sanitizeProgress, STORAGE_KEY } from './progression';

function readStoredProgress(): JourneyProgress {
  if (typeof window === 'undefined') return createInitialProgress();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeProgress(JSON.parse(raw)) : createInitialProgress();
  } catch {
    return createInitialProgress();
  }
}

function resetFromDeveloperQuery(): boolean {
  if (typeof window === 'undefined' || !import.meta.env?.DEV) return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get('reset') !== '1') return false;
  window.localStorage.removeItem(STORAGE_KEY);
  url.searchParams.delete('reset');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  return true;
}

export function useJourneyProgress() {
  const [progress, setProgress] = useState<JourneyProgress>(() => {
    if (resetFromDeveloperQuery()) return createInitialProgress();
    return readStoredProgress();
  });
  const progressRef = useRef(progress);

  const updateProgress = useCallback((updater: (current: JourneyProgress) => JourneyProgress): boolean => {
    const current = progressRef.current;
    const next = updater(current);
    if (next === current) return false;
    progressRef.current = next;
    setProgress(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be disabled or full; the current session still works.
    }
    return true;
  }, []);

  return { progress, progressRef, updateProgress };
}
