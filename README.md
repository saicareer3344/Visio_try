# Mom’s Birthday Treasure Hunt

A small, responsive birthday adventure built with React, TypeScript, and Vite. It is a static, state-driven experience: the five stages are guarded in application logic, and non-sensitive progress is saved in `localStorage` so a refresh won’t restart the hunt.

## Run it

```bash
npm install
npm run dev
```

Then open the local Vite URL. `npm run build` runs the TypeScript check and production build; `npm run test` checks password formatting, the full stage flow, persistence, and the Envelope 5 lock rules.

## Personalise the hunt

Edit **`src/config/content.ts`**. The initial values are clearly marked placeholders:

- **Birthday login:** set `login.dateOfBirthISO` to the real date as `YYYY-MM-DD`; `dateFormat` controls the entered password format (`DDMMYYYY`, `DD/MM/YYYY`, `MM-DD-YYYY`, etc.). Until then, the setup-only placeholder password is `CHANGE_ME`.
- **Puzzle image:** copy the photograph into `public/assets/` (for example, `public/assets/mom-photo.jpg`) and set `puzzle.image` to `/assets/mom-photo.jpg`. Keep `fallbackImage` pointed at the included placeholder. The puzzle is a playable 12-piece, touch-and-mouse jigsaw by default; adjust `rows` and `columns` if desired.
- **Physical clues and codes:** edit `puzzle.firstClue` / `puzzle.firstCode` and `quiz.secondClue` / `quiz.secondCode` independently. The placeholder codes are `TEATIME` and `DREAMS`; neither code is displayed in the experience. `codeRules` controls trimming and case matching.
- **Quiz:** replace the four prompt, choice, correct-answer index, and feedback objects in `quiz.questions`. The quiz component supports a different number of configured questions as well.
- **Envelopes:** replace the first four messages in `envelopes`. Envelope 5 is deliberately protected by an application-level guard: it cannot be opened until envelopes 1–4 have each been recorded as opened.
- **Letter:** replace `letter.text` with the birthday letter.
- **Video:** put a video in `public/` and set `video.src` (for example `/assets/birthday-video.mp4`), or use a direct URL supported by the browser’s `<video>` element. Optionally set `video.poster`. The video stays hidden until the letter is explicitly marked as read.

The poster illustration for a missing video is `public/assets/birthday-video-placeholder.svg`. The palette and typography tokens are grouped near the top of `src/styles.css`.

## Progress and reset

Progress is saved under `moms-birthday-treasure-hunt:v1` in the browser’s `localStorage`. During development only, visit `/?reset=1` to clear progress and restart. In a production browser, clear that localStorage key to reset the experience.

## Important note about a static birthday site

The birthday password and physical codes are compared in client-side JavaScript, and therefore are visible to someone inspecting the downloaded app. This is appropriate for a personal surprise, not real authentication or sensitive information. Use server-side authentication if actual access control is required.
