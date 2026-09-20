import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getAllDishes, getTodaysDish } from "@/lib/dishSelector";
import { normalizeWord, scoreAgainstRanking, scoreInRange } from "@/lib/similarity";
import type { DishRanking, GuessResult } from "@/lib/types";

// 랭킹 JSON은 배포 후 바뀌지 않으므로 프로세스 메모리에 캐시해둔다.
const rankingCache = new Map<string, DishRanking | null>();

function loadRanking(dishId: string): DishRanking | null {
  const cached = rankingCache.get(dishId);
  if (cached !== undefined) return cached;

  const file = path.join(process.cwd(), "data", "rankings", `${dishId}.json`);
  const ranking = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, "utf-8")) as DishRanking)
    : null;
  rankingCache.set(dishId, ranking);
  return ranking;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawGuess: string = body?.guess ?? "";
    const guess = normalizeWord(rawGuess);

    if (!guess) {
      return NextResponse.json({ error: "재료나 음식 이름을 입력해주세요." }, { status: 400 });
    }

    // 오늘의 정답은 항상 서버에서 결정한다 (클라이언트는 절대 알 수 없음)
    const dish = getTodaysDish();

    // 1) 음식 이름(또는 별칭)을 그대로 맞히면 즉시 승리
    const dishNameNormalized = normalizeWord(dish.name);
    const aliasNormalized = dish.aliases.map(normalizeWord);
    if (guess === dishNameNormalized || aliasNormalized.includes(guess)) {
      const result: GuessResult = {
        status: "win",
        guess: rawGuess,
        dishName: dish.name,
      };
      return NextResponse.json(result);
    }

    const ranking = loadRanking(dish.id);
    if (!ranking) {
      return NextResponse.json(
        {
          error:
            "아직 이 음식의 랭킹 데이터가 없어요. `npm run precompute`를 먼저 실행해주세요.",
        },
        { status: 500 }
      );
    }

    // 2) 다른 음식 이름을 입력한 경우 — 정답은 아니지만 얼마나 가까운 음식인지
    //    점수로 알려준다. ("김치찌개"는 된장찌개와 같은 찌개이고 재료도 많이 겹친다)
    //    재료 조회보다 먼저 확인한다. "삼겹살"처럼 음식이면서 재료이기도 한 단어는
    //    사용자가 정답을 맞히려고 넣었을 가능성이 높기 때문이다.
    const guessedDish = getAllDishes().find(
      (d) =>
        normalizeWord(d.name) === guess ||
        d.aliases.some((alias) => normalizeWord(alias) === guess)
    );
    if (guessedDish) {
      const index = ranking.dishRanked.findIndex(
        (d) => d.dishId === guessedDish.id
      );
      if (index !== -1) {
        const entry = ranking.dishRanked[index];

        // 점수 기준을 "정답 자신"까지 포함해서 잡는다. 그러지 않으면 가장 가까운
        // 음식이 항상 100점을 받아 정답인 줄 착각하게 된다. 정답과의 유사도는
        // 정의상 1.0 이므로 그 값을 분포의 최대값으로 넣어준다.
        const withAnswer = (values: number[]) => [1, ...values];

        const result: GuessResult = {
          status: "dish-scored",
          guess: rawGuess,
          dishName: guessedDish.name,
          score: scoreInRange(
            entry.similarity,
            withAnswer(ranking.dishRanked.map((d) => d.similarity))
          ),
          rank: index + 1,
          totalDishes: ranking.dishRanked.length,
          nameScore: scoreInRange(
            entry.nameSimilarity,
            withAnswer(ranking.dishRanked.map((d) => d.nameSimilarity))
          ),
          ingredientScore: scoreInRange(
            entry.profileSimilarity,
            withAnswer(ranking.dishRanked.map((d) => d.profileSimilarity))
          ),
        };
        return NextResponse.json(result);
      }
    }

    // 3) 재료로 채점. 유사도는 precompute 단계에서 전부 계산해뒀다. 런타임에는
    //    임베딩 모델을 올리지 않으므로(용량/콜드스타트) 사전에 있는 단어만 채점된다.
    const cachedEntry = ranking.ranked.find((r) => normalizeWord(r.word) === guess);
    if (!cachedEntry) {
      const result: GuessResult = { status: "unknown", guess: rawGuess };
      return NextResponse.json(result);
    }

    const isExactIngredient = dish.ingredients.some(
      (ing) => normalizeWord(ing) === guess
    );
    const { score, rank } = scoreAgainstRanking(cachedEntry.similarity, ranking.ranked);

    const result: GuessResult = {
      status: "scored",
      guess: rawGuess,
      score,
      rank,
      isExactIngredient,
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }
}
