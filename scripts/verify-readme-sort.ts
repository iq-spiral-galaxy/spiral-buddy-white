// README 기반 sub-roadmap 정렬 검증 (dry-run, 변경 없음)
import path from "node:path";
import os from "node:os";
import { discoverRoadmaps } from "../src/roadmap.js";

const ROOT = process.argv[2] ?? path.join(os.homedir(), "iq-lab", "iq-dev-lab");

console.log(`▶ ROOT: ${ROOT}\n`);

const roadmaps = await discoverRoadmaps(ROOT);

// 부모 경로별로 그룹핑해서 sibling 순서 보기
const byParent = new Map<string, typeof roadmaps>();
for (const r of roadmaps) {
  const parent = path.dirname(r.id);
  if (!byParent.has(parent)) byParent.set(parent, []);
  byParent.get(parent)!.push(r);
}

// 부모 path를 알파벳 순으로 (가독성)
const parents = [...byParent.keys()].sort();

// sub-roadmap의 마지막 segment (자기 자신)만 보고 fallback 여부 판단
function isFallback(r: { sortKey?: string }): boolean {
  if (!r.sortKey) return true;
  // 마지막 "/" 이후 segment에 zzz9__ prefix가 있는지
  const segments = r.sortKey.split("/");
  const lastBucket = segments[segments.length - 2]; // 부모 안에서의 정렬 segment
  return lastBucket?.startsWith("zzz9__") ?? true;
}

let fallbackParents = 0;
for (const parent of parents) {
  const sibs = byParent.get(parent)!;
  if (sibs.length < 2) continue; // 형제 없으면 정렬 의미 없음
  const parentHasFallback = sibs.some(isFallback);
  const parentAllFallback = sibs.every(isFallback);
  if (parentAllFallback) fallbackParents++;
  const head = parentAllFallback
    ? `📦 ${parent}/ — ⚠ README 매칭 0%, 알파벳 fallback`
    : parentHasFallback
      ? `📦 ${parent}/ — ⚠ 일부만 README 매칭`
      : `📦 ${parent}/ — ✓ README 순서 적용`;
  console.log(head);
  for (const r of sibs) {
    const flag = isFallback(r) ? " ⚠" : "";
    console.log(`   • ${r.name} (${r.chapterCount} 챕터)${flag}`);
  }
  console.log();
}

console.log(`총 ${roadmaps.length}개 로드맵, ${parents.length}개 부모 그룹.`);
console.log(`README 매칭 0%인 부모 그룹: ${fallbackParents}개`);


console.log(`총 ${roadmaps.length}개 로드맵, ${parents.length}개 부모 그룹.`);
