export type Dish = {
  id: string;
  name: string;
  aliases: string[];
  ingredients: string[];
};

// scripts/precompute.ts 가 만들어내는 파일 하나(음식 1개당)의 구조.
// vocabulary 전체 단어를 이 음식의 "프로필 벡터"와의 유사도 기준으로
// 내림차순 정렬해서 저장한다. (꼬맨틀의 "유사 단어 1000개 순위"와 동일한 원리)
export type DishRanking = {
  dishId: string;
  // 이 음식의 재료 임베딩 평균("맛/재료 프로필" 벡터). 사전에 없는 새 단어가
  // 들어왔을 때 이 벡터와 직접 코사인 유사도를 계산하는 데 쓰인다.
  profile: number[];
  // 이 음식 프로필과 사전 전체 단어의 유사도를 정렬한 목록
  ranked: { word: string; similarity: number }[];
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
    };
