/**
 * 실행: npm run validate  (npm run precompute 앞에서 자동 실행됨)
 *
 * 재료 이름은 문자열로 정확히 매칭되기 때문에, 표기가 조금만 어긋나도
 * 사전이 쪼개지면서 유사도 점수가 "조용히" 나빠진다. 눈에 띄지 않는 종류의
 * 고장이라 데이터를 고칠 때마다 기계적으로 확인한다.
 */
import fs from "node:fs";
import path from "node:path";
import dishesData from "../data/dishes.json";
import extraIngredients from "../data/extra-ingredients.json";
import type { Dish } from "../lib/types";
import { normalizeWord } from "../lib/similarity";

const ROOT = path.join(__dirname, "..");
const dishes = dishesData as Dish[];
const extras = extraIngredients as string[];

const errors: string[] = [];
const warnings: string[] = [];
const notes: string[] = [];

// ── 음식 자체 검사 ────────────────────────────────────────────
const seenIds = new Map<string, string>();
const seenNames = new Map<string, string>();

for (const dish of dishes) {
  const where = `${dish.name || "(이름 없음)"}`;

  if (!dish.id) errors.push(`${where}: id가 비어 있습니다.`);
  else if (!/^[a-z0-9-]+$/.test(dish.id))
    errors.push(`${where}: id "${dish.id}" 는 파일 이름이 되므로 영문 소문자·숫자·하이픈만 쓸 수 있습니다.`);
  else if (seenIds.has(dish.id))
    errors.push(`id 중복: "${dish.id}" (${seenIds.get(dish.id)} ↔ ${where})`);
  else seenIds.set(dish.id, where);

  if (!dish.name) errors.push(`${dish.id}: name이 비어 있습니다.`);

  // 이름과 별칭이 다른 음식과 겹치면 정답 판정이 먼저 걸린 쪽으로 쏠린다
  for (const label of [dish.name, ...(dish.aliases ?? [])]) {
    if (!label) continue;
    const key = normalizeWord(label);
    if (seenNames.has(key) && seenNames.get(key) !== where)
      errors.push(`음식 이름/별칭 충돌: "${label}" (${seenNames.get(key)} ↔ ${where})`);
    else seenNames.set(key, where);
  }

  if (!dish.ingredients?.length) {
    errors.push(`${where}: 재료가 비어 있습니다. precompute가 이 음식을 건너뜁니다.`);
  } else {
    const dup = dish.ingredients.filter((x, i) => dish.ingredients.indexOf(x) !== i);
    if (dup.length) warnings.push(`${where}: 재료 중복 — ${[...new Set(dup)].join(", ")}`);
    if (dish.ingredients.length < 3)
      warnings.push(`${where}: 재료가 ${dish.ingredients.length}개뿐이라 프로필 벡터가 거칠어집니다.`);
  }
}

// ── 사전 검사 ─────────────────────────────────────────────────
const dishVocab = new Set(dishes.flatMap((d) => d.ingredients));
const vocab = Array.from(new Set([...dishVocab, ...extras]));

// 정규화하면 같아지는 단어는 사전에서 하나로 합쳐져 한쪽이 사라진다
const byNormalized = new Map<string, string[]>();
for (const word of vocab) {
  const key = normalizeWord(word);
  byNormalized.set(key, [...(byNormalized.get(key) ?? []), word]);
}
for (const [key, words] of byNormalized) {
  if (words.length > 1)
    errors.push(`정규화 후 같은 단어가 됩니다: ${words.join(" / ")} → "${key}"`);
}

// 음식 이름과 같은 재료: API가 음식으로 먼저 판정하므로 재료 점수를 받을 수 없다
for (const dish of dishes) {
  if (vocab.includes(dish.name))
    notes.push(`"${dish.name}" 은 음식 이름이자 재료입니다. 입력하면 음식으로 판정됩니다.`);
}

// 한 음식에서만 쓰이고 추가 사전에도 없는 재료 = 이번에 새로 쓴 표기일 가능성이 높다.
// 그런 단어가 기존 단어를 포함하거나 포함되면 오타이거나 표기 흔들림일 수 있다.
const usageCount = new Map<string, number>();
for (const dish of dishes)
  for (const ing of dish.ingredients)
    usageCount.set(ing, (usageCount.get(ing) ?? 0) + 1);

const extrasSet = new Set(extras);
const freshWords = vocab.filter((w) => usageCount.get(w) === 1 && !extrasSet.has(w));
for (const fresh of freshWords) {
  const near = vocab.filter(
    (other) => other !== fresh && (other.includes(fresh) || fresh.includes(other))
  );
  if (near.length)
    warnings.push(`새 재료 "${fresh}" 가 기존 표기와 겹칩니다: ${near.join(", ")} — 같은 재료라면 하나로 통일하세요.`);
}
if (freshWords.length)
  notes.push(`이번에 처음 등장한 재료 ${freshWords.length}개: ${freshWords.join(", ")}`);

// ── 고아 랭킹 파일 ────────────────────────────────────────────
const rankingsDir = path.join(ROOT, "data", "rankings");
if (fs.existsSync(rankingsDir)) {
  const orphans = fs
    .readdirSync(rankingsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((id) => !seenIds.has(id));
  if (orphans.length)
    warnings.push(
      `쓰이지 않는 랭킹 파일이 남아 있습니다: ${orphans.join(", ")} — data/rankings/ 에서 지우세요.`
    );
}

// ── 출력 ──────────────────────────────────────────────────────
console.log(`[validate] 음식 ${dishes.length}개 / 사전 ${vocab.length}단어`);
for (const n of notes) console.log(`[validate] · ${n}`);
for (const w of warnings) console.warn(`[validate] ⚠ ${w}`);
for (const e of errors) console.error(`[validate] ✗ ${e}`);

if (errors.length) {
  console.error(`[validate] 오류 ${errors.length}건 — 고친 뒤 다시 실행하세요.`);
  process.exit(1);
}
console.log(`[validate] 통과 (경고 ${warnings.length}건)`);
