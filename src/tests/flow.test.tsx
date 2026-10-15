import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { content } from '../config/content';
import { STORAGE_KEY } from '../lib/progression';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: dom.window.HTMLElement });
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: dom.window.Element });
  Object.defineProperty(globalThis, 'Node', { configurable: true, value: dom.window.Node });
  Object.defineProperty(globalThis, 'MouseEvent', { configurable: true, value: dom.window.MouseEvent });
  Object.defineProperty(globalThis, 'Event', { configurable: true, value: dom.window.Event });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });
  Object.defineProperty(dom.window, 'PointerEvent', { configurable: true, value: dom.window.MouseEvent });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: () => undefined });
  Object.defineProperty(dom.window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
  dom.window.localStorage.clear();
  return dom;
}

test('complete birthday hunt flow works and Envelope 5 cannot be opened early', async () => {
  const dom = installDom();
  const [{ render, screen, cleanup, fireEvent }, userEventModule, appModule] = await Promise.all([
    import('@testing-library/react'),
    import('@testing-library/user-event'),
    import('../App'),
  ]);
  const user = userEventModule.default.setup({ document: dom.window.document });
  const App = appModule.default;

  try {
    const { unmount } = render(<App />);
    const password = screen.getByLabelText('Your secret password');
    await user.type(password, 'not-the-password');
    await user.click(screen.getByRole('button', { name: /Begin/ }));
    assert.match(screen.getByRole('alert').textContent ?? '', /doesn’t look quite right/);

    await user.clear(password);
    await user.type(password, content.login.placeholderPassword);
    await user.click(screen.getByRole('button', { name: /Begin/ }));
    assert.ok(screen.getByRole('heading', { name: /Some memories are meant/ }));

    const firstPiece = screen.getByRole('button', { name: /Puzzle piece 1, 1/ });
    await user.click(firstPiece);
    await user.click(screen.getByRole('button', { name: 'Place a piece in row 1, column 2' }));
    assert.equal(screen.queryByText((text) => text.includes(content.puzzle.firstClue)), null);

    // Exercise the actual pointer-drag path, then solve the remaining pieces accessibly.
    const board = document.querySelector('.puzzle-board');
    assert.ok(board);
    const mockRect = (left: number, top: number, width: number, height: number) => ({
      left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(board, 'getBoundingClientRect', { configurable: true, value: () => mockRect(0, 0, 400, 300) });
    Object.defineProperty(firstPiece, 'getBoundingClientRect', { configurable: true, value: () => mockRect(500, 400, 60, 60) });
    fireEvent.pointerDown(firstPiece, { clientX: 530, clientY: 430 });
    fireEvent.pointerMove(firstPiece, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(firstPiece, { clientX: 50, clientY: 50 });
    assert.match(document.querySelector('.piece-counter')?.textContent ?? '', /^\s*1\s*\//);

    for (let id = 1; id < content.puzzle.rows * content.puzzle.columns; id += 1) {
      const row = Math.floor(id / content.puzzle.columns) + 1;
      const column = (id % content.puzzle.columns) + 1;
      await user.click(screen.getByRole('button', { name: new RegExp(`Puzzle piece ${row}, ${column}`) }));
      await user.click(screen.getByRole('button', { name: `Place a piece in row ${row}, column ${column}` }));
    }
    assert.ok(screen.getByText((text) => text.includes(content.puzzle.firstClue)));

    let code = screen.getByLabelText('Enter the code from your little paper');
    await user.type(code, 'incorrect');
    await user.click(screen.getByRole('button', { name: /Unlock/ }));
    assert.match(screen.getByRole('alert').textContent ?? '', /doesn’t seem quite right/);
    await user.clear(code);
    await user.type(code, content.puzzle.firstCode.toLowerCase());
    await user.click(screen.getByRole('button', { name: /Unlock/ }));
    assert.ok(screen.getByText(content.quiz.questions[0].prompt));

    for (let index = 0; index < content.quiz.questions.length; index += 1) {
      await user.click(screen.getByRole('button', { name: /Add answer choice A/ }));
      await user.click(screen.getByRole('button', { name: /Check my answer/ }));
      const nextLabel = index === content.quiz.questions.length - 1 ? /Find my next clue/ : /Next memory/;
      await user.click(screen.getByRole('button', { name: nextLabel }));
    }
    assert.ok(screen.getByText((text) => text.includes(content.quiz.secondClue)));

    code = screen.getByLabelText('Enter the code from your little paper');
    await user.type(code, content.quiz.secondCode);
    await user.click(screen.getByRole('button', { name: /Unlock/ }));
    assert.ok(screen.getByRole('heading', { name: /Five tiny envelopes/ }));

    const lockedFifth = screen.getByRole('button', { name: /Envelope 5 locked/ });
    await user.click(lockedFifth);
    assert.ok(screen.getByText('Open the other four envelopes first! 💌'));
    assert.equal(screen.queryByRole('dialog'), null);
    assert.equal(screen.queryByText(content.envelopes[4].message), null);

    const openAndClose = async (number: number) => {
      await user.click(screen.getByRole('button', { name: new RegExp(`Open envelope ${number}:`) }));
      assert.ok(await screen.findByRole('dialog'));
      await user.click(screen.getByRole('button', { name: 'Close envelope' }));
    };

    await openAndClose(2);
    await openAndClose(3);
    await openAndClose(4);
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY) ?? '{}').openedEnvelopes, [2, 3, 4]);
    await user.click(screen.getByRole('button', { name: /Envelope 5 locked/ }));
    assert.equal(screen.queryByRole('dialog'), null);
    assert.equal(screen.queryByText(content.envelopes[4].message), null);

    await openAndClose(1);
    const unlockedFifth = screen.getByRole('button', { name: /Open envelope 5: Your final surprise/ });
    assert.match(unlockedFifth.textContent ?? '', /Your final surprise\s*is here!/);
    await user.click(unlockedFifth);
    assert.ok(await screen.findByRole('dialog'));
    assert.ok(screen.getByText((text) => text.includes("You've opened every little envelope")));
    await user.click(screen.getByRole('button', { name: /Open Your Final Surprise/ }));

    assert.ok(screen.getByText(/This is the place for your handwritten-style birthday letter/));
    assert.equal(screen.queryByRole('video'), null);
    assert.equal(screen.queryByText(/Your birthday video will live here/), null);
    await user.click(screen.getByRole('button', { name: /Read It/ }));
    assert.ok(screen.getByText('Your birthday video will live here.'));
    assert.ok(screen.getByText(/Love You, Mom/));
    assert.ok(screen.getByText('Happy Birthday!'));

    const saved = JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    assert.deepEqual(saved.openedEnvelopes, [1, 2, 3, 4, 5]);
    assert.equal(saved.letterRead, true);
    assert.equal(JSON.stringify(saved).includes(content.puzzle.firstCode), false);
    assert.equal(JSON.stringify(saved).includes(content.quiz.secondCode), false);

    unmount();
    render(<App />);
    assert.ok(screen.getByText('Your birthday video will live here.'));
    assert.ok(screen.getByText(/Love You, Mom/));
  } finally {
    cleanup();
    dom.window.close();
  }
});
