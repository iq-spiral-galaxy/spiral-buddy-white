import { cssEscape, escapeAttr, escapeHtml } from "./util.js";
import { safeMarkedInto } from "./markdown.js";

const VERDICT_COPY = {
  safe: {
    label: "신뢰 가능",
    detail: "현재 정보로는 그대로 받아들여도 됩니다.",
  },
  issue: {
    label: "문제 있음",
    detail: "틀리거나 오해를 부르는 부분이 있습니다.",
  },
  insufficient: {
    label: "정보 부족",
    detail: "판정에 필요한 조건이나 근거가 빠져 있습니다.",
  },
};

const OUTCOME_COPY = {
  hit: { label: "찾아냈어요", tone: "success" },
  miss: { label: "놓친 빈틈이 있어요", tone: "warning" },
  correct_rejection: { label: "정확히 통과했어요", tone: "success" },
  false_alarm: { label: "과잉 의심이 있었어요", tone: "notice" },
  undetermined: { label: "근거를 더 확인해요", tone: "notice" },
};

function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs ?? 20_000);
  const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    let payload = null;
    try {
      payload = await response.json();
    } catch {}
    if (!response.ok) {
      const rawMessage =
        typeof payload?.error === "string"
          ? payload.error
          : typeof payload?.message === "string"
            ? payload.message
            : "";
      const code = typeof payload?.code === "string" ? payload.code : "";
      const message =
        code === "unresolved_gap"
          ? rawMessage || "다른 화면에서 발견한 빈틈을 먼저 확인해 주세요."
          : code === "card_unavailable"
          ? rawMessage || "이 챕터에서는 근거가 충분한 검증 문제를 만들 수 없어요."
          : response.status === 401 || /authentication|api.?key/i.test(rawMessage)
          ? "학습 엔진 연결을 확인한 뒤 다시 시도해 주세요."
          : response.status === 403
            ? "이 챕터의 d1 학습을 마치고 노트를 저장하면 열립니다."
            : response.status === 409
              ? "학습 상태가 달라졌어요. 화면을 닫고 다시 열어 주세요."
              : response.status === 422
                ? "챕터 근거에 정확히 연결된 문제를 만들지 못했어요. 잠시 후 다시 시도해 주세요."
                : rawMessage || `요청을 처리하지 못했어요 (HTTP ${response.status})`;
      const requestError = new Error(message);
      requestError.code = code;
      requestError.status = response.status;
      throw requestError;
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("응답이 늦어 요청을 멈췄어요");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normaliseStatus(payload) {
  return payload?.status ?? payload ?? null;
}

function latestOutcome(status) {
  return (
    status?.latestAttempt?.result?.outcome ??
    status?.latestAttempt?.outcome ??
    status?.latestOutcome ??
    null
  );
}

export function verificationChapterState(chapter, status) {
  const completedD1 =
    status?.completedD1 === true || Number(chapter?.maxDepth ?? 0) >= 1;
  if (!completedD1 || status?.eligible === false) {
    return {
      key: "locked",
      label: "",
      title:
        status?.lockedReason === "complete_d1_first"
          ? "d1을 마치면 검증할 수 있어요"
          : status?.lockedReason || "d1을 마치면 검증할 수 있어요",
    };
  }
  if (status?.latestAttempt?.hasGap === true) {
    return { key: "review", label: "보강 필요", title: "검증에서 발견한 빈틈을 다시 살펴보세요" };
  }
  const outcome = latestOutcome(status);
  if (outcome === "hit" || outcome === "correct_rejection") {
    return { key: "verified", label: "검증됨", title: "최근 검증을 정확히 마쳤어요" };
  }
  if (
    status?.latestAttempt &&
    status.latestAttempt.hasGap === false &&
    status?.nextCardAvailable === true
  ) {
    return {
      key: "remediated",
      label: "재검증 가능",
      title: "발견한 빈틈을 보강했어요. 원할 때 새 검증을 시작할 수 있어요",
    };
  }
  if (outcome === "miss" || outcome === "false_alarm" || outcome === "undetermined") {
    return { key: "review", label: "보강 필요", title: "검증에서 발견한 빈틈을 다시 살펴보세요" };
  }
  return { key: "available", label: "검증 가능", title: "그럴듯한 설명을 판정해 이해의 빈틈을 확인해보세요" };
}

export function isVerificationDue(chapter, status, { includeToday = false } = {}) {
  const display = verificationChapterState(chapter, status);
  if (display.key === "review") return true;
  // 심화 학습으로 이미 메운 빈틈은 사용자가 원할 때만 다시 검증한다.
  if (display.key === "remediated") return false;
  if (display.key !== "available" || status?.nextCardAvailable === false) return false;
  if (includeToday) return true;
  const lastDate = String(chapter?.lastDate ?? "").slice(0, 10);
  if (!lastDate) return false;
  const today = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return lastDate < today;
}

function artifactSource(card) {
  const artifact = card?.artifact ?? {};
  const content = String(artifact.content ?? "");
  if (artifact.kind === "code" && !/^\s*```/.test(content)) {
    const language = String(artifact.language ?? "").replace(/[^a-z0-9_+-]/gi, "");
    return `\`\`\`${language}\n${content}\n\`\`\``;
  }
  return content;
}

function verdictButtons() {
  return Object.entries(VERDICT_COPY)
    .map(
      ([value, copy]) => `
        <label class="verification-verdict" data-verdict="${value}">
          <input type="radio" name="verification-verdict" value="${value}" />
          <span class="verification-verdict-mark" aria-hidden="true"></span>
          <span>
            <strong>${escapeHtml(copy.label)}</strong>
            <small>${escapeHtml(copy.detail)}</small>
          </span>
        </label>`,
    )
    .join("");
}

function challengeMarkup(chapter, card) {
  return `
    <div class="verification-shell verification-challenge">
      <header class="verification-header">
        <button type="button" class="verification-back" data-verification-action="close" aria-label="검증 닫기">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
          <span>학습 경로</span>
        </button>
        <div class="verification-context">
          <strong>${escapeHtml(chapter.title)}</strong>
          <span>d1 완료</span>
        </div>
        <span class="verification-solo-badge">첫 판단</span>
      </header>

      <div class="verification-intro">
        <span class="verification-kicker">이해의 빈틈 확인</span>
        <h1 id="verification-title">이 설명, 믿어도 될까요?</h1>
        <p>오류가 없을 수도 있어요. 결론보다 먼저, 근거가 충분한지 살펴보세요.</p>
      </div>

      <div class="verification-workbench">
        <section class="verification-brief" aria-labelledby="verification-brief-title">
          <span class="verification-panel-label">판단할 상황</span>
          <h2 id="verification-brief-title">챕터 검증</h2>
          <div class="verification-prompt markdown-body" data-verification-prompt></div>
          ${card.sourceLabel ? `<small class="verification-source">${escapeHtml(card.sourceLabel)}</small>` : ""}
        </section>
        <section class="verification-artifact-panel" aria-labelledby="verification-artifact-title">
          <div class="verification-panel-heading">
            <span class="verification-panel-label" id="verification-artifact-title">검토할 내용</span>
            <button type="button" class="verification-quote-btn" data-verification-action="capture-selection" disabled>
              선택한 부분 지목
            </button>
          </div>
          <div class="verification-artifact markdown-body" data-verification-artifact tabindex="0"></div>
          <p class="verification-selection-help">문제가 의심되면 내용을 드래그해 정확한 위치를 지목할 수 있어요.</p>
        </section>
      </div>

      <form class="verification-response" data-verification-form novalidate>
        <fieldset class="verification-verdicts">
          <legend>먼저 판정해 주세요</legend>
          ${verdictButtons()}
        </fieldset>

        <div class="verification-reason-grid">
          <label class="verification-field verification-location-field">
            <span data-verification-location-label>의심한 위치 <small>‘문제 있음’일 때 필수</small></span>
            <textarea name="location" rows="2" placeholder="문장이나 코드 위치를 지목해 주세요"></textarea>
          </label>
          <label class="verification-field">
            <span>그렇게 판단한 이유</span>
            <textarea name="rationale" rows="3" placeholder="어떤 조건·원리와 맞거나 어긋나는지 적어주세요"></textarea>
          </label>
          <label class="verification-field verification-correction-field">
            <span data-verification-correction-label>고치거나 확인할 방법</span>
            <textarea name="correction" rows="3" placeholder="올바른 설명, 수정안 또는 확인할 테스트를 적어주세요"></textarea>
          </label>
        </div>

        <div class="verification-submit-row">
          <label class="verification-confidence">
            <span>이 판단을 얼마나 확신하나요?</span>
            <input name="confidence" type="range" min="0" max="100" step="10" value="60" />
            <output>60%</output>
          </label>
          <div class="verification-commit">
            <small>제출하기 전에는 Buddy가 정답을 암시하지 않아요.</small>
            <button type="submit" class="verification-submit" disabled>
              <span>판단 확정</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </button>
          </div>
        </div>
        <div class="verification-form-error hidden" role="alert" data-verification-form-error></div>
      </form>
    </div>`;
}

function loadingMarkup(chapter) {
  return `
    <div class="verification-shell verification-loading" role="status" aria-live="polite">
      <header class="verification-header">
        <button type="button" class="verification-back" data-verification-action="close" aria-label="검증 닫기">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>학습 경로</span>
        </button>
        <div class="verification-context"><strong>${escapeHtml(chapter.title)}</strong><span>d1 완료</span></div>
      </header>
      <div class="verification-loading-body">
        <span class="verification-loader" aria-hidden="true"></span>
        <strong>검증할 설명을 고르는 중</strong>
        <span>이 챕터의 핵심 질문과 연결된 내용을 준비하고 있어요.</span>
      </div>
    </div>`;
}

function messageMarkup({ chapter, title, message, action = "retry", actionLabel = "다시 시도" }) {
  return `
    <div class="verification-shell verification-message">
      <header class="verification-header">
        <button type="button" class="verification-back" data-verification-action="close" aria-label="검증 닫기">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>학습 경로</span>
        </button>
        <div class="verification-context"><strong>${escapeHtml(chapter.title)}</strong></div>
      </header>
      <div class="verification-message-body">
        <span class="verification-message-mark" aria-hidden="true">!</span>
        <h1 id="verification-title">${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
        <button type="button" data-verification-action="${escapeAttr(action)}">${escapeHtml(actionLabel)}</button>
      </div>
    </div>`;
}

function evidenceItems(evidence) {
  return Array.isArray(evidence) ? evidence : evidence ? [evidence] : [];
}

function evidenceMarkup(evidence) {
  const list = evidenceItems(evidence);
  if (list.length === 0) return "";
  return `<ul class="verification-evidence-list">${list
    .map((item, index) => {
      if (typeof item === "string") {
        return `<li><div class="verification-evidence-copy markdown-body" data-verification-md="evidence-excerpt-${index}"></div></li>`;
      }
      const excerpt = item?.excerpt ?? item?.text ?? item?.evidence ?? "";
      const explanation = item?.explanation ?? item?.detail ?? "";
      const source = item?.sourceLabel ?? "";
      return `<li>
        ${excerpt ? `<blockquote class="markdown-body" data-verification-md="evidence-excerpt-${index}"></blockquote>` : ""}
        ${explanation ? `<div class="verification-evidence-copy markdown-body" data-verification-md="evidence-explanation-${index}"></div>` : ""}
        ${source ? `<small>${escapeHtml(source)}</small>` : ""}
      </li>`;
    })
    .join("")}</ul>`;
}

function nextActionCopy(value) {
  const key = String(value ?? "");
  const copy = {
    start_deeper_session: "놓친 빈틈을 다음 나선의 첫 질문으로 이어가세요.",
    revisit_chapter: "근거가 갈린 부분을 챕터에서 다시 확인해보세요.",
    try_another: "다른 설명에서도 같은 판단 기준을 적용해보세요.",
    continue_learning: "이 판단 기준을 다음 학습에 연결해보세요.",
    review_false_alarm: "확실한 근거와 단순한 의심을 구분해보세요.",
  };
  return copy[key] || key || "이 판단 기준을 다음 학습에 연결해보세요.";
}

function calibrationCopy(outcome, confidence) {
  const high = confidence >= 80;
  const low = confidence <= 40;
  if ((outcome === "miss" || outcome === "false_alarm") && high) {
    return "높은 확신으로 엇갈린 지점이에요. 다음 나선에서 가장 먼저 다시 확인할 가치가 있어요.";
  }
  if ((outcome === "hit" || outcome === "correct_rejection") && low) {
    return "판정은 정확했지만 확신은 낮았어요. 근거를 한 번 더 설명하면 판단이 더 단단해집니다.";
  }
  if (outcome === "hit" || outcome === "correct_rejection") {
    return "판정과 확신이 잘 맞았어요. 같은 원리가 다른 상황에서도 유지되는지 확인해보세요.";
  }
  return "결론보다 근거가 어디에서 갈렸는지 확인해 다음 판단 기준으로 남겨두세요.";
}

function resultOutcome(result) {
  // 결론만 맞고 그 결론을 지지한 근거가 틀리면 '검증됨'이 아니다.
  return result?.reasoningGrounded === false
    ? "undetermined"
    : result?.outcome ?? "undetermined";
}

function resultHasGap(attempt, result) {
  const outcome = resultOutcome(result);
  return (
    attempt?.hasGap === true ||
    result?.canStartDeeperSession === true ||
    result?.reasoningGrounded === false ||
    outcome === "miss" ||
    outcome === "false_alarm" ||
    outcome === "undetermined"
  );
}

function reasoningCopy(result) {
  if (result?.reasoningGrounded === true) {
    return {
      title: "판정과 근거가 정확히 연결됐어요",
      detail: result?.reasoningFeedback || "선택한 결론을 챕터의 핵심 원리로 뒷받침했어요.",
    };
  }
  if (result?.reasoningGrounded === false) {
    return {
      title: "결론과 근거가 엇갈렸어요",
      detail:
        result?.reasoningFeedback ||
        "판정이 우연히 맞더라도 근거가 정확하지 않으면 이해가 검증된 것으로 보지 않아요.",
    };
  }
  return {
    title: "근거 연결을 확인했어요",
    detail: result?.reasoningFeedback || "어떤 근거가 판정을 가르는지 결과와 함께 비교해보세요.",
  };
}

function actualLocationCopy(result) {
  return result?.expectedVerdict === "safe"
    ? "오류 없음"
    : result?.issueLocation || "문제가 되는 위치를 근거와 함께 확인해보세요.";
}

function resultMarkup(chapter, card = null, attempt = {}, result = {}) {
  const outcome = resultOutcome(result);
  const copy = OUTCOME_COPY[outcome] ?? OUTCOME_COPY.undetermined;
  const confidence = Number(attempt?.confidence ?? 0);
  const hasGap = resultHasGap(attempt, result);
  const reasoning = reasoningCopy(result);
  const verdict = VERDICT_COPY[attempt?.verdict]?.label ?? "판정";
  const expectedVerdict = VERDICT_COPY[result?.expectedVerdict]?.label ?? "근거 확인";
  const nextDepth = Math.max(2, Number(chapter?.maxDepth ?? 1) + 1);
  return `
    <div class="verification-shell verification-result" data-outcome="${escapeAttr(outcome)}">
      <header class="verification-header">
        <button type="button" class="verification-back" data-verification-action="close" aria-label="검증 닫기">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>학습 경로</span>
        </button>
        <div class="verification-context"><strong>${escapeHtml(chapter.title)}</strong><span>검증 결과</span></div>
      </header>

      <div class="verification-result-hero ${copy.tone}">
        <span class="verification-result-label">이번 판단</span>
        <h1 id="verification-title">${escapeHtml(copy.label)}</h1>
        <div class="verification-result-summary markdown-body" data-verification-md="result-summary"></div>
        <div class="verification-result-meta"><span>${escapeHtml(verdict)}</span><span>확신 ${confidence}%</span></div>
      </div>

      <div class="verification-result-grid">
        <section class="verification-result-panel verification-my-judgment">
          <span class="verification-panel-label">내 판단의 근거</span>
          ${attempt?.location ? `<blockquote class="markdown-body" data-verification-md="attempt-location"></blockquote>` : ""}
          <div class="verification-result-copy markdown-body" data-verification-md="attempt-rationale"></div>
          ${attempt?.correction ? `<div class="verification-my-check"><small>내가 제안한 수정·확인 방법</small><div class="verification-my-check-copy markdown-body" data-verification-md="attempt-correction"></div></div>` : ""}
        </section>
        <section class="verification-result-panel verification-actual">
          <span class="verification-panel-label">실제 판정 · ${escapeHtml(expectedVerdict)}</span>
          <div class="verification-result-value markdown-body" data-verification-md="actual-location"></div>
          <div class="verification-result-copy markdown-body" data-verification-md="result-rationale"></div>
        </section>
        <section class="verification-result-panel verification-reasoning" data-grounded="${result?.reasoningGrounded === true ? "true" : result?.reasoningGrounded === false ? "false" : "unknown"}">
          <span class="verification-panel-label">근거의 정확성</span>
          <strong>${escapeHtml(reasoning.title)}</strong>
          <div class="verification-result-copy markdown-body" data-verification-md="reasoning-feedback"></div>
        </section>
        <section class="verification-result-panel verification-principle">
          <span class="verification-panel-label">정확하게 고치면</span>
          <div class="verification-result-value markdown-body" data-verification-md="result-correction"></div>
          ${result?.canonicalPrinciple && result.canonicalPrinciple !== result.correction ? `<div class="verification-result-copy markdown-body" data-verification-md="canonical-principle"></div>` : ""}
        </section>
        <section class="verification-result-panel verification-calibration">
          <span class="verification-panel-label">확신 돌아보기</span>
          <p>${escapeHtml(calibrationCopy(outcome, confidence))}</p>
        </section>
        <section class="verification-result-panel verification-evidence">
          <span class="verification-panel-label">챕터에서 확인한 근거</span>
          ${evidenceMarkup(result?.evidence)}
          ${!result?.evidence?.length ? `<p>${escapeHtml(result?.groundingNotice || "근거를 확인하는 중이에요.")}</p>` : ""}
          ${result?.groundingNotice ? `<small class="verification-grounding-notice">${escapeHtml(result.groundingNotice)}</small>` : ""}
        </section>
      </div>

      <div class="verification-next-step">
        <div>
          <span>다음 행동</span>
          <strong>${escapeHtml(nextActionCopy(result?.nextAction))}</strong>
        </div>
        <div class="verification-result-actions">
          ${result?.canStartDeeperSession ? `<button type="button" class="verification-deeper" data-verification-action="start-deeper">이 빈틈에서 d${nextDepth} 시작 <span aria-hidden="true">→</span></button>` : ""}
          ${!hasGap ? `<button type="button" class="verification-secondary" data-verification-action="next-card">다른 검증</button>` : ""}
          <button type="button" class="verification-secondary" data-verification-action="close">학습 경로로</button>
        </div>
      </div>
    </div>`;
}

function renderResultMarkdown(root, attempt, result) {
  const render = (name, value) => {
    const target = root.querySelector(`[data-verification-md="${name}"]`);
    if (target) safeMarkedInto(target, String(value ?? ""));
  };
  const reasoning = reasoningCopy(result);
  render("result-summary", result?.summary || "근거와 판단 과정을 함께 확인해보세요.");
  render("attempt-location", attempt?.location);
  render("attempt-rationale", attempt?.rationale || "기록된 근거가 없어요.");
  render("attempt-correction", attempt?.correction);
  render("actual-location", actualLocationCopy(result));
  render("result-rationale", result?.rationale || "판정을 가른 조건과 근거를 다시 확인해보세요.");
  render("reasoning-feedback", reasoning.detail);
  render(
    "result-correction",
    result?.correction || result?.canonicalPrinciple || "이 챕터의 근거와 조건을 다시 연결해보세요.",
  );
  if (result?.canonicalPrinciple !== result?.correction) {
    render("canonical-principle", result?.canonicalPrinciple);
  }
  evidenceItems(result?.evidence).forEach((item, index) => {
    if (typeof item === "string") {
      render(`evidence-excerpt-${index}`, item);
      return;
    }
    render(`evidence-excerpt-${index}`, item?.excerpt ?? item?.text ?? item?.evidence ?? "");
    render(`evidence-explanation-${index}`, item?.explanation ?? item?.detail ?? "");
  });
}

export function createVerificationController({
  root,
  getRoadmapId,
  onClose,
  onStatusLoaded,
  onAttemptSaved,
  onStartDeeper,
} = {}) {
  if (!root) throw new Error("verification root가 필요해요");
  let current = null;
  let previousFocus = null;
  let requestEpoch = 0;

  function setOpen(open) {
    root.classList.toggle("hidden", !open);
    root.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.classList.toggle("verification-active", open);
  }

  function focusFirst() {
    requestAnimationFrame(() => {
      root.querySelector("input, button, textarea, [tabindex='0']")?.focus();
    });
  }

  function close() {
    requestEpoch += 1;
    setOpen(false);
    const chapterId = current?.chapter?.id ?? null;
    current = null;
    const target = previousFocus;
    previousFocus = null;
    onClose?.();
    requestAnimationFrame(() => {
      if (target instanceof HTMLElement && target.isConnected) {
        target.focus();
        return;
      }
      if (chapterId) {
        document
          .querySelector(`.chapter-btn[data-id="${cssEscape(chapterId)}"]`)
          ?.focus();
      }
    });
  }

  async function statusFor(chapter, roadmapId = getRoadmapId()) {
    const params = new URLSearchParams({
      roadmap_id: roadmapId,
      chapter_id: chapter.id,
    });
    return normaliseStatus(
      await requestJson(`/api/verification/status?${params}`, {
        timeoutMs: 15_000,
        retries: 1,
      }),
    );
  }

  async function requestCard(chapter, roadmapId = getRoadmapId()) {
    return requestJson("/api/verification/card", {
      method: "POST",
      headers: jsonHeaders(),
      timeoutMs: 45_000,
      body: JSON.stringify({ roadmapId, chapterId: chapter.id }),
    });
  }

  async function requestAttemptResult(chapter, attemptId, roadmapId = getRoadmapId()) {
    const params = new URLSearchParams({
      roadmap_id: roadmapId,
      chapter_id: chapter.id,
      attempt_id: attemptId,
    });
    return requestJson(`/api/verification/attempt?${params}`, {
      timeoutMs: 20_000,
      retries: 1,
    });
  }

  function renderChallenge() {
    const { chapter, card } = current;
    root.innerHTML = challengeMarkup(chapter, card);
    const prompt = root.querySelector("[data-verification-prompt]");
    const artifact = root.querySelector("[data-verification-artifact]");
    if (prompt) {
      safeMarkedInto(prompt, "아래 내용을 챕터에서 배운 기준으로 판단해 주세요.");
    }
    if (artifact) safeMarkedInto(artifact, artifactSource(card));
    wireChallenge();
    focusFirst();
  }

  function renderResult(chapter, card, attempt, result) {
    root.innerHTML = resultMarkup(chapter, card, attempt, result);
    renderResultMarkdown(root, attempt, result);
    focusFirst();
  }

  function isCurrentLoad(epoch, roadmapId) {
    return (
      epoch === requestEpoch &&
      current?.roadmapId === roadmapId &&
      getRoadmapId() === roadmapId
    );
  }

  async function restoreLatestGap(chapter, status, epoch, roadmapId) {
    if (status?.latestAttempt?.hasGap !== true) return false;
    const latestAttemptId = status.latestAttempt.id;
    if (!latestAttemptId) {
      throw new Error("저장된 검증 결과를 찾지 못했어요. 학습 경로에서 다시 열어 주세요.");
    }
    const response = await requestAttemptResult(chapter, latestAttemptId, roadmapId);
    if (!isCurrentLoad(epoch, roadmapId)) return true;
    const attempt = {
      ...status.latestAttempt,
      ...(response?.attempt ?? {}),
      id: response?.attempt?.id ?? latestAttemptId,
      hasGap: true,
    };
    const result = response?.result ?? {};
    current.submitted = true;
    current.attempt = attempt;
    current.result = result;
    renderResult(chapter, null, attempt, result);
    return true;
  }

  async function recoverUnresolvedGap(chapter, epoch, roadmapId) {
    try {
      const refreshedStatus = await statusFor(chapter, roadmapId);
      if (!isCurrentLoad(epoch, roadmapId)) return;
      current.status = refreshedStatus;
      onStatusLoaded?.({ chapter, status: refreshedStatus, roadmapId });
      if (await restoreLatestGap(chapter, refreshedStatus, epoch, roadmapId)) {
        return;
      }
    } catch {
      if (!isCurrentLoad(epoch, roadmapId)) return;
    }
    if (!isCurrentLoad(epoch, roadmapId)) return;
    root.innerHTML = messageMarkup({
      chapter,
      title: "다른 화면에서 검증이 먼저 저장됐어요",
      message: "학습 경로로 돌아간 뒤 이 챕터를 다시 열면 최신 빈틈을 확인할 수 있어요.",
      action: "close",
      actionLabel: "학습 경로로",
    });
    focusFirst();
  }

  async function load(chapter, { skipStatus = false } = {}) {
    if (!document.body.classList.contains("verification-active")) {
      previousFocus = document.activeElement;
    }
    const epoch = ++requestEpoch;
    const roadmapId = getRoadmapId();
    current = {
      chapter,
      roadmapId,
      status: null,
      card: null,
      submitting: false,
      submitted: false,
    };
    root.innerHTML = loadingMarkup(chapter);
    setOpen(true);
    focusFirst();
    try {
      const status = skipStatus ? null : await statusFor(chapter, roadmapId);
      if (!isCurrentLoad(epoch, roadmapId)) return;
      current.status = status;
      if (status) onStatusLoaded?.({ chapter, status, roadmapId });
      if (status?.eligible === false) {
        const lockedMessage =
          status.lockedReason === "complete_d1_first"
            ? "이 챕터의 d1 학습을 마치고 노트를 저장하면 열립니다."
            : status.lockedReason || "이 챕터의 d1 학습을 마치고 노트를 저장하면 열립니다.";
        root.innerHTML = messageMarkup({
          chapter,
          title: "아직 검증을 열 수 없어요",
          message: lockedMessage,
          action: "close",
          actionLabel: "학습 경로로",
        });
        focusFirst();
        return;
      }
      if (await restoreLatestGap(chapter, status, epoch, roadmapId)) return;
      if (status?.nextCardAvailable === false && status?.latestAttempt) {
        root.innerHTML = messageMarkup({
          chapter,
          title: "이 챕터의 검증을 마쳤어요",
          message: "결과는 학습 활동에 남아 있어요. 다음 나선에서 새로운 판단 문제를 준비합니다.",
          action: "close",
          actionLabel: "학습 경로로",
        });
        focusFirst();
        return;
      }
      const response = await requestCard(chapter, roadmapId);
      if (!isCurrentLoad(epoch, roadmapId)) return;
      const card = response?.card ?? response;
      if (!card?.id || !card?.artifact || typeof card.artifact.content !== "string") {
        throw new Error("검증 문제 형식이 올바르지 않아요");
      }
      current.card = card;
      renderChallenge();
    } catch (error) {
      if (!isCurrentLoad(epoch, roadmapId)) return;
      if (error?.code === "unresolved_gap") {
        await recoverUnresolvedGap(chapter, epoch, roadmapId);
        return;
      }
      const unavailable = error?.code === "card_unavailable";
      root.innerHTML = messageMarkup({
        chapter,
        title: "검증을 준비하지 못했어요",
        message: error?.message || "잠시 후 다시 시도해 주세요.",
        action: unavailable ? "close" : "retry",
        actionLabel: unavailable ? "학습 경로로" : "다시 시도",
      });
      focusFirst();
    }
  }

  function selectedVerdict(form) {
    return form.elements.namedItem("verification-verdict")?.value ?? "";
  }

  function validForm(form) {
    const verdict = selectedVerdict(form);
    const data = new FormData(form);
    const rationale = String(data.get("rationale") ?? "").trim();
    const correction = String(data.get("correction") ?? "").trim();
    const location = String(data.get("location") ?? "").trim();
    return Boolean(verdict && rationale && correction && (verdict !== "issue" || location));
  }

  function syncChallenge(form) {
    const verdict = selectedVerdict(form);
    root.querySelectorAll(".verification-verdict").forEach((item) => {
      item.classList.toggle("selected", item.dataset.verdict === verdict);
    });
    const locationLabel = root.querySelector("[data-verification-location-label]");
    const correctionLabel = root.querySelector("[data-verification-correction-label]");
    if (locationLabel) {
      locationLabel.innerHTML =
        verdict === "insufficient"
          ? "부족한 정보 <small>무엇이 더 필요한지 적어주세요</small>"
          : verdict === "safe"
            ? "확인한 위치 <small>선택 사항</small>"
            : "의심한 위치 <small>‘문제 있음’일 때 필수</small>";
    }
    if (correctionLabel) {
      correctionLabel.textContent = verdict === "safe" ? "판단을 확인할 방법" : "고치거나 확인할 방법";
    }
    const submit = form.querySelector(".verification-submit");
    if (submit) submit.disabled = current?.submitting || !validForm(form);
  }

  function updateSelectionButton() {
    const selection = window.getSelection();
    const artifact = root.querySelector("[data-verification-artifact]");
    const button = root.querySelector("[data-verification-action='capture-selection']");
    if (!selection || !artifact || !button || selection.isCollapsed) {
      if (button) button.disabled = true;
      return;
    }
    const inside = artifact.contains(selection.anchorNode) && artifact.contains(selection.focusNode);
    button.disabled = !inside || !selectionLocationText(selection, artifact);
  }

  function selectionLocationText(selection, artifact) {
    if (!selection || !artifact || selection.rangeCount === 0) return "";
    const range = selection.getRangeAt(0);
    const wrapMath = (math) => {
      const tex = String(math?.dataset?.tex ?? "").trim();
      if (!tex) return "";
      return math.dataset.display === "true" ? `$$${tex}$$` : `$${tex}$`;
    };
    const fragment = range.cloneContents();
    const clonedMath = [...fragment.querySelectorAll(".math-src[data-tex]")];
    clonedMath.forEach((math) => {
      const source = wrapMath(math);
      if (source) math.replaceWith(document.createTextNode(source));
    });
    // KaTeX의 화면 문자열은 MathML/HTML 접근성 텍스트가 중복될 수 있다.
    // 복제한 선택 영역 안에서 수식을 원본 LaTeX로 치환해 주변 문장도 보존한다.
    if (clonedMath.length > 0) {
      return String(fragment.textContent ?? "").trim().slice(0, 500);
    }
    const elementFor = (node) =>
      node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const anchorMath = elementFor(selection.anchorNode)?.closest?.(".math-src[data-tex]");
    const focusMath = elementFor(selection.focusNode)?.closest?.(".math-src[data-tex]");
    if (anchorMath && anchorMath === focusMath) {
      return wrapMath(anchorMath).slice(0, 500);
    }
    return selection.toString().trim().slice(0, 500);
  }

  function captureSelection() {
    const selection = window.getSelection();
    const artifact = root.querySelector("[data-verification-artifact]");
    const text = selectionLocationText(selection, artifact);
    const form = root.querySelector("[data-verification-form]");
    const location = form?.elements.namedItem("location");
    if (!text || !(location instanceof HTMLTextAreaElement)) return;
    location.value = text;
    location.dispatchEvent(new Event("input", { bubbles: true }));
    location.focus();
  }

  async function submit(form) {
    if (!current?.card || current.submitting || current.submitted || !validForm(form)) return;
    const submission = current;
    if (submission.roadmapId !== getRoadmapId()) {
      close();
      return;
    }
    const submissionEpoch = requestEpoch;
    submission.submitting = true;
    syncChallenge(form);
    const submitButton = form.querySelector(".verification-submit");
    submitButton?.setAttribute("aria-busy", "true");
    const errorBox = form.querySelector("[data-verification-form-error]");
    errorBox?.classList.add("hidden");
    const data = new FormData(form);
    const attempt = {
      roadmapId: submission.roadmapId,
      chapterId: submission.chapter.id,
      cardId: submission.card.id,
      verdict: String(data.get("verification-verdict")),
      location: String(data.get("location") ?? "").trim(),
      rationale: String(data.get("rationale") ?? "").trim(),
      correction: String(data.get("correction") ?? "").trim(),
      confidence: Number(data.get("confidence") ?? 60),
    };
    try {
      const response = await requestJson("/api/verification/attempt", {
        method: "POST",
        headers: jsonHeaders(),
        timeoutMs: 45_000,
        body: JSON.stringify(attempt),
      });
      const savedAttempt = { ...attempt, ...(response?.attempt ?? {}) };
      const savedResult = response?.result ?? {};
      onAttemptSaved?.({
        chapter: submission.chapter,
        attempt: savedAttempt,
        result: savedResult,
      });
      if (submissionEpoch !== requestEpoch || current !== submission) return;
      submission.submitted = true;
      submission.attempt = savedAttempt;
      submission.result = savedResult;
      renderResult(submission.chapter, submission.card, savedAttempt, savedResult);
    } catch (error) {
      submission.submitting = false;
      if (submissionEpoch !== requestEpoch || current !== submission) return;
      submitButton?.removeAttribute("aria-busy");
      if (errorBox) {
        errorBox.textContent = `판단을 저장하지 못했어요: ${error?.message || "다시 시도해 주세요."}`;
        errorBox.classList.remove("hidden");
      }
      syncChallenge(form);
    }
  }

  function wireChallenge() {
    const form = root.querySelector("[data-verification-form]");
    if (!form) return;
    form.addEventListener("input", (event) => {
      if (event.target?.name === "confidence") {
        const output = form.querySelector(".verification-confidence output");
        if (output) output.textContent = `${event.target.value}%`;
      }
      syncChallenge(form);
    });
    form.addEventListener("change", () => syncChallenge(form));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submit(form);
    });
    root.querySelector("[data-verification-artifact]")?.addEventListener("mouseup", updateSelectionButton);
    root.querySelector("[data-verification-artifact]")?.addEventListener("keyup", updateSelectionButton);
    syncChallenge(form);
  }

  root.addEventListener("click", (event) => {
    const action = event.target.closest("[data-verification-action]")?.dataset.verificationAction;
    if (!action) return;
    if (action === "close") close();
    else if (action === "retry" && current?.chapter) load(current.chapter);
    else if (action === "capture-selection") captureSelection();
    else if (action === "next-card" && current?.chapter) load(current.chapter, { skipStatus: true });
    else if (action === "start-deeper" && current?.attempt?.id) {
      const payload = { chapter: current.chapter, attemptId: current.attempt.id };
      setOpen(false);
      onStartDeeper?.(payload);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("verification-active")) {
      event.preventDefault();
      close();
    }
  });

  return { open: load, close, isOpen: () => document.body.classList.contains("verification-active") };
}

export async function loadVerificationStatuses(roadmapId) {
  if (!roadmapId) return new Map();
  const params = new URLSearchParams({ roadmap_id: roadmapId });
  const payload = await requestJson(`/api/verification/status?${params}`, {
    timeoutMs: 20_000,
    retries: 1,
  });
  const source = payload?.chapters ?? {};
  if (Array.isArray(source)) {
    return new Map(source.filter((item) => item?.chapterId).map((item) => [item.chapterId, item]));
  }
  return new Map(Object.entries(source));
}
