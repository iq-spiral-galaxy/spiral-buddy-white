// Phase 2 통합 테스트 — curated 모듈 (네트워크/git 없이 동작하는 부분만)
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  discoverCuratedRoadmaps,
  parseCuratedId,
  listInstalledRepoNames,
} from "../src/curated.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(PKG_ROOT, ".cache", "curated");
const TEST_ORG = "test-org";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exit(1);
  }
  console.log("✓", msg);
}

// ─── 1. parseCuratedId
console.log("\n[1] parseCuratedId");
const p1 = parseCuratedId("curated:iq-dev-lab/redis-deep-dive");
assert(
  p1?.org === "iq-dev-lab" && p1.repoName === "redis-deep-dive" && p1.subPath === "",
  "단순 형식 파싱",
);

const p2 = parseCuratedId(
  "curated:iq-dev-lab/spring-deep-dive/ioc-container",
);
assert(
  p2?.org === "iq-dev-lab" &&
    p2.repoName === "spring-deep-dive" &&
    p2.subPath === "ioc-container",
  "sub-path 포함 파싱",
);

const p3 = parseCuratedId("local:redis");
assert(p3 === null, "curated: prefix 없으면 null");

const p4 = parseCuratedId("curated:");
assert(p4 === null, "잘못된 형식이면 null");

// ─── 2. 가짜 캐시 디렉토리 생성 → discoverCuratedRoadmaps
console.log("\n[2] discoverCuratedRoadmaps (가짜 캐시)");

const testOrgDir = path.join(CACHE_DIR, TEST_ORG);
await fs.rm(testOrgDir, { recursive: true, force: true });
await fs.mkdir(testOrgDir, { recursive: true });

// repo 1: 단순 (.md 파일들 직접)
const repo1Dir = path.join(testOrgDir, "redis-deep-dive");
await fs.mkdir(repo1Dir, { recursive: true });
await fs.writeFile(path.join(repo1Dir, "README.md"), "# Redis");
await fs.writeFile(path.join(repo1Dir, "01-intro.md"), "# Intro");
await fs.writeFile(path.join(repo1Dir, "02-data.md"), "# Data");
await fs.writeFile(path.join(repo1Dir, "03-memory.md"), "# Memory");

// repo 2: sub-roadmap 있는 경우
const repo2Dir = path.join(testOrgDir, "spring-deep-dive");
await fs.mkdir(repo2Dir, { recursive: true });
await fs.writeFile(path.join(repo2Dir, "README.md"), "# Spring");
const subDir1 = path.join(repo2Dir, "ioc-container");
await fs.mkdir(subDir1, { recursive: true });
await fs.writeFile(path.join(subDir1, "01-bean.md"), "# Bean");
await fs.writeFile(path.join(subDir1, "02-context.md"), "# Context");
const subDir2 = path.join(repo2Dir, "transaction-mvcc");
await fs.mkdir(subDir2, { recursive: true });
await fs.writeFile(path.join(subDir2, "01-acid.md"), "# ACID");
await fs.writeFile(path.join(subDir2, "02-isolation.md"), "# Isolation");

// repo 3: 유효하지 않음 (.md 1개만)
const repo3Dir = path.join(testOrgDir, "not-a-roadmap");
await fs.mkdir(repo3Dir, { recursive: true });
await fs.writeFile(path.join(repo3Dir, "README.md"), "# x");
await fs.writeFile(path.join(repo3Dir, "single.md"), "# y");

// repo 4: 코드 레포 (.md 없음)
const repo4Dir = path.join(testOrgDir, "spiral-buddy");
await fs.mkdir(repo4Dir, { recursive: true });
await fs.writeFile(path.join(repo4Dir, "README.md"), "# code");
await fs.writeFile(path.join(repo4Dir, "package.json"), "{}");

const roadmaps = await discoverCuratedRoadmaps(TEST_ORG);
console.log(
  JSON.stringify(
    roadmaps.map((r) => ({ id: r.id, n: r.chapterCount })),
    null,
    2,
  ),
);

assert(roadmaps.length === 3, `3개 발견 (실제: ${roadmaps.length})`);
const ids = roadmaps.map((r) => r.id).sort();
assert(
  ids.includes(`curated:${TEST_ORG}/redis-deep-dive`),
  "단순 레포: curated:test-org/redis-deep-dive",
);
assert(
  ids.includes(`curated:${TEST_ORG}/spring-deep-dive/ioc-container`),
  "sub-roadmap: curated:test-org/spring-deep-dive/ioc-container",
);
assert(
  ids.includes(`curated:${TEST_ORG}/spring-deep-dive/transaction-mvcc`),
  "sub-roadmap: curated:test-org/spring-deep-dive/transaction-mvcc",
);
assert(
  !ids.some((id) => id.includes("not-a-roadmap")),
  ".md 1개짜리 레포 제외",
);
assert(
  !ids.some((id) => id.includes("spiral-buddy")),
  "코드 레포 (.md 없음) 제외",
);

// ─── 3. listInstalledRepoNames
console.log("\n[3] listInstalledRepoNames");
const installed = await listInstalledRepoNames(TEST_ORG);
console.log(installed);
assert(installed.length === 4, "디스크에 있는 4개 디렉토리 인식");
assert(installed.includes("redis-deep-dive"), "redis-deep-dive 포함");
assert(installed.includes("spring-deep-dive"), "spring-deep-dive 포함");

// ─── 4. parseCuratedId 라운드트립
console.log("\n[4] roadmap id → parseCuratedId 라운드트립");
for (const r of roadmaps) {
  const parsed = parseCuratedId(r.id);
  assert(parsed !== null, `${r.id} 파싱 가능`);
  assert(parsed?.org === TEST_ORG, `org 정확: ${parsed?.org}`);
  if (r.id === `curated:${TEST_ORG}/redis-deep-dive`) {
    assert(parsed?.repoName === "redis-deep-dive" && parsed?.subPath === "", "단순 형식 round-trip");
  }
  if (r.id === `curated:${TEST_ORG}/spring-deep-dive/ioc-container`) {
    assert(
      parsed?.repoName === "spring-deep-dive" &&
        parsed?.subPath === "ioc-container",
      "sub-path round-trip",
    );
  }
}

// 정리
await fs.rm(testOrgDir, { recursive: true, force: true });

console.log("\n✅ Phase 2 모든 테스트 통과");
