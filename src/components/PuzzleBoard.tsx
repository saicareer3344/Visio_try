import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

interface PuzzleBoardProps {
  imageSrc: string;
  fallbackImage: string;
  rows: number;
  columns: number;
  initiallyCompleted: boolean;
  onComplete: () => void;
}

interface Piece {
  id: number;
  row: number;
  column: number;
}

interface DragState {
  pieceId: number;
  pointerId: number;
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
  origin: DOMRect;
}

function edgeBump(row: number, column: number): number {
  return (row * 7 + column * 11 + 3) % 2 === 0 ? 1 : -1;
}

function horizontalBump(row: number, column: number): number {
  return (row * 13 + column * 5 + 1) % 2 === 0 ? 1 : -1;
}

function edgeSign(piece: Piece, side: 'top' | 'right' | 'bottom' | 'left', rows: number, columns: number): number {
  switch (side) {
    case 'top': return piece.row === 0 ? 0 : -horizontalBump(piece.row - 1, piece.column);
    case 'right': return piece.column === columns - 1 ? 0 : edgeBump(piece.row, piece.column);
    case 'bottom': return piece.row === rows - 1 ? 0 : horizontalBump(piece.row, piece.column);
    case 'left': return piece.column === 0 ? 0 : -edgeBump(piece.row, piece.column - 1);
  }
}

function edgePath(
  startX: number,
  startY: number,
  directionX: number,
  directionY: number,
  normalX: number,
  normalY: number,
  sign: number,
): string {
  const at = (along: number, outward: number) => {
    const x = startX + directionX * along + normalX * outward;
    const y = startY + directionY * along + normalY * outward;
    return `${x} ${y}`;
  };
  if (!sign) return `L ${at(100, 0)}`;
  return [
    `L ${at(34, 0)}`,
    `C ${at(34, sign * 7)} ${at(38, sign * 13)} ${at(44, sign * 13)}`,
    `C ${at(44, sign * 21)} ${at(56, sign * 21)} ${at(56, sign * 13)}`,
    `C ${at(62, sign * 13)} ${at(66, sign * 7)} ${at(66, 0)}`,
    `L ${at(100, 0)}`,
  ].join(' ');
}

function makePiecePath(piece: Piece, rows: number, columns: number): string {
  const top = edgePath(0, 0, 1, 0, 0, -1, edgeSign(piece, 'top', rows, columns));
  const right = edgePath(100, 0, 0, 1, 1, 0, edgeSign(piece, 'right', rows, columns));
  const bottom = edgePath(100, 100, -1, 0, 0, 1, edgeSign(piece, 'bottom', rows, columns));
  const left = edgePath(0, 100, 0, -1, -1, 0, edgeSign(piece, 'left', rows, columns));
  return `M 0 0 ${top} ${right} ${bottom} ${left} Z`;
}

function PieceArtwork({
  piece,
  rows,
  columns,
  imageSrc,
  idPrefix,
}: {
  piece: Piece;
  rows: number;
  columns: number;
  imageSrc: string;
  idPrefix: string;
}) {
  const clipId = `${idPrefix}-piece-${piece.id}`;
  const path = makePiecePath(piece, rows, columns);
  return (
    <svg className="piece-art" viewBox="-24 -24 148 148" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <path d={path} />
        </clipPath>
      </defs>
      <image
        href={imageSrc}
        x={-piece.column * 100}
        y={-piece.row * 100}
        width={columns * 100}
        height={rows * 100}
        preserveAspectRatio="xMidYMid slice"
        clipPath={`url(#${clipId})`}
      />
      <path className="piece-outline" d={path} />
    </svg>
  );
}

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function PuzzleBoard({
  imageSrc,
  fallbackImage,
  rows,
  columns,
  initiallyCompleted,
  onComplete,
}: PuzzleBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const completionSent = useRef(initiallyCompleted);
  const suppressClick = useRef(false);
  const [placed, setPlaced] = useState<Set<number>>(() => new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<number | null>(null);
  const [solved, setSolved] = useState(initiallyCompleted);
  const [feedback, setFeedback] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const idPrefix = useMemo(() => `puzzle-${Math.random().toString(36).slice(2, 9)}`, []);
  const pieces = useMemo<Piece[]>(() => Array.from({ length: rows * columns }, (_, id) => ({
    id,
    row: Math.floor(id / columns),
    column: id % columns,
  })), [rows, columns]);
  const [trayOrder] = useState(() => shuffle(pieces.map((piece) => piece.id)));
  const availableImage = imageFailed ? fallbackImage : imageSrc;

  const finishIfComplete = (nextPlaced: Set<number>) => {
    if (nextPlaced.size !== pieces.length) return;
    setSolved(true);
    if (!completionSent.current) {
      completionSent.current = true;
      onComplete();
    }
  };

  const placePiece = (pieceId: number, targetRow: number, targetColumn: number) => {
    const piece = pieces[pieceId];
    if (!piece || placed.has(pieceId) || solved) return;
    if (piece.row !== targetRow || piece.column !== targetColumn) {
      setFeedback('Almost! Try another spot for that piece. 🌷');
      return;
    }
    const next = new Set(placed);
    next.add(pieceId);
    setPlaced(next);
    setSelectedPiece(null);
    setFeedback('A lovely fit! Keep going. ✨');
    finishIfComplete(next);
  };

  const handlePointerDown = (pieceId: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (solved || placed.has(pieceId)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedPiece(pieceId);
    setFeedback('');
    setDrag({
      pieceId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      deltaY: 0,
      origin: event.currentTarget.getBoundingClientRect(),
    });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDrag((current) => current && current.pointerId === event.pointerId
      ? { ...current, deltaX: event.clientX - current.startX, deltaY: event.clientY - current.startY }
      : current);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const moved = Math.hypot(deltaX, deltaY) > 7;
    setDrag(null);

    if (!moved) {
      setSelectedPiece(drag.pieceId);
      return;
    }

    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    const board = boardRef.current?.getBoundingClientRect();
    if (!board) return;
    const centerX = drag.origin.left + deltaX + drag.origin.width / 2;
    const centerY = drag.origin.top + deltaY + drag.origin.height / 2;
    const insideBoard = centerX >= board.left && centerX <= board.right && centerY >= board.top && centerY <= board.bottom;
    if (!insideBoard) return;

    const cellWidth = board.width / columns;
    const cellHeight = board.height / rows;
    const targetColumn = Math.min(columns - 1, Math.floor((centerX - board.left) / cellWidth));
    const targetRow = Math.min(rows - 1, Math.floor((centerY - board.top) / cellHeight));
    const targetX = board.left + (targetColumn + 0.5) * cellWidth;
    const targetY = board.top + (targetRow + 0.5) * cellHeight;
    const closeEnough = Math.hypot(centerX - targetX, centerY - targetY) <= Math.min(cellWidth, cellHeight) * 0.62;
    if (closeEnough) placePiece(drag.pieceId, targetRow, targetColumn);
    else setFeedback('Drop the piece a little closer to the middle of a spot. 🌷');
  };

  const handlePieceClick = (pieceId: number) => {
    if (suppressClick.current || solved || placed.has(pieceId)) return;
    setSelectedPiece(pieceId);
    setFeedback('Piece selected. Choose its spot on the picture, or drag it there. 💗');
  };

  const handleImageError = () => {
    if (availableImage !== fallbackImage) setImageFailed(true);
    else setFallbackFailed(true);
  };

  if (solved) {
    return (
      <div className="puzzle-solved-image">
        {!fallbackFailed ? (
          <img src={availableImage} alt="The completed birthday puzzle" onError={handleImageError} />
        ) : (
          <div className="puzzle-image-fallback">Your picture will appear here once its asset is added.</div>
        )}
        <span className="solved-stamp">All together, just like the best memories <span>♥</span></span>
      </div>
    );
  }

  return (
    <div className="puzzle-widget">
      <div className={`puzzle-board ${fallbackFailed ? 'has-no-image' : ''}`} ref={boardRef} aria-label="Jigsaw puzzle board">
        {!fallbackFailed ? (
          <img className="puzzle-guide-image" src={availableImage} alt="" aria-hidden="true" onError={handleImageError} />
        ) : (
          <div className="puzzle-image-fallback">Your picture will appear here once its asset is added.</div>
        )}
        <div className="puzzle-target-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
          {pieces.map((piece) => (
            <button
              type="button"
              className={`puzzle-target ${selectedPiece !== null ? 'can-select' : ''}`}
              key={`target-${piece.id}`}
              aria-label={`Place a piece in row ${piece.row + 1}, column ${piece.column + 1}`}
              disabled={placed.has(piece.id)}
              onClick={() => {
                if (selectedPiece === null) {
                  setFeedback('Choose a piece from the tray first. 💌');
                  return;
                }
                placePiece(selectedPiece, piece.row, piece.column);
              }}
            />
          ))}
        </div>
        {pieces.filter((piece) => placed.has(piece.id)).map((piece) => (
          <div
            className="puzzle-placed-piece"
            key={`placed-${piece.id}`}
            style={{
              left: `${(piece.column / columns) * 100}%`,
              top: `${(piece.row / rows) * 100}%`,
              width: `${100 / columns}%`,
              height: `${100 / rows}%`,
            }}
          >
            <PieceArtwork piece={piece} rows={rows} columns={columns} imageSrc={availableImage} idPrefix={idPrefix} />
          </div>
        ))}
      </div>

      <div className="puzzle-tray-heading">
        <span className="eyebrow">THE PIECES</span>
        <span className="piece-counter">{placed.size} <span>/</span> {pieces.length} in place</span>
      </div>
      <div className="puzzle-tray" role="group" aria-label="Jigsaw pieces">
        {trayOrder.map((id) => {
          const piece = pieces[id];
          if (placed.has(id)) return <span className="puzzle-tray-empty" key={`empty-${id}`} aria-hidden="true" />;
          const isDragging = drag?.pieceId === id;
          return (
            <button
              type="button"
              className={`puzzle-piece-button ${selectedPiece === id ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
              key={`tray-${piece.id}`}
              aria-label={`Puzzle piece ${piece.row + 1}, ${piece.column + 1}${selectedPiece === id ? ', selected' : ''}`}
              aria-pressed={selectedPiece === id}
              style={isDragging && drag ? { transform: `translate3d(${drag.deltaX}px, ${drag.deltaY}px, 0)` } : undefined}
              onPointerDown={(event) => handlePointerDown(id, event)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => setDrag(null)}
              onClick={() => handlePieceClick(id)}
            >
              <PieceArtwork piece={piece} rows={rows} columns={columns} imageSrc={availableImage} idPrefix={idPrefix} />
            </button>
          );
        })}
      </div>
      <div className="puzzle-instructions-row">
        <p className="puzzle-instructions"><span aria-hidden="true">↗</span> Drag a piece onto its matching place. You can also select a piece, then choose a spot.</p>
        {feedback && <p className="puzzle-feedback" role="status">{feedback}</p>}
      </div>
    </div>
  );
}
