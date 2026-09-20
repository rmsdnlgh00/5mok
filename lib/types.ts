export type Dish = {
  id: string;
  name: string;
  aliases: string[];
  ingredients: string[];
};

/**
 * 다른 음식 하나에 대한 유사도 항목. 모든 값은 후보군 안에서 0~1로 정규화돼 있고,
 * 1.0 은 정답 자신에게만 해당한다(= 100점은 정답만 받는다).
 */
export type DishSimilarity = {
  dishId: string;
  name: string;
  /** 이름·재료프로필·재료겹침 세 신호를 섞은 최종 값 */
  similarity: number;
  /** 음식 이름끼리의 유사도 — "찌개 ↔ 찌개"를 잡아낸다 */
  nameScore: number;
  /** 재료 목록이 실제로 겹치는 정도 */
  ingredientScore: number;
  /** 공통으로 들어가는 재료의 개수 (어떤 재료인지는 정답 노출이라 담지 않는다) */
  sharedCount: number;
};

// scripts/precompute.ts 가 만들어내는 파일 하나(음식 1개당)의 구조.
export type DishRanking = {
  dishId: string;
  // 이 음식의 재료 임베딩 평균("맛/재료 프로필" 벡터).
  profile: number[];
  // 사전 전체 단어를 이 음식 프로필과의 유사도 순으로 정렬한 목록
  ranked: { word: string; similarity: number }[];
  // 자기 자신을 뺀 다른 음식들을 유사도 순으로 정렬한 목록
  dishRanked: DishSimilarity[];
};

export type GuessResult =
  | {
      status: "win";
      guess: string;
      dishName: string;
    }
  | {
      status: "scored";
      guess: string;
      score: number; // 0~100 (음수 가능하도록 클라이언트에서 clamp 안 함)
      rank: number | null; // vocabulary 안에서의 순위 (1이 가장 유사). 없으면 null
      isExactIngredient: boolean;
    }
  // 재료가 아니라 "다른 음식 이름"을 입력한 경우. 정답은 아니지만 얼마나 가까운
  // 음식인지(김치찌개 ↔ 된장찌개)를 점수로 알려준다. 재료 점수와는 분포가 달라서
  // 같은 축으로 비교하면 안 되므로 상태를 분리한다.
  | {
      status: "dish-scored";
      guess: string;
      dishName: string;
      score: number;
      rank: number; // 다른 음식들 중 순위
      totalDishes: number;
      nameScore: number; // 이름만 봤을 때의 점수
      ingredientScore: number; // 재료 겹침만 봤을 때의 점수
      sharedCount: number; // 정답과 공통으로 들어가는 재료 개수
    }
  // 사전에도 없고 아는 음식도 아닌 단어. 임베딩 모델은 로컬 precompute 전용이라
  // 서버에 없으므로 실시간으로 벡터를 만들 수 없다.
  // (사전을 넓히려면 data/extra-ingredients.json 에 추가 후 precompute 재실행)
  | {
      status: "unknown";
      guess: string;
    };
