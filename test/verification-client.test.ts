import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  isVerificationDue,
  verificationChapterState,
} from "../client/verification.js";

const completedChapter = {
  id: "01-search.md",
  maxDepth: 2,
  lastDate: "2026-01-01",
};

describe("chapter verification client state", () => {
  test("keeps an unresolved latest gap prominent", () => {
    const status = {
      eligible: true,
      latestAttempt: { outcome: "miss", hasGap: true },
      nextCardAvailable: false,
    };
    assert.equal(verificationChapterState(completedChapter, status).key, "review");
    assert.equal(isVerificationDue(completedChapter, status), true);
  });

  test("does not force verification again after deeper learning resolves the gap", () => {
    const status = {
      eligible: true,
      latestAttempt: { outcome: "miss", hasGap: false },
      nextCardAvailable: true,
    };
    assert.deepEqual(verificationChapterState(completedChapter, status), {
      key: "remediated",
      label: "재검증 가능",
      title: "발견한 빈틈을 보강했어요. 원할 때 새 검증을 시작할 수 있어요",
    });
    assert.equal(isVerificationDue(completedChapter, status), false);
    assert.equal(
      isVerificationDue(completedChapter, status, { includeToday: true }),
      false,
    );
  });

  test("preserves verified state for a grounded correct attempt", () => {
    const status = {
      eligible: true,
      latestAttempt: { outcome: "correct_rejection", hasGap: false },
      nextCardAvailable: true,
    };
    assert.equal(verificationChapterState(completedChapter, status).key, "verified");
    assert.equal(isVerificationDue(completedChapter, status), false);
  });
});
