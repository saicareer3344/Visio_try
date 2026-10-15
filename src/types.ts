export interface JourneyProgress {
  authenticated: boolean;
  puzzleCompleted: boolean;
  firstCodeUnlocked: boolean;
  quizCompleted: boolean;
  secondCodeUnlocked: boolean;
  openedEnvelopes: number[];
  finalPageEntered: boolean;
  letterRead: boolean;
}

export type JourneyPage = 'login' | 'puzzle' | 'quiz' | 'envelopes' | 'final';

export interface QuizQuestion {
  prompt: string;
  choices: string[];
  correctAnswerIndex: number;
  correctFeedback: string;
  incorrectFeedback: string;
}

export interface EnvelopeContent {
  title: string;
  message: string;
}
