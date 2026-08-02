import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Config } from "../src/config.js";
import type { ClaudeClient } from "../src/claude.js";

let tmpRoot: string;
let roadmapRoot: string;
let vaultPath: string;
let createApi: (
  config: Config,
  deps?: { client?: ClaudeClient },
) => { request: (input: string, init?: RequestInit) => Promise<Response> };
let invalidateRoadmapCaches: () => void;
let invalidateNotesCache: () => void;
let writeNewNote: (
  vaultPath: string,
  note: Record<string, unknown>,
) => Promise<string>;
let listSpiralNotes: (
  vaultPath: string,
) => Promise<Array<{ verificationAttemptId?: string | null }>>;

function config(): Config {
  return {
    apiKey: "test",
    model: "claude-sonnet-4-6",
    maxTokens: 4096,
    roadmapRoot,
    pinnedRoadmapPath: null,
    curatedOrg: null,
    githubToken: null,
    vaultPath,
    vaultName: "TestVault",
    obsidianVaultRoot: null,
  };
}

const capturedCalls: Array<Record<string, unknown>> = [];

function fakeClient(
  reasoning: true | false | null | "malformed" | "fail" = true,
): ClaudeClient {
  const raw = {
    messages: {
      create: async (params: Record<string, unknown>) => {
        capturedCalls.push(params);
        if (params.stream === true) {
          return {
            async *[Symbol.asyncIterator]() {
              yield {
                type: "message_start",
                message: { usage: { input_tokens: 1 } },
              };
              yield {
                type: "content_block_delta",
                delta: { type: "text_delta", text: "전이 질문입니다." },
              };
              yield { type: "message_delta", usage: { output_tokens: 1 } };
            },
          };
        }
        if (reasoning === "fail") throw new Error("provider unavailable");
        return {
          content: [
            {
              type: "text",
              text:
                reasoning === "malformed"
                  ? "not-json"
                  : JSON.stringify({
                      grounded: reasoning,
                      feedback:
                        reasoning === true
                          ? "챕터 근거와 연결됩니다."
                          : reasoning === false
                            ? "근거가 충분하지 않습니다."
                            : "현재 자료만으로 판정을 보류합니다.",
                    }),
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      },
    },
  } as unknown as ClaudeClient["raw"];
  return { raw, config: config() };
}

function postJson(
  app: ReturnType<typeof createApi>,
  pathname: string,
  body: unknown,
) {
  return app.request(pathname, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const CHAPTER_WITH_CARDS = `---
verification_cards:
  - title: "숨은 정규화 누락"
    prompt: "이 구현을 그대로 믿어도 되는지 판정하세요."
    artifact:
      kind: "code"
      language: "typescript"
      content: "return name.includes(query)"
    expectedVerdict: "issue"
    sourceExcerpt: "사용자 입력은 비교 전에 정규화해야 한다."
    issueLocation: "includes(query)"
    rationale: "입력을 정규화하지 않았다."
    correction: "query.trim().toLowerCase()로 비교한다."
    canonicalPrinciple: "비교 전에 외부 입력을 정규화한다."
  - title: "정상 정규화"
    prompt: "이 구현을 그대로 믿어도 되는지 판정하세요."
    artifact:
      kind: "code"
      language: "typescript"
      content: "return name.toLowerCase().includes(query.trim().toLowerCase())"
    expectedVerdict: "safe"
    sourceExcerpt: "사용자 입력은 비교 전에 정규화해야 한다."
    issueLocation: ""
    rationale: "비교 전에 양쪽 표현을 정규화했다."
    correction: "현재 구현은 챕터의 조건을 충족한다."
    canonicalPrinciple: "비교 전에 외부 입력을 정규화한다."
  - title: "두 번째 정규화 누락"
    prompt: "이 구현을 그대로 믿어도 되는지 판정하세요."
    artifact:
      kind: "code"
      language: "typescript"
      content: "return email.includes(query)"
    expectedVerdict: "issue"
    sourceExcerpt: "사용자 입력은 비교 전에 정규화해야 한다."
    issueLocation: "includes(query)"
    rationale: "입력을 정규화하지 않았다."
    correction: "query.trim().toLowerCase()로 비교한다."
    canonicalPrinciple: "비교 전에 외부 입력을 정규화한다."
---
# Search Normalization

사용자 입력은 비교 전에 정규화해야 한다.

앞뒤 공백과 대소문자 차이를 같은 검색 의도로 처리한다.
`;

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "spiral-verify-routes-"));
  process.env.SPIRAL_SESSION_DIR = path.join(tmpRoot, "sessions");
  roadmapRoot = path.join(tmpRoot, "roadmaps");
  vaultPath = path.join(tmpRoot, "vault");
  await fs.mkdir(vaultPath, { recursive: true });

  const primary = path.join(roadmapRoot, "verification-roadmap");
  await fs.mkdir(primary, { recursive: true });
  await fs.writeFile(path.join(primary, "01-search.md"), CHAPTER_WITH_CARDS);
  await fs.writeFile(
    path.join(primary, "02-cache.md"),
    "# Cache\n\nCache entries expire according to their configured TTL.\n",
  );

  const other = path.join(roadmapRoot, "other-roadmap");
  await fs.mkdir(other, { recursive: true });
  await fs.writeFile(
    path.join(other, "01-other.md"),
    "# Other\n\nAn unrelated chapter has its own learning history.\n",
  );
  await fs.writeFile(
    path.join(other, "02-other.md"),
    "# Other Two\n\nA second unrelated chapter.\n",
  );

  const routes = await import("../src/routes.js");
  const roadmap = await import("../src/roadmap.js");
  const vault = await import("../src/vault.js");
  createApi = routes.createApi as typeof createApi;
  invalidateRoadmapCaches = roadmap.invalidateRoadmapCaches;
  writeNewNote = vault.writeNewNote as typeof writeNewNote;
  listSpiralNotes = vault.listSpiralNotes as typeof listSpiralNotes;
  invalidateNotesCache = vault.invalidateNotesCache as typeof invalidateNotesCache;
  invalidateRoadmapCaches();
});

after(async () => {
  delete process.env.SPIRAL_SESSION_DIR;
  await new Promise((resolve) => setTimeout(resolve, 25));
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function seedD1(
  topic: string,
  chapterId: string,
  roadmapId = "verification-roadmap",
) {
  return writeNewNote(vaultPath, {
    topic,
    chapterId,
    roadmapId,
    roadmapName: roadmapId,
    repo: null,
    roadmap: roadmapId,
    depth: 1,
    tags: [],
    summary: "completed d1",
    body: "completed and saved",
    relatedNotePaths: [],
  });
}

describe("verification HTTP contract", () => {
  test("batch status, lazy card, submit, depth isolation and d2 gap seeding", async () => {
    const app = createApi(config(), { client: fakeClient() });

    const initial = await app.request(
      "/verification/status?roadmap_id=verification-roadmap",
    );
    assert.equal(initial.status, 200);
    const initialBody = await initial.json();
    assert.equal(initialBody.chapters["01-search.md"].eligible, false);
    assert.equal(initialBody.chapters["02-cache.md"].eligible, false);

    const locked = await postJson(app, "/verification/card", {
      roadmapId: "verification-roadmap",
      chapterId: "01-search.md",
    });
    assert.equal(locked.status, 403);
    assert.equal((await locked.json()).code, "locked");

    const searchNotePath = await seedD1("Search Normalization", "01-search.md");
    const beforeChapters = await (
      await app.request("/chapters?roadmap_id=verification-roadmap")
    ).json();
    assert.equal(beforeChapters.chapters[0].maxDepth, 1);
    assert.equal(beforeChapters.chapters[0].visitCount, 1);

    const batch = await (
      await app.request(
        "/verification/status?roadmap_id=verification-roadmap",
      )
    ).json();
    assert.equal(batch.chapters["01-search.md"].eligible, true);
    assert.equal(batch.chapters["01-search.md"].attemptsCount, 0);

    const cardResponse = await postJson(app, "/verification/card", {
      roadmapId: "verification-roadmap",
      chapterId: "01-search.md",
    });
    assert.equal(cardResponse.status, 200);
    const { card } = await cardResponse.json();
    assert.equal(card.title, "챕터 검증");
    const publicJson = JSON.stringify(card);
    assert.equal(publicJson.includes("expectedVerdict"), false);
    assert.equal(publicJson.includes("issueLocation"), false);
    assert.equal(publicJson.includes("canonicalPrinciple"), false);
    assert.equal(publicJson.includes("숨은 정규화 누락"), false);
    assert.equal(publicJson.includes("이 구현을 그대로 믿어도 되는지"), false);

    const missResponse = await postJson(app, "/verification/attempt", {
      roadmapId: "verification-roadmap",
      chapterId: "01-search.md",
      cardId: card.id,
      verdict: "safe",
      location: "",
      rationale: "문제가 없어 보입니다.",
      correction: "정규화 누락을 교정한다",
      confidence: 92,
    });
    assert.equal(missResponse.status, 200);
    const miss = await missResponse.json();
    assert.equal(miss.result.outcome, "miss");
    assert.equal(miss.result.canStartDeeperSession, true);

    const missDetailsResponse = await app.request(
      `/verification/attempt?roadmap_id=verification-roadmap&chapter_id=01-search.md&attempt_id=${encodeURIComponent(miss.attempt.id)}`,
    );
    assert.equal(missDetailsResponse.status, 200);
    const missDetails = await missDetailsResponse.json();
    assert.equal(missDetails.isLatest, true);
    assert.equal(missDetails.result.canStartDeeperSession, true);

    const missRetry = await (
      await postJson(app, "/verification/attempt", {
        roadmapId: "verification-roadmap",
        chapterId: "01-search.md",
        cardId: card.id,
        verdict: "safe",
        location: "",
        rationale: "문제가   없어 보입니다.",
        correction: "정규화 누락을 교정한다",
        confidence: 92,
      })
    ).json();
    assert.equal(missRetry.attempt.id, miss.attempt.id);
    const changedRetry = await postJson(app, "/verification/attempt", {
      roadmapId: "verification-roadmap",
      chapterId: "01-search.md",
      cardId: card.id,
      verdict: "safe",
      location: "",
      rationale: "다른 답안입니다.",
      correction: "정규화 누락을 교정한다",
      confidence: 92,
    });
    assert.equal(changedRetry.status, 409);
    assert.equal((await changedRetry.json()).code, "already_submitted");

    const blockedCard = await postJson(app, "/verification/card", {
      roadmapId: "verification-roadmap",
      chapterId: "01-search.md",
    });
    assert.equal(blockedCard.status, 409);
    assert.equal((await blockedCard.json()).code, "unresolved_gap");

    const remediationStart = {
      roadmapId: "verification-roadmap",
      chapterId: "01-search.md",
      verificationAttemptId: miss.attempt.id,
    };
    const starts = await Promise.all([
      postJson(app, "/session/start", remediationStart),
      postJson(app, "/session/start", remediationStart),
    ]);
    const start = starts.find((response) => response.status === 200);
    const duplicateStart = starts.find((response) => response.status === 409);
    assert.ok(start, "one concurrent remediation start must win");
    assert.ok(duplicateStart, "the duplicate remediation start must be rejected");
    assert.equal(
      (await duplicateStart.json()).code,
      "remediation_in_progress",
    );
    assert.equal(start.status, 200);
    assert.equal(start.headers.get("X-Depth"), "2");
    assert.equal(
      start.headers.get("X-Verification-Attempt-Id"),
      miss.attempt.id,
    );
    assert.match(await start.text(), /전이 질문입니다/);
    const startCall = capturedCalls.at(-1);
    assert.match(JSON.stringify(startCall), /최근 검증에서 드러난 빈틈/);
    assert.match(JSON.stringify(startCall), /92%/);
    assert.match(JSON.stringify(startCall), /문제가 없어 보입니다/);
    const sessionId = start.headers.get("X-Session-Id")!;
    const state = await (await app.request(`/session/${sessionId}`)).json();
    assert.equal(state.verificationAttemptId, miss.attempt.id);

    // Verification JSON must not alter note-based progress/activity/history.
    const afterChapters = await (
      await app.request("/chapters?roadmap_id=verification-roadmap")
    ).json();
    assert.equal(afterChapters.chapters[0].maxDepth, 1);
    assert.equal(afterChapters.chapters[0].visitCount, 1);
    const activity = await (await app.request("/activity")).json();
    assert.equal(activity.total, 1);
    const history = await (
      await app.request("/history?roadmap_id=verification-roadmap")
    ).json();
    assert.equal(history.length, 1);

    // An attempt id cannot cross a chapter boundary. Complete d1 on chapter 2
    // first so the request reaches the identity check rather than the d1 gate.
    await seedD1("Cache", "02-cache.md");
    const crossChapter = await postJson(app, "/session/start", {
      roadmapId: "verification-roadmap",
      chapterId: "02-cache.md",
      verificationAttemptId: miss.attempt.id,
    });
    assert.equal(crossChapter.status, 404);
    assert.equal((await crossChapter.json()).code, "attempt_not_found");

    const endResponse = await postJson(app, `/session/${sessionId}/end`, {});
    assert.equal(endResponse.status, 200);
    const endText = await endResponse.text();
    const doneMatch = endText.match(/event: done\ndata: ([^\n]+)/);
    assert.ok(doneMatch);
    const resolution = JSON.parse(doneMatch[1]!) as { path: string };
    const resolutionRaw = await fs.readFile(resolution.path, "utf-8");
    assert.match(
      resolutionRaw,
      new RegExp(`verification_attempt: "${miss.attempt.id}"`),
    );
    const remediationNotes = (await listSpiralNotes(vaultPath)).filter(
      (note) => note.verificationAttemptId === miss.attempt.id,
    );
    assert.equal(
      remediationNotes.length,
      1,
      "a concurrent start must produce at most one provenance note",
    );
    const resolvedStatus = await (
      await app.request(
        "/verification/status?roadmap_id=verification-roadmap&chapter_id=01-search.md",
      )
    ).json();
    assert.equal(resolvedStatus.status.latestAttempt.hasGap, false);
    assert.equal(resolvedStatus.status.nextCardAvailable, true);
    const resolvedDetails = await (
      await app.request(
        `/verification/attempt?roadmap_id=verification-roadmap&chapter_id=01-search.md&attempt_id=${encodeURIComponent(miss.attempt.id)}`,
      )
    ).json();
    assert.equal(resolvedDetails.result.canStartDeeperSession, false);
    const resolvedStart = await postJson(app, "/session/start", {
      roadmapId: "verification-roadmap",
      chapterId: "01-search.md",
      verificationAttemptId: miss.attempt.id,
    });
    assert.equal(resolvedStart.status, 409);
    assert.equal((await resolvedStart.json()).code, "attempt_has_no_gap");

    // The second curated card is clean. Once submitted, the older miss is no
    // longer the latest attempt and a correct rejection has no gap to seed.
    const cleanCard = await (
      await postJson(app, "/verification/card", {
        roadmapId: "verification-roadmap",
        chapterId: "01-search.md",
      })
    ).json();
    assert.equal(cleanCard.card.title, "챕터 검증");
    assert.match(cleanCard.card.artifact.content, /toLowerCase/);
    const correct = await (
      await postJson(app, "/verification/attempt", {
        roadmapId: "verification-roadmap",
        chapterId: "01-search.md",
        cardId: cleanCard.card.id,
        verdict: "safe",
        location: "",
        rationale: "정규화 조건을 충족합니다.",
        correction: "현재 구현을 유지한다",
        confidence: 88,
      })
    ).json();
    assert.equal(correct.result.outcome, "correct_rejection");
    assert.equal(correct.result.reasoningGrounded, true);

    const oldDetails = await (
      await app.request(
        `/verification/attempt?roadmap_id=verification-roadmap&chapter_id=01-search.md&attempt_id=${encodeURIComponent(miss.attempt.id)}`,
      )
    ).json();
    assert.equal(oldDetails.isLatest, false);
    assert.equal(oldDetails.result.canStartDeeperSession, false);
    const correctDetails = await (
      await app.request(
        `/verification/attempt?roadmap_id=verification-roadmap&chapter_id=01-search.md&attempt_id=${encodeURIComponent(correct.attempt.id)}`,
      )
    ).json();
    assert.equal(correctDetails.isLatest, true);
    assert.equal(correctDetails.result.canStartDeeperSession, false);

    const staleStart = await postJson(app, "/session/start", {
      roadmapId: "verification-roadmap",
      chapterId: "01-search.md",
      verificationAttemptId: miss.attempt.id,
    });
    assert.equal(staleStart.status, 409);
    assert.equal((await staleStart.json()).code, "not_latest_attempt");

    const noGapStart = await postJson(app, "/session/start", {
      roadmapId: "verification-roadmap",
      chapterId: "01-search.md",
      verificationAttemptId: correct.attempt.id,
    });
    assert.equal(noGapStart.status, 409);
    assert.equal((await noGapStart.json()).code, "attempt_has_no_gap");

    const pending = await (
      await postJson(app, "/verification/card", {
        roadmapId: "verification-roadmap",
        chapterId: "01-search.md",
      })
    ).json();
    assert.equal(pending.card.title, "챕터 검증");
    assert.match(pending.card.artifact.content, /email\.includes/);
    const finalInput = {
      roadmapId: "verification-roadmap",
      chapterId: "01-search.md",
      cardId: pending.card.id,
      verdict: "issue",
      location: "includes(query)",
      rationale: "입력 정규화가 빠졌습니다.",
      correction: "trim과 소문자 변환을 적용합니다.",
      confidence: 81,
    };
    const malformedReasoning = await postJson(
      createApi(config(), { client: fakeClient("malformed") }),
      "/verification/attempt",
      finalInput,
    );
    assert.equal(malformedReasoning.status, 503);
    assert.equal(
      (await malformedReasoning.json()).code,
      "reasoning_unavailable",
    );
    const failedReasoning = await postJson(
      createApi(config(), { client: fakeClient("fail") }),
      "/verification/attempt",
      finalInput,
    );
    assert.equal(failedReasoning.status, 503);
    assert.equal(
      (await failedReasoning.json()).code,
      "reasoning_unavailable",
    );
    const attemptCountAfterFailures = await (
      await app.request(
        "/verification/status?roadmap_id=verification-roadmap&chapter_id=01-search.md",
      )
    ).json();
    assert.equal(attemptCountAfterFailures.status.attemptsCount, 2);
    const groundedNull = await postJson(
      createApi(config(), { client: fakeClient(null) }),
      "/verification/attempt",
      finalInput,
    );
    assert.equal(groundedNull.status, 200);
    const groundedNullBody = await groundedNull.json();
    assert.equal(groundedNullBody.result.outcome, "undetermined");
    assert.equal(groundedNullBody.result.reasoningGrounded, null);

    await fs.unlink(searchNotePath);
    await fs.unlink(resolution.path);
    invalidateNotesCache();
    const lockedRestore = await app.request(
      `/verification/attempt?roadmap_id=verification-roadmap&chapter_id=01-search.md&attempt_id=${encodeURIComponent(miss.attempt.id)}`,
    );
    assert.equal(lockedRestore.status, 403);
    assert.equal((await lockedRestore.json()).code, "locked");
    await seedD1("Search Normalization", "01-search.md");

    const otherStatus = await (
      await app.request("/verification/status?roadmap_id=other-roadmap")
    ).json();
    assert.deepEqual(Object.keys(otherStatus.chapters).sort(), [
      "01-other.md",
      "02-other.md",
    ]);
  });

  test("returns stable 400/404 errors for malformed and unknown requests", async () => {
    const app = createApi(config(), { client: fakeClient() });
    assert.equal(
      (await postJson(app, "/verification/card", {})).status,
      400,
    );
    assert.equal(
      (
        await postJson(app, "/verification/card", {
          roadmapId: "missing",
          chapterId: "x",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await postJson(app, "/verification/attempt", {
          roadmapId: "verification-roadmap",
          chapterId: "01-search.md",
        })
      ).status,
      400,
    );
    assert.equal(
      (await app.request("/verification/attempt?roadmap_id=verification-roadmap"))
        .status,
      400,
    );
  });
});
