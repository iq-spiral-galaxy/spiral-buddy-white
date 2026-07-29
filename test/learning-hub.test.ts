import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildLearningHubMarkup,
  getLatestHistoryNote,
  getLearningMetrics,
  selectLearningFocus,
} from "../client/learning-hub.js";

describe("learning hub recommendation", () => {
  test("starts with the first chapter on a new roadmap", () => {
    const chapters = [
      { id: "a", title: "A", maxDepth: 0 },
      { id: "b", title: "B", maxDepth: 0 },
    ];
    const focus = selectLearningFocus(chapters);
    assert.equal(focus?.chapter.id, "a");
    assert.equal(focus?.mode, "first");
    assert.equal(focus?.targetDepth, 1);
  });

  test("continues to the first unfinished chapter after the recent one", () => {
    const chapters = [
      { id: "a", title: "A", maxDepth: 1 },
      { id: "b", title: "B", maxDepth: 0 },
      { id: "c", title: "C", maxDepth: 0 },
    ];
    const focus = selectLearningFocus(chapters, "a");
    assert.equal(focus?.chapter.id, "b");
    assert.equal(focus?.mode, "continue");
  });

  test("returns to the recent chapter when the path is complete but shallow", () => {
    const chapters = [
      { id: "a", title: "A", maxDepth: 1 },
      { id: "b", title: "B", maxDepth: 2 },
    ];
    const focus = selectLearningFocus(chapters, "b");
    assert.equal(focus?.chapter.id, "b");
    assert.equal(focus?.mode, "deepen");
    assert.equal(focus?.targetDepth, 3);
  });

  test("uses the shallowest, oldest chapter when the recent one is already deep", () => {
    const chapters = [
      { id: "a", title: "A", maxDepth: 2, lastDate: "2026-07-20" },
      { id: "b", title: "B", maxDepth: 1, lastDate: "2026-07-22" },
      { id: "c", title: "C", maxDepth: 3, lastDate: "2026-07-28" },
    ];
    const focus = selectLearningFocus(chapters, "c");
    assert.equal(focus?.chapter.id, "b");
    assert.equal(focus?.targetDepth, 2);
  });
});

describe("learning hub rendering", () => {
  test("uses the real hub structure as a neutral loading skeleton", () => {
    const html = buildLearningHubMarkup({ loading: true });
    assert.match(html, /learning-hub is-loading/);
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /hub-skeleton-title/);
    assert.doesNotMatch(html, /첫 학습 경로를 선택해 주세요/);
    assert.doesNotMatch(html, /data-hub-action=/);
  });

  test("summarizes completed chapters, passes and notes", () => {
    assert.deepEqual(
      getLearningMetrics(
        [
          { maxDepth: 2 },
          { maxDepth: 1 },
          { maxDepth: 0 },
          { maxDepth: 0 },
        ],
        [{}, {}],
      ),
      {
        total: 4,
        completed: 2,
        passes: 3,
        notes: 2,
        percent: 50,
      },
    );
  });

  test("uses the actual latest note even when API history is unsorted", () => {
    const latest = getLatestHistoryNote([
      { id: "older", modifiedAt: "2026-07-20T09:00:00Z" },
      { id: "latest", modifiedAt: "2026-07-29T09:00:00Z" },
      { id: "middle", date: "2026-07-25" },
    ]);
    assert.equal(latest?.id, "latest");
  });

  test("prioritizes a paused session and escapes user-controlled text", () => {
    const html = buildLearningHubMarkup({
      roadmapName: `<img src=x onerror="bad">`,
      chapters: [{ id: "a", title: "A", maxDepth: 0 }],
      pausedSession: {
        id: `pause-"1`,
        chapterTitle: `<script>bad()</script>`,
        depth: 2,
      },
    });
    assert.match(html, /data-hub-action="resume"/);
    assert.match(html, /data-session-id="pause-&quot;1"/);
    assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /class="hub-ambient-geometry"/);
    assert.match(html, /<use href="#blue-welcome-geometry"><\/use>/);
    assert.doesNotMatch(html, /class="hub-hero/);
  });
});
