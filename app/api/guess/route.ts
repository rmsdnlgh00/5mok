import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getTodaysDish } from "@/lib/dishSelector";
import { embedText } from "@/lib/openai";
import { cosineSimilarity, normalizeWord, scoreAgainstRanking } from "@/lib/similarity";
import type { DishRanking, GuessResult } from "@/lib/types";

function loadRanking(dishId: string): DishRanking | null {
  const file = path.join(process.cwd(), "data", "rankings", `${dishId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8")) as DishRanking;
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

    const isExactIngredient = dish.ingredients.some(
      (ing) => normalizeWord(ing) === guess
    );

    // 사전에 이미 있는 단어면 미리 계산해둔 유사도를 그대로 쓰고(API 호출 없음),
    // 사전에 없는 새 단어일 때만 실시간으로 임베딩을 계산해 프로필 벡터와 비교한다.
    let similarity: number;

    const cachedEntry = ranking.ranked.find((r) => normalizeWord(r.word) === guess);
    if (cachedEntry) {
      similarity = cachedEntry.similarity;
    } else {
      const guessVector = await embedText(rawGuess);
      similarity = cosineSimilarity(guessVector, ranking.profile);
    }

    const { score, rank } = scoreAgainstRanking(similarity, ranking.ranked);

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
