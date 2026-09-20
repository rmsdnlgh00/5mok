/**
 * 실행: npm run precompute
 *
 * 1) data/dishes.json 의 모든 재료 + data/extra-ingredients.json 을 합쳐 "사전(vocabulary)"을 만든다.
 * 2) 사전 단어 전부를 로컬 임베딩 모델(Transformers.js)로 변환해 data/vocab-embeddings.json 에 저장한다.
 * 3) 음식마다 자기 재료 임베딩의 평균("프로필 벡터")을 구하고,
 *    사전 전체 단어를 그 프로필과의 유사도 순으로 정렬해
 *    data/rankings/<dishId>.json 에 저장한다.
 *
 * 이후 런타임(API 라우트)은 이 파일들을 읽기만 한다. 임베딩 모델은 서버에 올리지 않기
 * 때문에(용량/콜드스타트), 사전에 없는 단어는 채점하지 않고 안내만 한다.
 * → 사전을 넉넉히 유지하는 것이 중요하다. data/extra-ingredients.json 에 재료를 추가하면 된다.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import dishesData from "../data/dishes.json";
import extraIngredients from "../data/extra-ingredients.json";
import type { Dish } from "../lib/types";
import { embedTexts } from "../lib/embed";
import { averageVector, cosineSimilarity } from "../lib/similarity";

const ROOT = path.join(__dirname, "..");
const dishes = dishesData as Dish[];

/** JSON 용량을 줄이려고 소수점 6자리로 자른다 (유사도에는 영향 없음) */
function round(vec: number[]): number[] {
  return vec.map((x) => Math.round(x * 1e6) / 1e6);
}

async function main() {
  console.log(`[precompute] 음식 ${dishes.length}개 로드 완료`);

  // 1) 사전 구성: 음식 재료 + 추가 재료 사전을 중복 없이 합침
  const vocabSet = new Set<string>();
  for (const dish of dishes) {
    for (const ing of dish.ingredients) vocabSet.add(ing);
  }
  for (const ing of extraIngredients as string[]) vocabSet.add(ing);
  const vocab = Array.from(vocabSet);
  console.log(
    `[precompute] 사전 단어 ${vocab.length}개 (음식 재료 + 추가 사전 ${
      (extraIngredients as string[]).length
    }개)`
  );

  // 2) 사전 전체 임베딩 (로컬 모델, 최초 1회만 모델 다운로드)
  console.log("[precompute] 로컬 임베딩 모델로 사전 변환 중... (최초 실행은 모델 다운로드로 수 분 소요)");
  const started = Date.now();
  const vocabVectors = await embedTexts(vocab);
  console.log(`[precompute] 임베딩 완료 (${((Date.now() - started) / 1000).toFixed(1)}초)`);

  const vocabMap = new Map<string, number[]>();
  vocab.forEach((word, i) => vocabMap.set(word, vocabVectors[i]));

  const vocabEmbeddingsOut: Record<string, number[]> = {};
  for (const [word, vec] of vocabMap.entries()) vocabEmbeddingsOut[word] = round(vec);
  fs.writeFileSync(
    path.join(ROOT, "data", "vocab-embeddings.json"),
    JSON.stringify(vocabEmbeddingsOut)
  );
  console.log("[precompute] data/vocab-embeddings.json 저장 완료");

  // 3) 음식별 프로필 벡터 + 랭킹 생성
  const rankingsDir = path.join(ROOT, "data", "rankings");
  fs.mkdirSync(rankingsDir, { recursive: true });

  for (const dish of dishes) {
    const ownVectors = dish.ingredients
      .map((ing) => vocabMap.get(ing))
      .filter((v): v is number[] => Boolean(v));

    if (ownVectors.length === 0) {
      console.warn(`[precompute] ${dish.name}: 재료 임베딩이 없어 건너뜀`);
      continue;
    }

    const profile = averageVector(ownVectors);

    const ranked = vocab
      .map((word) => ({
        word,
        similarity:
          Math.round(cosineSimilarity(vocabMap.get(word)!, profile) * 1e6) / 1e6,
      }))
      .sort((a, b) => b.similarity - a.similarity);

    fs.writeFileSync(
      path.join(rankingsDir, `${dish.id}.json`),
      JSON.stringify({ dishId: dish.id, profile: round(profile), ranked })
    );
    console.log(
      `[precompute] ${dish.name} → 상위 3: ${ranked
        .slice(0, 3)
        .map((r) => `${r.word}(${r.similarity.toFixed(3)})`)
        .join(", ")}`
    );
  }

  console.log("[precompute] 완료! data/rankings/*.json 생성됨");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
