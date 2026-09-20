/**
 * 실행: npm run precompute
 *
 * 1) data/dishes.json 에 등장하는 모든 재료를 모아 "사전(vocabulary)"을 만든다.
 * 2) 사전 단어 전부를 OpenAI 임베딩으로 변환해 data/vocab-embeddings.json 에 저장한다.
 * 3) 음식마다 자기 재료 임베딩의 평균("프로필 벡터")을 구하고,
 *    사전 전체 단어를 그 프로필과의 유사도 순으로 정렬해
 *    data/rankings/<dishId>.json 에 저장한다.
 *
 * 이후 런타임(API 라우트)에서는 이 파일들을 읽기만 하면 되고,
 * 사용자가 "사전에 없는 새 단어"를 입력했을 때만 실시간으로 임베딩 API를 호출한다.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import dishesData from "../data/dishes.json";
import type { Dish } from "../lib/types";
import { embedTexts } from "../lib/openai";
import { averageVector, cosineSimilarity } from "../lib/similarity";

const ROOT = path.join(__dirname, "..");
const dishes = dishesData as Dish[];

async function main() {
  console.log(`[precompute] 음식 ${dishes.length}개 로드 완료`);

  // 1) 사전 구성: 모든 음식의 재료를 중복 없이 합침
  const vocabSet = new Set<string>();
  for (const dish of dishes) {
    for (const ing of dish.ingredients) vocabSet.add(ing);
  }
  const vocab = Array.from(vocabSet);
  console.log(`[precompute] 사전 단어 ${vocab.length}개: ${vocab.join(", ")}`);

  // 2) 사전 전체 임베딩 (배치로 한 번에 호출)
  console.log("[precompute] 사전 단어 임베딩 요청 중...");
  const vocabVectors = await embedTexts(vocab);
  const vocabMap = new Map<string, number[]>();
  vocab.forEach((word, i) => vocabMap.set(word, vocabVectors[i]));

  const vocabEmbeddingsOut: Record<string, number[]> = {};
  for (const [word, vec] of vocabMap.entries()) vocabEmbeddingsOut[word] = vec;
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
        similarity: cosineSimilarity(vocabMap.get(word)!, profile),
      }))
      .sort((a, b) => b.similarity - a.similarity);

    fs.writeFileSync(
      path.join(rankingsDir, `${dish.id}.json`),
      JSON.stringify({ dishId: dish.id, profile, ranked })
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
