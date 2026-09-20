import dishes from "@/data/dishes.json";
import type { Dish } from "./types";

/** 한국 시간(KST) 기준 오늘 날짜를 "YYYY-MM-DD"로 반환 */
export function getKstDateString(date: Date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * 문자열을 32bit 정수 해시로 변환 (간단한 djb2 계열).
 * 같은 문자열은 항상 같은 숫자가 나오므로, 날짜 문자열을 넣으면
 * "오늘은 전 세계 모두에게 같은 정답"이 보장된다.
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash >>> 0);
}

/** 오늘(KST 기준)의 정답 음식을 결정론적으로 고른다. */
export function getTodaysDish(date: Date = new Date()): Dish {
  const dateStr = getKstDateString(date);
  const list = dishes as Dish[];
  const idx = hashString(dateStr) % list.length;
  return list[idx];
}

export function getDishById(id: string): Dish | undefined {
  return (dishes as Dish[]).find((d) => d.id === id);
}

export function getAllDishes(): Dish[] {
  return dishes as Dish[];
}
