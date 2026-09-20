import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getAllDishes, getTodaysDish } from "@/lib/dishSelector";
import { normalizeWord, scoreAgainstRanking } from "@/lib/similarity";
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

    // 2) 재료 이름으로 판단
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

    // 유사도는 precompute 단계에서 전부 계산해뒀다. 런타임에는 임베딩 모델을
    // 올리지 않으므로(용량/콜드스타트), 사전에 있는 단어만 채점할 수 있다.
    const cachedEntry = ranking.ranked.find((r) => normalizeWord(r.word) === guess);
    if (!cachedEntry) {
      // 사전에 없는 단어가 사실은 다른 음식 이름이라면, 재료로 착각한 것이 아니라
      // 정답을 틀린 것이므로 다르게 안내한다. (재료이면서 음식인 "삼겹살" 같은
      // 단어는 위 사전 조회에서 이미 채점되므로 여기까지 오지 않는다.)
      const isKnownDish = getAllDishes().some(
        (d) =>
          normalizeWord(d.name) === guess ||
          d.aliases.some((a) => normalizeWord(a) === guess)
      );
      const result: GuessResult = isKnownDish
        ? { status: "wrong-dish", guess: rawGuess }
        : { status: "unknown", guess: rawGuess };
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
