import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Config } from "../src/config.js";
import type { ClaudeClient } from "../src/claude.js";
import { upsertConcept } from "../src/concept-store.js";
import { createApi } from "../src/routes.js";

let tmpRoot: string;
let vaultPath: string;
let roadmapRoot: string;

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    apiKey: "test-key",
    model: "test-model",
    maxTokens: 4096,
    llmProvider: "anthropic",
    llmBaseUrl: null,
    roadmapRoot,
    pinnedRoadmapPath: null,
    curatedOrg: null,
    githubToken: null,
    vaultPath,
    vaultName: "TestVault",
    obsidianVaultRoot: null,
    ...overrides,
  };
}

type CompletionParams = {
  stream?: boolean;
  system?: string;
  messages?: Array<{ role: string; content: string }>;
  max_tokens?: number;
};

function fakeClient(
  responder: (params: CompletionParams) => string | Promise<string>,
  calls: CompletionParams[] = [],
): ClaudeClient {
  return {
    provider: "anthropic",
    baseUrl: null,
    config: baseConfig(),
    raw: {
      messages: {
        create: async (params: CompletionParams) => {
          calls.push(params);
          const text = await responder(params);
          return {
            content: [{ type: "text", text }],
            usage: { input_tokens: 5, output_tokens: 7 },
            stop_reason: "end_turn",
          };
        },
      },
    } as unknown as ClaudeClient["raw"],
  };
}

async function jsonRequest(
  app: ReturnType<typeof createApi>,
  method: string,
  url: string,
  body?: unknown,
): Promise<Response> {
  return app.request(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "spiral-concept-routes-"));
  vaultPath = path.join(tmpRoot, "vault");
  roadmapRoot = path.join(tmpRoot, "roadmaps");
  await Promise.all([
    fs.mkdir(vaultPath, { recursive: true }),
    fs.mkdir(roadmapRoot, { recursive: true }),
  ]);
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("concept CRUD routes", () => {
  test("create/upsert/list/patch/delete reports the real write outcome", async () => {
    const app = createApi(baseConfig(), {
      client: fakeClient(() => '{"ids":[]}'),
    });

    const createdRes = await jsonRequest(app, "POST", "/concepts", {
      term: "Copy-on-Write (COW)",
      aliases: ["쓰기 시 복사"],
      content: "원본을 공유하다가 수정할 때 복제한다.",
      userQuestion: "언제 실제 복사가 일어날까?",
      summary: "지연 복제 방식",
      depth: 1,
    });
    assert.equal(createdRes.status, 201);
    const createdBody = await createdRes.json();
    assert.equal(createdBody.created, true);
    assert.equal(createdBody.concept.term, "Copy-on-Write");
    assert.deepEqual(createdBody.concept.aliases, ["COW", "쓰기 시 복사"]);
    const id = createdBody.concept.id as string;

    const upsertRes = await jsonRequest(app, "POST", "/concepts", {
      term: "copy-on-write",
      aliases: ["copy on write"],
      content: "갱신된 설명",
    });
    assert.equal(upsertRes.status, 200);
    const upsertBody = await upsertRes.json();
    assert.equal(upsertBody.created, false);
    assert.equal(upsertBody.concept.id, id);

    const listRes = await app.request("/concepts");
    assert.equal(listRes.status, 200);
    const listed = await listRes.json();
    assert.equal(listed.mode, "local");
    assert.equal(listed.total, 1);
    assert.equal(listed.concepts[0].id, id);
    assert.equal("content" in listed.concepts[0], false);
    assert.equal("userQuestion" in listed.concepts[0], false);

    const countRes = await app.request("/concepts/count");
    assert.equal(countRes.status, 200);
    assert.deepEqual(await countRes.json(), { total: 1 });

    const detailRes = await app.request(`/concepts/${id}`);
    assert.equal(detailRes.status, 200);
    const detail = await detailRes.json();
    assert.equal(detail.concept.content, "갱신된 설명");
    assert.equal(detail.concept.userQuestion, "언제 실제 복사가 일어날까?");

    const patchRes = await jsonRequest(app, "PATCH", `/concepts/${id}`, {
      summary: "수정된 요약",
      aliases: ["COW"],
    });
    assert.equal(patchRes.status, 200);
    assert.equal((await patchRes.json()).concept.summary, "수정된 요약");

    const deleteRes = await jsonRequest(app, "DELETE", `/concepts/${id}`);
    assert.equal(deleteRes.status, 200);
    assert.deepEqual(await deleteRes.json(), { deleted: true });
    assert.equal((await (await app.request("/concepts")).json()).total, 0);
  });

  test("vault, body, query length, and id validation return stable errors", async () => {
    const client = fakeClient(() => '{"ids":[]}');
    const noVault = createApi(baseConfig({ vaultPath: null }), { client });
    assert.equal((await noVault.request("/concepts")).status, 400);
    assert.equal(
      (await jsonRequest(noVault, "POST", "/concepts", { term: "x", content: "y" }))
        .status,
      400,
    );

    const app = createApi(baseConfig(), { client });
    assert.equal((await jsonRequest(app, "POST", "/concepts", {})).status, 400);
    assert.equal(
      (
        await jsonRequest(app, "POST", "/concepts/search", {
          query: "가".repeat(601),
        })
      ).status,
      413,
    );
    assert.equal(
      (await jsonRequest(app, "PATCH", "/concepts/not-a-uuid", { term: "x" }))
        .status,
      400,
    );
    assert.equal(
      (await jsonRequest(app, "DELETE", "/concepts/not-a-uuid")).status,
      400,
    );
    assert.equal((await app.request("/concepts/not-a-uuid")).status, 400);
  });
});

describe("POST /concepts/search", () => {
  test("natural-language search stays local, compact, and never invokes the model", async () => {
    const calls: CompletionParams[] = [];
    const app = createApi(baseConfig(), {
      client: fakeClient(() => {
        throw new Error("concept search must remain local");
      }, calls),
    });
    const concept = (
      await upsertConcept(vaultPath, {
        term: "OverlayFS",
        aliases: ["overlay file system"],
        summary: "여러 레이어를 하나의 파일 시스템처럼 합성한다.",
        content: "SENSITIVE_LOCAL_BODY",
        userQuestion: "SENSITIVE_LOCAL_QUESTION",
      })
    ).concept;

    const res = await jsonRequest(app, "POST", "/concepts/search", {
      query: "여러 레이어를 하나의 파일 시스템처럼 합성하는 방식",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.mode, "local");
    assert.equal(body.concepts[0].id, concept.id);
    assert.equal("content" in body.concepts[0], false);
    assert.equal("userQuestion" in body.concepts[0], false);
    assert.equal(calls.length, 0);
  });

  test("exact aliases and result limits use the local hybrid ranking", async () => {
    const calls: CompletionParams[] = [];
    const app = createApi(baseConfig(), {
      client: fakeClient(() => {
        throw new Error("concept search must remain local");
      }, calls),
    });
    await upsertConcept(vaultPath, {
      term: "Copy-on-Write",
      aliases: ["COW", "쓰기 시 복사"],
      summary: "지연 복제",
      content: "원본을 공유하다가 쓰는 시점에 복제한다.",
    });
    await upsertConcept(vaultPath, {
      term: "COW allocator",
      aliases: [],
      summary: "보조 검색 결과",
      content: "메모리 할당 방식",
    });

    const res = await jsonRequest(app, "POST", "/concepts/search", {
      query: "COW",
      limit: 1,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.mode, "local");
    assert.equal(body.total, 2);
    assert.equal(body.concepts.length, 1);
    assert.equal(body.concepts[0].term, "Copy-on-Write");
    assert.equal(calls.length, 0);
  });

  test("unknown legacy fields cannot opt concept search into external processing", async () => {
    const calls: CompletionParams[] = [];
    const app = createApi(baseConfig(), {
      client: fakeClient(() => {
        throw new Error("concept search must remain local");
      }, calls),
    });
    const concept = (
      await upsertConcept(vaultPath, {
        term: "TCP congestion control",
        aliases: ["혼잡 제어"],
        summary: "네트워크 혼잡에 맞춰 전송량을 조절한다.",
        content: "로컬에만 남아야 하는 긴 본문",
      })
    ).concept;

    const res = await jsonRequest(app, "POST", "/concepts/search", {
      query: "네트워크 혼잡에 맞춰 전송량 조절",
      model: "external-model",
      externalRerank: true,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.mode, "local");
    assert.equal(body.concepts[0].id, concept.id);
    assert.equal(calls.length, 0);
  });
});
