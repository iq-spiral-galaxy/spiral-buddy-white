import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  CONCEPT_LIMITS,
  ConceptStoreError,
  conceptStorePath,
  createConcept,
  deleteConcept,
  extractTermAliases,
  getConcept,
  listConcepts,
  normalizeConceptTerm,
  searchConcepts,
  stripMarkdownSummary,
  upsertConcept,
  updateConcept,
  type ConceptEntry,
} from "../src/concept-store.js";

const originalSubdir = process.env.SPIRAL_VAULT_SUBDIR;
const tempRoots: string[] = [];

afterEach(async () => {
  if (originalSubdir === undefined) delete process.env.SPIRAL_VAULT_SUBDIR;
  else process.env.SPIRAL_VAULT_SUBDIR = originalSubdir;
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function tempVault(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "concept-store-"));
  tempRoots.push(root);
  return root;
}

async function assertStoreError(
  task: Promise<unknown>,
  code: ConceptStoreError["code"],
): Promise<void> {
  await assert.rejects(task, (error: unknown) => {
    assert.ok(error instanceof ConceptStoreError);
    assert.equal(error.code, code);
    return true;
  });
}

describe("concept text normalization", () => {
  test("extracts parenthetical aliases without flattening the display term", () => {
    assert.deepEqual(
      extractTermAliases(
        " TCP (Transmission Control Protocol; 전송 제어 프로토콜) ",
      ),
      {
        term: "TCP",
        aliases: ["Transmission Control Protocol", "전송 제어 프로토콜"],
      },
    );
    assert.deepEqual(extractTermAliases("옵티마이저（Optimizer）"), {
      term: "옵티마이저",
      aliases: ["Optimizer"],
    });
  });

  test("extracts clear acronym aliases but preserves technical parenthetical syntax", () => {
    assert.deepEqual(extractTermAliases("Copy-on-Write (CoW)"), {
      term: "Copy-on-Write",
      aliases: ["CoW"],
    });
    assert.deepEqual(extractTermAliases("COW (Copy-on-Write)"), {
      term: "COW",
      aliases: ["Copy-on-Write"],
    });
    for (const term of ["read(2)", "O(n)", "Promise.all()", "Big O (n log n)"]) {
      assert.deepEqual(extractTermAliases(term), { term, aliases: [] });
    }
  });

  test("normalizes comparison keys while preserving meaningful punctuation", () => {
    assert.equal(normalizeConceptTerm("  ＴＣＰ  "), "tcp");
    assert.equal(normalizeConceptTerm("B–Tree"), "b-tree");
    assert.notEqual(normalizeConceptTerm("C"), normalizeConceptTerm("C++"));
  });

  test("turns Markdown into a bounded readable summary", () => {
    const markdown = `---\ntitle: hidden\n---\n# TCP\n\n- **흐름 제어**와 [혼잡 제어](https://example.com)를 구분한다.\n\n\`cwnd\`를 본다.`;
    assert.equal(
      stripMarkdownSummary(markdown),
      "TCP 흐름 제어와 혼잡 제어를 구분한다. cwnd를 본다.",
    );
    assert.equal(
      stripMarkdownSummary("`handler_read_*`와 snake_case를 보존한다."),
      "handler_read_*와 snake_case를 보존한다.",
    );
    assert.equal(stripMarkdownSummary("abcdefghij", 6), "abcde…");
  });
});

describe("concept store persistence and CRUD", () => {
  test("stores one atomic JSON file under the workspace-specific vault subdir", async () => {
    process.env.SPIRAL_VAULT_SUBDIR = "notes/spiral-green";
    const vault = await tempVault();
    const created = await createConcept(vault, {
      term: "TCP (Transmission Control Protocol)",
      content: "# TCP\n\n신뢰성 있는 바이트 스트림이다.",
      depth: 1,
      roadmapId: "network-deep-dive",
      chapterId: "03-tcp",
      chapterTitle: "TCP internals",
      userQuestion: "왜 패킷이 아니라 스트림일까?",
    });

    const file = conceptStorePath(vault);
    assert.equal(
      file,
      path.join(vault, "notes", "spiral-green", ".concepts.json"),
    );
    const stored = JSON.parse(await fs.readFile(file, "utf-8")) as {
      version: number;
      entries: ConceptEntry[];
    };
    assert.equal(stored.version, 1);
    assert.equal(stored.entries.length, 1);
    assert.equal(stored.entries[0]?.id, created.id);
    assert.equal(stored.entries[0]?.summary, "TCP 신뢰성 있는 바이트 스트림이다.");
    assert.deepEqual(stored.entries[0]?.aliases, ["Transmission Control Protocol"]);
    assert.deepEqual(
      (await fs.readdir(path.dirname(file))).filter((name) => name.endsWith(".tmp")),
      [],
    );
  });

  test("keeps separate vaults isolated", async () => {
    process.env.SPIRAL_VAULT_SUBDIR = "spiral-buddy";
    const firstVault = await tempVault();
    const secondVault = await tempVault();
    await createConcept(firstVault, {
      term: "First",
      content: "first workspace only",
    });
    await createConcept(secondVault, {
      term: "Second",
      content: "second workspace only",
    });
    assert.deepEqual((await listConcepts(firstVault)).map((item) => item.term), ["First"]);
    assert.deepEqual((await listConcepts(secondVault)).map((item) => item.term), ["Second"]);
  });

  test("supports list/get/update/delete and null clears optional metadata", async () => {
    const vault = await tempVault();
    const created = await createConcept(vault, {
      term: "B-Tree (Balanced Tree)",
      aliases: ["다단계 인덱스"],
      summary: "**균형 탐색 트리**",
      content: "# B-Tree\n\n페이지 단위 인덱스.",
      depth: 2,
      userQuestion: "왜 binary tree가 아닐까?",
    });
    assert.equal((await getConcept(vault, created.id))?.summary, "균형 탐색 트리");

    const updated = await updateConcept(vault, created.id, {
      term: "B+Tree (B Plus Tree)",
      aliases: null,
      content: "리프 노드에 레코드 포인터가 있다.",
      summary: null,
      depth: null,
      userQuestion: null,
    });
    assert.equal(updated?.id, created.id);
    assert.equal(updated?.createdAt, created.createdAt);
    assert.ok((updated?.updatedAt ?? "") > created.updatedAt);
    assert.equal(updated?.term, "B+Tree");
    assert.deepEqual(updated?.aliases, ["B Plus Tree"]);
    assert.equal(updated?.summary, "리프 노드에 레코드 포인터가 있다.");
    assert.equal(updated?.depth, undefined);
    assert.equal(updated?.userQuestion, undefined);

    assert.equal(await updateConcept(vault, "missing", { summary: "x" }), null);
    assert.equal(await deleteConcept(vault, "missing"), false);
    assert.equal(await deleteConcept(vault, created.id), true);
    assert.equal(await getConcept(vault, created.id), null);
    assert.deepEqual(await listConcepts(vault), []);
  });

  test("a duplicate normalized term updates in place instead of creating a second row", async () => {
    const vault = await tempVault();
    const first = await createConcept(vault, {
      term: "TCP (Transmission Control Protocol)",
      aliases: ["전송 제어 프로토콜"],
      content: "first content",
      userQuestion: "기존 질문",
    });
    const second = await createConcept(vault, {
      term: "  tcp  ",
      aliases: ["reliable byte stream"],
      content: "updated content",
    });
    assert.equal(second.id, first.id);
    assert.equal(second.createdAt, first.createdAt);
    assert.ok(second.updatedAt > first.updatedAt);
    assert.equal(second.content, "updated content");
    assert.equal(second.userQuestion, "기존 질문");
    assert.deepEqual(second.aliases, [
      "Transmission Control Protocol",
      "전송 제어 프로토콜",
      "reliable byte stream",
    ]);
    assert.equal((await listConcepts(vault)).length, 1);
  });

  test("reports whether an upsert created a row or updated its normalized duplicate", async () => {
    const vault = await tempVault();
    const first = await upsertConcept(vault, {
      term: "HTTP (Hypertext Transfer Protocol)",
      content: "first",
    });
    const second = await upsertConcept(vault, {
      term: " http ",
      content: "second",
    });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.concept.id, first.concept.id);
  });

  test("rejects an update that would collide with another normalized term", async () => {
    const vault = await tempVault();
    const first = await createConcept(vault, { term: "TCP", content: "tcp" });
    await createConcept(vault, { term: "UDP", content: "udp" });
    await assertStoreError(
      updateConcept(vault, first.id, { term: " udp " }),
      "duplicate_term",
    );
  });

  test("serializes concurrent writers and leaves parseable JSON without temp files", async () => {
    const vault = await tempVault();
    await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        createConcept(vault, {
          term: `Concept ${index}`,
          content: `Content ${index}`,
        }),
      ),
    );
    assert.equal((await listConcepts(vault)).length, 30);
    const file = conceptStorePath(vault);
    const parsed = JSON.parse(await fs.readFile(file, "utf-8")) as {
      entries: unknown[];
    };
    assert.equal(parsed.entries.length, 30);
    assert.deepEqual(
      (await fs.readdir(path.dirname(file))).filter((name) => name.endsWith(".tmp")),
      [],
    );
  });

  test("fails closed on corrupt JSON instead of overwriting it", async () => {
    const vault = await tempVault();
    const file = conceptStorePath(vault);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "{not-json", "utf-8");
    await assertStoreError(listConcepts(vault), "corrupt_store");
    await assertStoreError(
      createConcept(vault, { term: "TCP", content: "content" }),
      "corrupt_store",
    );
    assert.equal(await fs.readFile(file, "utf-8"), "{not-json");
  });

  test("fails closed on invalid bounds and duplicate persisted identities", async () => {
    const vault = await tempVault();
    const file = conceptStorePath(vault);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const timestamp = "2026-01-01T00:00:00.000Z";
    const valid = (): ConceptEntry => ({
      id: randomUUID(),
      term: "Valid term",
      aliases: [],
      summary: "Valid summary",
      content: "Valid content",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const invalidStores: ConceptEntry[][] = [];

    invalidStores.push([{ ...valid(), id: "not-a-uuid" }]);
    invalidStores.push([
      { ...valid(), summary: "x".repeat(CONCEPT_LIMITS.summaryLength + 1) },
    ]);
    invalidStores.push([
      {
        ...valid(),
        aliases: Array.from(
          { length: CONCEPT_LIMITS.aliases + 1 },
          (_, index) => `alias-${index}`,
        ),
      },
    ]);
    const duplicateId = valid();
    invalidStores.push([duplicateId, { ...valid(), id: duplicateId.id, term: "Other" }]);
    invalidStores.push([valid(), { ...valid(), term: " valid   term " }]);

    for (const entries of invalidStores) {
      await fs.writeFile(file, JSON.stringify({ version: 1, entries }), "utf-8");
      await assertStoreError(listConcepts(vault), "corrupt_store");
    }
  });
});

describe("concept input limits", () => {
  test("rejects oversized text and alias arrays", async () => {
    const vault = await tempVault();
    await assertStoreError(
      createConcept(vault, {
        term: "x".repeat(CONCEPT_LIMITS.termLength + 1),
        content: "content",
      }),
      "limit_exceeded",
    );
    await assertStoreError(
      createConcept(vault, {
        term: "bounded aliases",
        aliases: Array.from(
          { length: CONCEPT_LIMITS.aliases + 1 },
          (_, index) => `alias ${index}`,
        ),
        content: "content",
      }),
      "limit_exceeded",
    );
    await assertStoreError(
      createConcept(vault, {
        term: "bounded content",
        content: "x".repeat(CONCEPT_LIMITS.contentLength + 1),
      }),
      "limit_exceeded",
    );
  });

  test("enforces the per-vault entry count while still allowing duplicate updates", async () => {
    const vault = await tempVault();
    const timestamp = "2026-01-01T00:00:00.000Z";
    const entries: ConceptEntry[] = Array.from(
      { length: CONCEPT_LIMITS.entries },
      (_, index) => ({
        id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
        term: `Seed ${index}`,
        aliases: [],
        summary: `Seed ${index}`,
        content: `Seed ${index}`,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    const file = conceptStorePath(vault);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ version: 1, entries }), "utf-8");

    const updated = await createConcept(vault, {
      term: " seed 0 ",
      content: "updated at capacity",
    });
    assert.equal(updated.id, "00000000-0000-4000-8000-000000000000");
    await assertStoreError(
      createConcept(vault, { term: "one too many", content: "overflow" }),
      "limit_exceeded",
    );
  });

  test("keeps the configured subdir inside the vault", async () => {
    const vault = await tempVault();
    process.env.SPIRAL_VAULT_SUBDIR = "../escape";
    await assertStoreError(listConcepts(vault), "invalid_input");
  });

  test("rejects a vault subdirectory symlink that escapes the vault", async () => {
    const vault = await tempVault();
    const outside = await tempVault();
    process.env.SPIRAL_VAULT_SUBDIR = "linked-concepts";
    await fs.symlink(outside, path.join(vault, "linked-concepts"), "dir");
    await assertStoreError(listConcepts(vault), "invalid_input");
    await assertStoreError(
      createConcept(vault, { term: "must stay inside", content: "secret" }),
      "invalid_input",
    );
    assert.deepEqual(await fs.readdir(outside), []);
  });
});

describe("local hybrid concept search", () => {
  async function searchableVault(): Promise<string> {
    const vault = await tempVault();
    await createConcept(vault, {
      term: "TCP (Transmission Control Protocol)",
      aliases: ["전송 제어 프로토콜"],
      summary: "연결 지향 신뢰성 전송과 흐름 제어",
      content: "Slow start와 congestion window를 이용해 혼잡을 제어한다.",
      userQuestion: "왜 패킷 손실 뒤 전송률을 줄일까?",
      chapterTitle: "Transport layer",
    });
    await createConcept(vault, {
      term: "옵티마이저 (Optimizer)",
      summary: "쿼리 비용을 추정해 실행 계획을 고른다.",
      content: "Cardinality와 통계가 부정확하면 잘못된 plan을 고를 수 있다.",
      chapterTitle: "Query execution",
    });
    await createConcept(vault, {
      term: "Flow Control",
      summary: "TCP receiver가 감당할 수 있는 양을 알린다.",
      content: "receive window를 사용한다.",
    });
    await createConcept(vault, {
      term: "B-Tree",
      summary: "페이지 기반 균형 인덱스",
      content: "fan-out을 높여 디스크 접근을 줄인다.",
    });
    return vault;
  }

  test("boosts exact/prefix term and alias matches above incidental body matches", async () => {
    const vault = await searchableVault();
    const termResults = await searchConcepts(vault, "TCP 연결이 느린 이유");
    assert.equal(termResults[0]?.concept.term, "TCP");
    assert.ok(termResults[0]?.matchedFields.includes("term"));
    assert.ok((termResults[0]?.score ?? 0) > (termResults[1]?.score ?? 0));

    const aliasResults = await searchConcepts(vault, "transmission cont");
    assert.equal(aliasResults[0]?.concept.term, "TCP");
    assert.ok(aliasResults[0]?.matchedFields.includes("aliases"));
  });

  test("uses Korean/Latin ngrams and token overlap for natural-language queries", async () => {
    const vault = await searchableVault();
    const koreanTypo = await searchConcepts(vault, "옵티마이져가 통계를 쓰는 이유");
    assert.equal(koreanTypo[0]?.concept.term, "옵티마이저");
    assert.ok(koreanTypo[0]?.matchedFields.includes("term"));

    const mixed = await searchConcepts(vault, "cardinality 통계 plan");
    assert.equal(mixed[0]?.concept.term, "옵티마이저");
    assert.ok(mixed[0]?.matchedFields.includes("content"));
  });

  test("searches summary/content and omits unrelated zero-score entries", async () => {
    const vault = await searchableVault();
    const contentResults = await searchConcepts(vault, "slow start congestion window");
    assert.equal(contentResults[0]?.concept.term, "TCP");
    assert.ok(contentResults[0]?.matchedFields.includes("content"));

    const noLexicalMatch = await searchConcepts(vault, "양자색역학");
    assert.deepEqual(noLexicalMatch, []);
  });

  test("bounds long-content scoring while sampling its head, middle, and tail", async () => {
    const vault = await tempVault();
    const chars = Array.from({ length: 90_000 }, () => "x");
    const place = (offset: number, marker: string) => {
      chars.splice(offset, marker.length, ...` ${marker} `);
    };
    place(100, "alphaheadtoken");
    place(22_500, "qzvwpjfk");
    place(45_000, "betamidtoken");
    place(89_000, "gammatailtoken");
    await upsertConcept(vault, {
      term: "Large local search fixture",
      summary: "검색 연산량 제한 검증",
      content: chars.join(""),
    });

    assert.equal((await searchConcepts(vault, "alphaheadtoken")).length, 1);
    assert.equal((await searchConcepts(vault, "betamidtoken")).length, 1);
    assert.equal((await searchConcepts(vault, "gammatailtoken")).length, 1);
    assert.deepEqual(await searchConcepts(vault, "qzvwpjfk"), []);
  });

  test("validates local search bounds", async () => {
    const vault = await searchableVault();
    await assertStoreError(
      searchConcepts(vault, "x".repeat(CONCEPT_LIMITS.searchQueryLength + 1)),
      "limit_exceeded",
    );
    await assertStoreError(searchConcepts(vault, "tcp", { limit: 0 }), "invalid_input");
  });
});
