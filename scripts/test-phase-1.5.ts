// 통합 테스트: discoverRoadmaps + loadRoadmapChapters + 옛 노트 호환 매칭
import {
  discoverRoadmaps,
  loadRoadmapChapters,
  findRoadmap,
} from "../src/roadmap.js";
import {
  noteBelongsToRoadmap,
  noteMatchesChapter,
  type SpiralNote,
} from "../src/vault.js";
import { validateAndPatchSections } from "../src/note-writer.js";

const ROOT = "/tmp/spiral-fixture";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exit(1);
  }
  console.log("✓", msg);
}

// 1. discoverRoadmaps
const roadmaps = await discoverRoadmaps(ROOT);
console.log("\n[1] discoverRoadmaps");
console.log(JSON.stringify(roadmaps.map((r) => ({ id: r.id, name: r.name, n: r.chapterCount })), null, 2));

assert(roadmaps.length === 3, `로드맵 3개 발견 (실제: ${roadmaps.length})`);

const ids = roadmaps.map((r) => r.id).sort();
assert(ids.includes("redis-deep-dive"), "redis-deep-dive 포함");
assert(
  ids.includes("spring ecosystem/spring-core-deep-dive/ioc-container"),
  "ioc-container (띄어쓰기 포함 경로) 포함",
);
assert(
  ids.includes("spring ecosystem/spring-core-deep-dive/transaction-mvcc"),
  "transaction-mvcc 포함",
);
assert(
  !ids.some((id) => id.includes("empty-dir")),
  "empty-dir 제외",
);
assert(
  !ids.some((id) => id.includes("single-md-dir")),
  "single-md-dir 제외 (README 외 .md 1개라 미달)",
);

// 2. loadRoadmapChapters
const txMvcc = roadmaps.find(
  (r) => r.name === "transaction-mvcc",
)!;
const chapters = await loadRoadmapChapters(txMvcc);
console.log("\n[2] loadRoadmapChapters(transaction-mvcc)");
console.log(chapters.map((c) => `${c.order + 1}. ${c.id} - ${c.title}`).join("\n"));

assert(chapters.length === 3, "챕터 3개 (acid, isolation, locking)");
assert(chapters[0]?.id === "01-acid.md", "첫 챕터 id가 short (roadmap-internal)");
assert(
  chapters[0]?.roadmapId === txMvcc.id,
  "Chapter.roadmapId가 full root-relative path",
);
assert(chapters[0]?.roadmapName === "transaction-mvcc", "Chapter.roadmapName이 basename");

// 3. findRoadmap (정확 일치 + name fallback)
const exact = await findRoadmap(ROOT, "redis-deep-dive");
assert(exact?.name === "redis-deep-dive", "findRoadmap 정확 매칭");

const fallback = await findRoadmap(ROOT, "transaction-mvcc"); // name fallback
assert(
  fallback?.id === "spring ecosystem/spring-core-deep-dive/transaction-mvcc",
  "findRoadmap basename fallback (transaction-mvcc → full path)",
);

const notFound = await findRoadmap(ROOT, "nonexistent");
assert(notFound === null, "findRoadmap not found → null");

// 4. 옛 노트 호환 매칭 (noteMatchesChapter)
const oldStyleNote: SpiralNote = {
  filePath: "/fake/2026-05-10-acid-d1.md",
  relativePath: "2026-05-10-acid-d1.md",
  title: "ACID",
  topic: "ACID",
  chapterId: "transaction-mvcc/01-acid.md", // 옛 스키마: roadmap basename + chapter
  roadmapId: null, // 옛 노트는 roadmap_id가 없음
  roadmapName: "transaction-mvcc",
  date: "2026-05-10",
  depth: 1,
  tags: [],
  summary: "",
  body: "",
};

assert(
  noteMatchesChapter(oldStyleNote, {
    roadmapId: txMvcc.id,
    roadmapName: "transaction-mvcc",
    chapterId: "01-acid.md",
  }),
  "옛 스키마 노트가 새 챕터와 매칭 (suffix 매칭)",
);

assert(
  noteBelongsToRoadmap(oldStyleNote, {
    roadmapId: txMvcc.id,
    roadmapName: "transaction-mvcc",
  }),
  "옛 스키마 노트가 로드맵 소속 인식 (name fallback)",
);

// 새 스키마 노트
const newStyleNote: SpiralNote = {
  ...oldStyleNote,
  chapterId: "02-isolation.md",
  roadmapId: txMvcc.id,
};
assert(
  noteMatchesChapter(newStyleNote, {
    roadmapId: txMvcc.id,
    roadmapName: "transaction-mvcc",
    chapterId: "02-isolation.md",
  }),
  "새 스키마 노트 정확 매칭",
);

assert(
  !noteMatchesChapter(newStyleNote, {
    roadmapId: "wrong/path",
    roadmapName: "transaction-mvcc",
    chapterId: "02-isolation.md",
  }),
  "새 스키마 노트는 roadmap_id 불일치 시 매칭 안 됨",
);

// 5. 8섹션 검증/자동 보충
const incompleteBody = `## 한 줄 요약
한 줄.

## 핵심 개념
- 개념1`;

const { missing, patchedBody } = validateAndPatchSections(incompleteBody);
console.log("\n[5] validateAndPatchSections");
console.log("missing:", missing);

assert(missing.length === 5, `5개 섹션 누락 감지 (실제: ${missing.length})`);
assert(
  patchedBody.includes("## 직관 / 비유"),
  "누락 섹션이 patchedBody에 보충됨",
);
assert(
  patchedBody.includes("_이번 세션에서 다루지 않음._"),
  "placeholder 문구 들어감",
);

const completeBody = [
  "## 한 줄 요약",
  "x",
  "## 핵심 개념",
  "x",
  "## 직관 / 비유",
  "x",
  "## 짚고 넘어간 예제",
  "x",
  "## 헷갈렸던 / 확인이 필요한 지점",
  "x",
  "## 이전 학습과의 연결",
  "x",
  "## 다음에 볼 것",
  "x",
].join("\n");
const complete = validateAndPatchSections(completeBody);
assert(complete.missing.length === 0, "완전한 body는 missing 0");
assert(complete.patchedBody === completeBody, "완전한 body는 patchedBody 동일");

console.log("\n✅ 모든 테스트 통과");
