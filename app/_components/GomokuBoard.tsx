"use client";

import { useCallback, useState } from "react";

type Stone = "black" | "white" | null;
type Player = "black" | "white";

const BOARD_SIZE = 15;
const CELL = 32;
const PADDING = 20;
const BOARD_PIXELS = PADDING * 2 + (BOARD_SIZE - 1) * CELL;

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const;

function createEmptyBoard(): Stone[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array<Stone>(BOARD_SIZE).fill(null)
  );
}

function findWinningLine(
  board: Stone[][],
  row: number,
  col: number
): [number, number][] | null {
  const stone = board[row][col];
  if (!stone) return null;

  for (const [dr, dc] of DIRECTIONS) {
    const line: [number, number][] = [[row, col]];

    for (const sign of [1, -1] as const) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (
        r >= 0 &&
        r < BOARD_SIZE &&
        c >= 0 &&
        c < BOARD_SIZE &&
        board[r][c] === stone
      ) {
        line.push([r, c]);
        r += dr * sign;
        c += dc * sign;
      }
    }

    if (line.length >= 5) return line;
  }

  return null;
}

export default function GomokuBoard() {
  const [board, setBoard] = useState<Stone[][]>(createEmptyBoard);
  const [currentPlayer, setCurrentPlayer] = useState<Player>("black");
  const [winner, setWinner] = useState<Player | null>(null);
  const [winningLine, setWinningLine] = useState<[number, number][] | null>(
    null
  );
  const [moveCount, setMoveCount] = useState(0);

  const isDraw = !winner && moveCount === BOARD_SIZE * BOARD_SIZE;

  const handlePlace = useCallback(
    (row: number, col: number) => {
      if (winner || board[row][col]) return;

      const nextBoard = board.map((r) => r.slice());
      nextBoard[row][col] = currentPlayer;
      const line = findWinningLine(nextBoard, row, col);

      setBoard(nextBoard);
      setMoveCount((count) => count + 1);

      if (line) {
        setWinner(currentPlayer);
        setWinningLine(line);
      } else {
        setCurrentPlayer((player) => (player === "black" ? "white" : "black"));
      }
    },
    [board, currentPlayer, winner]
  );

  const handleReset = useCallback(() => {
    setBoard(createEmptyBoard());
    setCurrentPlayer("black");
    setWinner(null);
    setWinningLine(null);
    setMoveCount(0);
  }, []);

  const winningSet = new Set(winningLine?.map(([r, c]) => `${r}-${c}`));

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="flex h-7 items-center gap-2 text-lg font-medium text-neutral-800 dark:text-neutral-100">
        {winner ? (
          <>
            <StoneDot player={winner} />
            <span>{winner === "black" ? "흑" : "백"} 승리!</span>
          </>
        ) : isDraw ? (
          <span>무승부</span>
        ) : (
          <>
            <StoneDot player={currentPlayer} />
            <span>{currentPlayer === "black" ? "흑" : "백"} 차례</span>
          </>
        )}
      </div>

      <div className="max-w-full overflow-x-auto">
        <div
          className="relative rounded-md bg-[#dcb35c] shadow-lg dark:bg-[#a97c3f]"
          style={{ width: BOARD_PIXELS, height: BOARD_PIXELS }}
        >
          {Array.from({ length: BOARD_SIZE }).map((_, i) => (
            <span key={`h-${i}`}>
              <span
                className="absolute bg-[#5c3a1e]"
                style={{
                  left: PADDING,
                  top: PADDING + i * CELL,
                  width: (BOARD_SIZE - 1) * CELL,
                  height: 1,
                }}
              />
              <span
                className="absolute bg-[#5c3a1e]"
                style={{
                  top: PADDING,
                  left: PADDING + i * CELL,
                  height: (BOARD_SIZE - 1) * CELL,
                  width: 1,
                }}
              />
            </span>
          ))}

          {board.map((rowStones, row) =>
            rowStones.map((stone, col) => {
              const isWinning = winningSet.has(`${row}-${col}`);
              return (
                <button
                  key={`${row}-${col}`}
                  type="button"
                  onClick={() => handlePlace(row, col)}
                  disabled={!!winner || !!stone}
                  aria-label={`${row + 1}행 ${col + 1}열`}
                  className="group absolute flex items-center justify-center"
                  style={{
                    left: PADDING + col * CELL,
                    top: PADDING + row * CELL,
                    width: CELL,
                    height: CELL,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {stone ? (
                    <span
                      className={`h-[26px] w-[26px] rounded-full shadow-md ${
                        stone === "black"
                          ? "bg-neutral-900"
                          : "border border-neutral-400 bg-white"
                      } ${isWinning ? "ring-2 ring-red-500" : ""}`}
                    />
                  ) : (
                    !winner && (
                      <span className="hidden h-[26px] w-[26px] rounded-full bg-black/10 group-hover:block dark:bg-white/20" />
                    )
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleReset}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        다시 시작
      </button>
    </div>
  );
}

function StoneDot({ player }: { player: Player }) {
  return (
    <span
      className={`inline-block h-5 w-5 rounded-full ${
        player === "black"
          ? "bg-neutral-900"
          : "border border-neutral-400 bg-white"
      }`}
    />
  );
}
