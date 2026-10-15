import type { EnvelopeContent, QuizQuestion } from '../types';

/**
 * Personalise this file before sharing the site. Values for passwords and codes
 * are client-side in a static app; they are suitable for a surprise, not security.
 */
export const content = {
  login: {
    // Enter the real birthday as YYYY-MM-DD. The secret field will expect it in `dateFormat`.
    // Leave blank during setup; the setup-only placeholder below keeps the app testable.
    dateOfBirthISO: '',
    dateFormat: 'DDMMYYYY',
    placeholderPassword: 'CHANGE_ME',
  },
  puzzle: {
    image: '/assets/mom-puzzle-placeholder.svg',
    fallbackImage: '/assets/mom-puzzle-placeholder.svg',
    rows: 3,
    columns: 4,
    firstClue: 'I am near something that helps make your favourite drinks. Look towards the bottom of the kettle.',
    firstCode: 'TEATIME',
  },
  quiz: {
    introduction: "How well do you remember the beautiful story you've lived?",
    supportingText: "Let's take a little trip through your memories, one question at a time. ❤️",
    questions: [
      {
        prompt: 'Add a question about a favourite family memory.',
        choices: ['Add answer choice A', 'Add answer choice B', 'Add answer choice C'],
        correctAnswerIndex: 0,
        correctFeedback: "That's the one! What a lovely memory. 💗",
        incorrectFeedback: 'Not quite, lovely. Take another little guess. 💗',
      },
      {
        prompt: 'Add a question about an important day in her life.',
        choices: ['Add answer choice A', 'Add answer choice B', 'Add answer choice C'],
        correctAnswerIndex: 0,
        correctFeedback: 'Exactly right! 🌷',
        incorrectFeedback: 'Not quite, lovely. Take another little guess. 💗',
      },
      {
        prompt: 'Add a question about something she loves.',
        choices: ['Add answer choice A', 'Add answer choice B', 'Add answer choice C'],
        correctAnswerIndex: 0,
        correctFeedback: 'You remembered beautifully. ✨',
        incorrectFeedback: 'Not quite, lovely. Take another little guess. 💗',
      },
      {
        prompt: 'Add one last question about a special shared moment.',
        choices: ['Add answer choice A', 'Add answer choice B', 'Add answer choice C'],
        correctAnswerIndex: 0,
        correctFeedback: 'All correct—what a beautiful story. 💕',
        incorrectFeedback: 'Not quite, lovely. Take another little guess. 💗',
      },
    ] satisfies QuizQuestion[],
    secondClue: 'I am a place where you rest after a long day. Look somewhere close to where you lay your head.',
    secondCode: 'DREAMS',
  },
  envelopes: [
    { title: 'A little note for you', message: '[Placeholder] Add your first personal message here.' },
    { title: 'A tiny thank-you', message: '[Placeholder] Add your second personal message here.' },
    { title: 'A memory to keep', message: '[Placeholder] Add your third personal message here.' },
    { title: 'A little reminder', message: '[Placeholder] Add your fourth personal message here.' },
    {
      title: 'Your final surprise',
      message: "You've opened every little envelope, but there's one last surprise waiting for you.\n\nReady for the final part of your adventure, Mom? ❤️",
    },
  ] satisfies EnvelopeContent[],
  letter: {
    text: 'My dearest Mom,\n\nThis is the place for your handwritten-style birthday letter. Replace this placeholder with the words you want her to keep close.\n\nAll my love,\nYour child',
  },
  video: {
    // Set to a file in /public (for example, /assets/birthday-video.mp4) or a direct HTML-video URL.
    src: '',
    // Optional image path in /public or URL. Leave blank for the illustrated placeholder.
    poster: '',
  },
  codeRules: {
    trimWhitespace: true,
    ignoreCase: true,
  },
} as const;

export type AppContent = typeof content;
