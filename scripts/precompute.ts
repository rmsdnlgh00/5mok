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
import type { Dish, DishSimilarity } from "../lib/types";
import { embedTexts } from "../lib/embed";
import { averageVector, cosineSimilarity } from "../lib/similarity";

const ROOT = path.join(__dirname, "..");

/**
 * 음식 간 유사도를 이루는 세 신호의 비중. 음식 63개로 비교해 고른 값이다.
 *   같은 조리법 평균순위 5.76 / 재료 2개 이상 공유 평균순위 9.26  (둘 다 낮을수록 좋음)
 * 직전 설정(이름 .5 / 프로필 .5 / 겹침 0)의 6.32 · 12.63 을 양쪽 모두에서 이긴다.
 *
 * 핵심은 OVERLAP 이다. 재료 평균 벡터(프로필)는 "실제로 같은 재료를 쓰는가"를
 * 제대로 잡지 못한다 — 꽃게탕과 재료 5개를 공유하는 동태찌개가 상위에 오지 않았다.
 * 두 음식의 재료 목록을 이미 알고 있으므로 겹치는 개수를 직접 세는 편이 정확하다.
 */
const WEIGHTS = {
  /** 음식 이름끼리의 임베딩 유사도 — "찌개 ↔ 찌개"를 잡는다 */
  name: 0.5,
  /** 재료 평균 벡터끼리의 유사도 — 겹치는 재료가 없어도 결이 비슷하면 반응한다 */
  profile: 0.1,
  /** 재료 목록이 실제로 겹치는 비율(자카드) */
  overlap: 0.4,
};

/**
 * 세 신호는 값의 폭이 크게 다르다(코사인 0.85~0.99 vs 자카드 0~0.5). 그대로 더하면
 * 가중치가 의미를 잃으므로 후보군 안에서 각각 0~1로 정규화한 뒤 섞는다.
 *
 * 이때 "정답 자신"의 값 1.0 을 최대값으로 포함시킨다. 그러지 않으면 가장 가까운
 * 음식이 늘 만점을 받아 정답으로 착각하게 된다. 100점은 정답만 받는다.
 */
function normalizeAgainstAnswer(values: number[]): number[] {
  const min = Math.min(1, ...values);
  const range = 1 - min || 1e-9;
  return values.map((v) => (v - min) / range);
}

/** 두 재료 목록이 겹치는 비율 (교집합 / 합집합) */
function jaccard(a: string[], b: string[]): number {
  const setB = new Set(b);
  const shared = a.filter((x) => setB.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : shared / union;
}
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

  // 3) 음식 이름도 임베딩한다. 사용자가 "김치찌개"처럼 다른 음식 이름을 넣었을 때
  //    "찌개끼리는 비슷하다"를 잡아내려면 재료만으로는 부족하기 때문이다.
  //    (재료 사전과는 분리해서 관리한다. 사전에 섞으면 재료 랭킹이 오염된다.)
  console.log("[precompute] 음식 이름 임베딩 중...");
  const nameVectors = await embedTexts(dishes.map((d) => d.name));
  const nameMap = new Map<string, number[]>();
  dishes.forEach((d, i) => nameMap.set(d.id, nameVectors[i]));

  // 4) 음식별 프로필 벡터 계산
  const profileMap = new Map<string, number[]>();
  for (const dish of dishes) {
    const ownVectors = dish.ingredients
      .map((ing) => vocabMap.get(ing))
      .filter((v): v is number[] => Boolean(v));

    if (ownVectors.length === 0) {
      console.warn(`[precompute] ${dish.name}: 재료 임베딩이 없어 건너뜀`);
      continue;
    }
    profileMap.set(dish.id, averageVector(ownVectors));
  }

  // 5) 랭킹 생성 (재료 사전 + 다른 음식)
  const rankingsDir = path.join(ROOT, "data", "rankings");
  fs.mkdirSync(rankingsDir, { recursive: true });

  for (const dish of dishes) {
    const profile = profileMap.get(dish.id);
    if (!profile) continue;

    const ranked = vocab
      .map((word) => ({
        word,
        similarity:
          Math.round(cosineSimilarity(vocabMap.get(word)!, profile) * 1e6) / 1e6,
      }))
      .sort((a, b) => b.similarity - a.similarity);

    // 다른 음식들과의 유사도 (세 신호를 정규화해 WEIGHTS 로 섞는다)
    const others = dishes.filter(
      (other) => other.id !== dish.id && profileMap.has(other.id)
    );
    const rawName = others.map((o) =>
      cosineSimilarity(nameMap.get(dish.id)!, nameMap.get(o.id)!)
    );
    const rawProfile = others.map((o) =>
      cosineSimilarity(profile, profileMap.get(o.id)!)
    );
    const rawOverlap = others.map((o) => jaccard(dish.ingredients, o.ingredients));

    const nName = normalizeAgainstAnswer(rawName);
    const nProfile = normalizeAgainstAnswer(rawProfile);
    const nOverlap = normalizeAgainstAnswer(rawOverlap);

    const ownIngredients = new Set(dish.ingredients);
    const dishRanked: DishSimilarity[] = others
      .map((other, i) => ({
        dishId: other.id,
        name: other.name,
        similarity:
          Math.round(
            (WEIGHTS.name * nName[i] +
              WEIGHTS.profile * nProfile[i] +
              WEIGHTS.overlap * nOverlap[i]) *
              1e6
          ) / 1e6,
        nameScore: Math.round(nName[i] * 1e6) / 1e6,
        ingredientScore: Math.round(nOverlap[i] * 1e6) / 1e6,
        // 공통 재료는 개수만 남긴다. 이름을 그대로 보여주면 정답의 재료가
        // 노출되어 게임이 끝나버린다.
        sharedCount: other.ingredients.filter((x) => ownIngredients.has(x)).length,
      }))
      .sort((x, y) => y.similarity - x.similarity);

    fs.writeFileSync(
      path.join(rankingsDir, `${dish.id}.json`),
      JSON.stringify({ dishId: dish.id, profile: round(profile), ranked, dishRanked })
    );
    console.log(
      `[precompute] ${dish.name} → 재료 상위3: ${ranked
        .slice(0, 3)
        .map((r) => r.word)
        .join(", ")} | 가까운 음식: ${dishRanked
        .slice(0, 3)
        .map((r) => r.name)
        .join(", ")}`
    );
  }

  console.log("[precompute] 완료! data/rankings/*.json 생성됨");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
