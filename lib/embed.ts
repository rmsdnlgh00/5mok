/**
 * 로컬 임베딩 (Transformers.js) — 외부 API도 API 키도 쓰지 않는다.
 *
 * 모델은 최초 실행 때 Hugging Face에서 한 번 내려받아 node_modules 안에 캐시되고,
 * 이후로는 완전히 오프라인으로 동작한다.
 *
 * 주의: 이 모듈은 `npm run precompute` (Node 로컬 실행) 전용이다.
 * onnxruntime 네이티브 바이너리 때문에 Vercel 서버리스 번들에 들어가면 안 되므로
 * app/ 아래 코드에서는 절대 import 하지 말 것.
 */
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

// 모델 선정 근거(data/dishes.json 재료로 벤치마크, "자기 재료 평균순위" 낮을수록 좋음):
//   multilingual-e5-base  q8   4.68 / 44   ← 채택
//   multilingual-e5-small fp32 5.20 / 44
//   LaBSE                 q8  10.72 / 44
//   paraphrase-MiniLM-L12 fp32 20.56 / 44  (사실상 무작위)
const MODEL = process.env.EMBEDDING_MODEL || "Xenova/multilingual-e5-base";
const DTYPE = process.env.EMBEDDING_DTYPE || "q8";

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL, {
      dtype: DTYPE as "q8",
    });
  }
  return extractorPromise;
}

/**
 * e5 계열 모델은 학습 때 "query: " 프리픽스를 붙여 썼기 때문에, 붙이지 않으면
 * 유사도 품질이 눈에 띄게 떨어진다. 프로필 벡터와 사용자 입력 양쪽에 동일하게 적용한다.
 */
function withPrefix(text: string): string {
  return `query: ${text}`;
}

/** 여러 단어를 배치로 임베딩 (사전 계산용) */
export async function embedTexts(
  texts: string[],
  batchSize = 64
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize).map(withPrefix);
    const tensor = await extractor(chunk, { pooling: "mean", normalize: true });
    out.push(...(tensor.tolist() as number[][]));
  }
  return out;
}

/** 단어/문장 하나를 임베딩 벡터로 변환 */
export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}
