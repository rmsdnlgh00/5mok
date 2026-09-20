/** 사용자 입력 정규화: 앞뒤 공백 제거, 내부 공백 제거, 소문자화(영문 대비) */
export function normalizeWord(input: string): string {
  return input.trim().replace(/\s+/g, "").toLowerCase();
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function averageVector(vectors: number[][]): number[] {
  const dim = vectors[0].length;
  const out = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  return out.map((x) => x / vectors.length);
}

/**
 * 사전(vocabulary) 순위 목록 안에서, 주어진 유사도 값이 들어갈 위치(순위)와
 * 0~100 사이의 점수를 계산한다.
 *
 * 방식: 사전 안의 최고/최저 유사도를 각각 100점/0점으로 놓고 선형 보간.
 * 꼬맨틀처럼 "상위 1000위 안에 들면 순위, 못 들면 비율만 표기"와 같은 느낌을
 * 내기 위해 rank도 함께 반환한다.
 */
export function scoreAgainstRanking(
  similarity: number,
  ranked: { similarity: number }[]
): { score: number; rank: number | null } {
  if (ranked.length === 0) return { score: 0, rank: null };

  const max = ranked[0].similarity;
  const min = ranked[ranked.length - 1].similarity;
  const range = max - min || 1e-9;

  const rawScore = ((similarity - min) / range) * 100;
  const score = Math.round(rawScore * 10) / 10;

  // 순위: 이 유사도보다 높은 단어가 몇 개인지 세어서 1-based rank 부여
  let rank: number | null = null;
  for (let i = 0; i < ranked.length; i++) {
    if (similarity >= ranked[i].similarity) {
      rank = i + 1;
      break;
    }
  }
  // 사전에 있는 어떤 단어보다도 유사도가 낮으면 순위 없음(비율만 표기)
  if (rank === null) rank = null;

  return { score, rank };
}
