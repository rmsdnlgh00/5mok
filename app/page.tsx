"use client";

import { useState } from "react";

type Guess =
  | {
      id: number;
      status: "scored";
      word: string;
      score: number;
      rank: number | null;
      isExactIngredient: boolean;
    }
  | {
      id: number;
      status: "dish";
      word: string;
      score: number;
      rank: number;
      totalDishes: number;
      nameScore: number;
      ingredientScore: number;
    }
  | {
      id: number;
      status: "win";
      word: string;
    };

let nextId = 1;

function scoreColor(score: number): string {
  // 0점 근처는 흐린 갈색, 100점에 가까울수록 진한 gochujang red
  const clamped = Math.max(0, Math.min(100, score));
  const t = clamped / 100;
  const from = [107, 92, 74]; // --ink-soft
  const to = [178, 58, 46]; // --accent
  const rgb = from.map((c, i) => Math.round(c + (to[i] - c) * t));
  return `rgb(${rgb.join(",")})`;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [won, setWon] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastId, setLastId] = useState<number | null>(null);

  async function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    const word = input.trim();
    if (!word || loading || won) return;

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess: word }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "오류가 발생했어요.");
        return;
      }

      // 사전에 없는 단어는 채점하지 않고 안내만 한다 (입력값은 그대로 두어 고칠 수 있게)
      if (data.status === "unknown") {
        setNotice(
          `“${word}” 은(는) 아직 사전에 없는 재료예요. 다른 재료로 시도해보세요.`
        );
        return;
      }

      const id = nextId++;

      // 다른 음식 이름 — 정답은 아니지만 얼마나 가까운 음식인지 점수로 남긴다
      if (data.status === "dish-scored") {
        setGuesses((prev) => [
          ...prev,
          {
            id,
            status: "dish",
            word,
            score: data.score,
            rank: data.rank,
            totalDishes: data.totalDishes,
            nameScore: data.nameScore,
            ingredientScore: data.ingredientScore,
          },
        ]);
        setLastId(id);
        setInput("");
        return;
      }

      if (data.status === "win") {
        setGuesses((prev) => [...prev, { id, status: "win", word }]);
        setWon(data.dishName);
      } else {
        setGuesses((prev) => [
          ...prev,
          {
            id,
            status: "scored",
            word,
            score: data.score,
            rank: data.rank,
            isExactIngredient: data.isExactIngredient,
          },
        ]);
        setLastId(id);
      }
      setInput("");
    } catch {
      setError("네트워크 오류가 발생했어요. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  const scored = guesses.filter((g): g is Extract<Guess, { status: "scored" }> =>
    g.status === "scored"
  );
  const sorted = [...scored].sort((a, b) => b.score - a.score);

  // 음식 점수는 "다른 음식들 사이의 분포" 기준이라 재료 점수와 같은 축에서
  // 비교할 수 없다. 그래서 정렬도 표도 따로 둔다.
  const dishGuesses = guesses.filter(
    (g): g is Extract<Guess, { status: "dish" }> => g.status === "dish"
  );
  const sortedDishes = [...dishGuesses].sort((a, b) => b.score - a.score);

  return (
    <main className="page">
      <div className="wordmark">
        <h1>재료맨틀</h1>
      </div>
      <p style={{ textAlign: "center", color: "var(--ink-soft)", marginBottom: 40 }}>
        재료를 하나씩 입력해서 오늘의 음식을 맞혀보세요
      </p>

      <form className="guess-form" onSubmit={submitGuess}>
        <input
          className="guess-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="재료 이름 (또는 음식 이름 정답)"
          disabled={loading || Boolean(won)}
          autoFocus
        />
        <button className="guess-submit" type="submit" disabled={loading || Boolean(won)}>
          {loading ? "..." : "입력"}
        </button>
      </form>
      <p className="hint">
        재료를 입력하면 오늘의 정답 음식과의 유사도를 0~100 점수로 알려줘요. 음식 이름을 바로
        맞히면 게임이 끝나요.
      </p>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {won && (
        <div className="win-card">
          <h2>정답입니다! 🎉</h2>
          <p>
            오늘의 음식은 <strong>{won}</strong> 이었어요. {scored.length}번 만에 맞혔어요.
          </p>
        </div>
      )}

      <div className="section-label">시도 {scored.length}회</div>

      <div className="board">
        <div className="board-header">
          <span>#</span>
          <span>재료</span>
          <span style={{ textAlign: "right" }}>유사도</span>
          <span style={{ textAlign: "right" }}>순위</span>
        </div>
        {sorted.length === 0 ? (
          <div className="empty-board">아직 시도가 없어요. 첫 재료를 입력해보세요.</div>
        ) : (
          sorted.map((g, i) => (
            <div
              key={g.id}
              className={`board-row${g.id === lastId ? " is-new" : ""}`}
            >
              <span className="rank-num">{i + 1}</span>
              <span>
                {g.word}
                {g.isExactIngredient && <span className="exact-tag">재료 일치</span>}
              </span>
              <span className="score" style={{ color: scoreColor(g.score) }}>
                {g.score.toFixed(1)}
              </span>
              <span className="word-rank">{g.rank ? `${g.rank}위` : "-"}</span>
            </div>
          ))
        )}
      </div>

      {sortedDishes.length > 0 && (
        <>
          <div className="section-label">음식 추측 {sortedDishes.length}회</div>
          <div className="board">
            <div className="board-header board-header--dish">
              <span>#</span>
              <span>음식</span>
              <span style={{ textAlign: "right" }}>유사도</span>
              <span style={{ textAlign: "right" }}>순위</span>
            </div>
            {sortedDishes.map((g, i) => (
              <div
                key={g.id}
                className={`board-row board-row--dish${g.id === lastId ? " is-new" : ""}`}
              >
                <span className="rank-num">{i + 1}</span>
                <span>
                  {g.word}
                  <span className="sub-scores">
                    이름 {g.nameScore.toFixed(0)} · 재료 {g.ingredientScore.toFixed(0)}
                  </span>
                </span>
                <span className="score" style={{ color: scoreColor(g.score) }}>
                  {g.score.toFixed(1)}
                </span>
                <span className="word-rank">
                  {g.rank}/{g.totalDishes}위
                </span>
              </div>
            ))}
          </div>
          <p className="hint hint--tight">
            음식 점수는 다른 음식들과 비교한 값이라 위의 재료 점수와는 다른 기준이에요.
          </p>
        </>
      )}
    </main>
  );
}
