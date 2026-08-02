import { escapeAttr, escapeHtml } from "./util.js";

function chapterDepth(chapter) {
  const depth = Number(chapter?.maxDepth ?? 0);
  return Number.isFinite(depth) ? Math.max(0, depth) : 0;
}

function orderedAfter(items, startIndex) {
  if (items.length === 0) return [];
  if (startIndex < 0) return [...items];
  return [
    ...items.slice(startIndex + 1),
    ...items.slice(0, startIndex + 1),
  ];
}

/**
 * Pick one deterministic next action without an extra model request.
 * The learning path advances first, then returns to shallower chapters.
 */
export function selectLearningFocus(chapters = [], recentChapterId = null) {
  const list = Array.isArray(chapters) ? chapters.filter(Boolean) : [];
  if (list.length === 0) return null;

  const recentIndex = list.findIndex(
    (chapter) => chapter.id === recentChapterId,
  );
  const completedCount = list.filter(
    (chapter) => chapterDepth(chapter) > 0,
  ).length;

  if (completedCount === 0) {
    return {
      chapter: list[0],
      mode: "first",
      targetDepth: 1,
      rationale: "첫 챕터부터 가볍게 시작해 학습 흐름을 열어보세요.",
    };
  }

  const nextUnvisited = orderedAfter(list, recentIndex).find(
    (chapter) => chapterDepth(chapter) === 0,
  );
  if (nextUnvisited) {
    return {
      chapter: nextUnvisited,
      mode: "continue",
      targetDepth: 1,
      rationale: "마지막 학습에 이어 다음 미완료 챕터로 흐름을 이어가세요.",
    };
  }

  const recentChapter = recentIndex >= 0 ? list[recentIndex] : null;
  if (recentChapter && chapterDepth(recentChapter) < 3) {
    const targetDepth = chapterDepth(recentChapter) + 1;
    return {
      chapter: recentChapter,
      mode: "deepen",
      targetDepth,
      rationale: `방금 다룬 개념으로 돌아와 d${targetDepth}에서 한 단계 더 깊게 연결해보세요.`,
    };
  }

  const reviewCandidate = [...list]
    .filter((chapter) => chapterDepth(chapter) < 3)
    .sort((a, b) => {
      const depthDelta = chapterDepth(a) - chapterDepth(b);
      if (depthDelta !== 0) return depthDelta;
      return String(a.lastDate ?? "").localeCompare(
        String(b.lastDate ?? ""),
      );
    })[0];
  if (reviewCandidate) {
    const targetDepth = chapterDepth(reviewCandidate) + 1;
    return {
      chapter: reviewCandidate,
      mode: "deepen",
      targetDepth,
      rationale: `아직 ${targetDepth}번째 나선을 열지 않은 챕터예요. 복습으로 이해의 빈틈을 메워보세요.`,
    };
  }

  return {
    chapter: recentChapter ?? list[list.length - 1],
    mode: "reconnect",
    targetDepth: Math.max(
      1,
      chapterDepth(recentChapter ?? list[list.length - 1]),
    ),
    rationale: "완주한 개념을 새로운 질문으로 다시 연결해 지식을 단단하게 만들어보세요.",
  };
}

export function getLearningMetrics(chapters = [], history = []) {
  const list = Array.isArray(chapters) ? chapters.filter(Boolean) : [];
  const notes = Array.isArray(history) ? history.filter(Boolean) : [];
  const completed = list.filter((chapter) => chapterDepth(chapter) > 0).length;
  const passes = list.reduce(
    (sum, chapter) => sum + chapterDepth(chapter),
    0,
  );
  const percent =
    list.length > 0 ? Math.round((completed / list.length) * 100) : 0;

  return {
    total: list.length,
    completed,
    passes,
    notes: notes.length,
    percent,
  };
}

export function getLatestHistoryNote(history = []) {
  const notes = Array.isArray(history) ? history.filter(Boolean) : [];
  return (
    [...notes].sort((a, b) =>
      String(b?.modifiedAt ?? b?.date ?? "").localeCompare(
        String(a?.modifiedAt ?? a?.date ?? ""),
      ),
    )[0] ?? null
  );
}

const SPIRAL_AMBIENT_MARK = `
  <div class="hub-ambient-geometry" aria-hidden="true">
    <svg class="welcome-geometry" viewBox="0 0 1000 720" preserveAspectRatio="xMidYMid slice">
      <use href="#blue-welcome-geometry"></use>
    </svg>
  </div>`;

function focusModeLabel(mode) {
  if (mode === "first") return "첫 번째 나선";
  if (mode === "continue") return "다음 챕터";
  if (mode === "deepen") return "더 깊은 복습";
  return "다시 연결하기";
}

function buildLearningHubLoadingMarkup() {
  return `
    <div class="placeholder spiral-welcome learning-hub is-loading" aria-label="학습 허브" aria-busy="true">
      ${SPIRAL_AMBIENT_MARK}
      <span class="visually-hidden">학습 정보를 불러오는 중입니다.</span>

      <section class="hub-focus hub-loading-focus" aria-hidden="true">
        <div class="hub-focus-heading">
          <span class="hub-skeleton hub-skeleton-kicker"></span>
          <span class="hub-skeleton hub-skeleton-badge"></span>
        </div>
        <div class="hub-focus-body">
          <div class="hub-focus-copy">
            <span class="hub-skeleton hub-skeleton-title"></span>
            <span class="hub-skeleton hub-skeleton-copy"></span>
            <span class="hub-skeleton hub-skeleton-meta"></span>
          </div>
          <div class="hub-focus-actions">
            <span class="hub-skeleton hub-skeleton-button"></span>
            <span class="hub-skeleton hub-skeleton-button is-secondary"></span>
          </div>
        </div>
      </section>

      <div class="hub-overview" aria-hidden="true">
        <section class="hub-progress hub-loading-panel">
          <span class="hub-skeleton hub-skeleton-section"></span>
          <span class="hub-skeleton hub-skeleton-panel"></span>
        </section>
        <section class="hub-recent hub-loading-panel">
          <span class="hub-skeleton hub-skeleton-section"></span>
          <span class="hub-skeleton hub-skeleton-panel"></span>
        </section>
      </div>
    </div>`;
}

export function buildLearningHubMarkup({
  roadmapName = "학습 경로",
  chapters = [],
  history = [],
  recentChapterId = null,
  pausedSession = null,
  verificationFocus = null,
  canOpenSettings = false,
  loading = false,
} = {}) {
  if (loading) return buildLearningHubLoadingMarkup();

  const list = Array.isArray(chapters) ? chapters : [];
  const notes = Array.isArray(history) ? history : [];
  const metrics = getLearningMetrics(list, notes);
  const selected = selectLearningFocus(list, recentChapterId);
  const selectedIndex = selected
    ? list.findIndex((chapter) => chapter.id === selected.chapter.id)
    : -1;
  const recentNote = getLatestHistoryNote(notes);
  const hasPaused = Boolean(pausedSession?.id);

  let focusLabel = "학습 준비";
  let focusTitle = "첫 학습 경로를 선택해 주세요";
  let focusRationale =
    "왼쪽에서 관심 있는 로드맵을 고르면 추천 챕터와 학습 흐름을 바로 준비해드려요.";
  let focusMeta = "로드맵을 선택하면 진행률이 여기에 표시됩니다";
  let primaryAction = canOpenSettings ? "settings" : "path";
  let primaryLabel = canOpenSettings ? "학습 자료 추가" : "학습 경로 보기";
  let primaryData = "";
  let focusDepth = "READY";

  if (selected) {
    focusLabel = focusModeLabel(selected.mode);
    focusTitle = selected.chapter.title || "제목 없는 챕터";
    focusRationale = selected.rationale;
    focusMeta = `${selectedIndex + 1} / ${list.length} 챕터 · ${roadmapName}`;
    primaryAction = "start";
    primaryLabel =
      selected.mode === "deepen"
        ? `d${selected.targetDepth}로 이어가기`
        : "학습 시작";
    primaryData = ` data-chapter-id="${escapeAttr(selected.chapter.id)}"`;
    focusDepth = `d${selected.targetDepth}`;
  }

  if (verificationFocus?.chapter) {
    const verificationChapter = verificationFocus.chapter;
    const latest = verificationFocus.status?.latestAttempt;
    const needsReview = latest?.hasGap === true;
    focusLabel = verificationFocus.immediate
      ? "검증이 열렸어요"
      : needsReview
        ? "보강할 이해"
        : "이해의 빈틈 확인";
    focusTitle = verificationChapter.title || "제목 없는 챕터";
    focusRationale = needsReview
      ? "지난 판단에서 갈린 근거를 다시 확인하고, 놓친 지점에서 다음 나선을 시작해보세요."
      : "그럴듯한 설명 하나를 판정해, 이해했다고 넘긴 부분까지 확인해보세요.";
    focusMeta = `${roadmapName} · d1을 마친 챕터`;
    primaryAction = "verification";
    primaryLabel = needsReview ? "빈틈 다시 확인" : "90초 검증하기";
    primaryData = ` data-chapter-id="${escapeAttr(verificationChapter.id)}"`;
    focusDepth = "검증";
  }

  if (hasPaused) {
    focusLabel = "멈춘 학습";
    focusTitle = pausedSession.chapterTitle || "이전 학습";
    focusRationale =
      "대화와 맥락이 그대로 남아 있어, 멈춘 지점에서 바로 이어갈 수 있어요.";
    focusMeta = `${pausedSession.roadmapName || roadmapName} · 저장 전 대화`;
    primaryAction = "resume";
    primaryLabel = "대화 이어가기";
    primaryData = ` data-session-id="${escapeAttr(pausedSession.id)}"`;
    focusDepth = `d${Number(pausedSession.depth ?? 1) || 1}`;
  }

  const recentTitle = recentNote?.topic || recentNote?.title || "";
  const recentSummary =
    recentNote?.summary ||
    "최근 학습의 대화와 정리된 노트를 다시 확인할 수 있어요.";

  return `
    <div class="placeholder spiral-welcome learning-hub" aria-label="학습 허브">
      ${SPIRAL_AMBIENT_MARK}

      <section class="hub-focus" aria-labelledby="hub-focus-title">
        <div class="hub-focus-heading">
          <span class="hub-focus-label">${escapeHtml(focusLabel)}</span>
          <span class="hub-depth-badge">${escapeHtml(focusDepth)}</span>
        </div>
        <div class="hub-focus-body">
          <div class="hub-focus-copy">
            <h2 id="hub-focus-title">${escapeHtml(focusTitle)}</h2>
            <p>${escapeHtml(focusRationale)}</p>
            <span class="hub-focus-meta">${escapeHtml(focusMeta)}</span>
          </div>
          <div class="hub-focus-actions">
            <button type="button" class="hub-btn hub-btn-primary${primaryAction === "verification" ? " hub-btn-verification" : ""}" data-hub-action="${primaryAction}"${primaryData}>
              <span>${escapeHtml(primaryLabel)}</span>
              <span aria-hidden="true">→</span>
            </button>
            <button type="button" class="hub-btn hub-btn-secondary" data-hub-action="path">
              학습 경로 보기
            </button>
          </div>
        </div>
      </section>

      <div class="hub-overview">
        <section class="hub-progress" aria-labelledby="hub-progress-title">
          <div class="hub-section-heading">
            <div>
              <h2 id="hub-progress-title">나선 진행률</h2>
            </div>
            <button type="button" class="hub-text-btn" data-hub-action="activity">활동 보기</button>
          </div>
          <div class="hub-progress-content">
            <div class="hub-progress-ring" style="--hub-progress: ${metrics.percent}%" role="img" aria-label="챕터 진행률 ${metrics.percent}%">
              <strong>${metrics.percent}<span>%</span></strong>
              <small>완료</small>
            </div>
            <dl class="hub-metrics">
              <div>
                <dt>완료 챕터</dt>
                <dd>${metrics.completed}<span> / ${metrics.total}</span></dd>
              </div>
              <div>
                <dt>누적 나선</dt>
                <dd>${metrics.passes}<span>회</span></dd>
              </div>
              <div>
                <dt>저장 노트</dt>
                <dd>${metrics.notes}<span>개</span></dd>
              </div>
            </dl>
          </div>
        </section>

        <section class="hub-recent" aria-labelledby="hub-recent-title">
          <div class="hub-section-heading">
            <div>
              <h2 id="hub-recent-title">최근에 남긴 노트</h2>
            </div>
            ${
              recentNote
                ? `<span class="hub-recent-depth">d${Number(recentNote.depth ?? 1) || 1}</span>`
                : ""
            }
          </div>
          ${
            recentNote
              ? `
                <button type="button" class="hub-recent-note" data-hub-action="recent">
                  <strong>${escapeHtml(recentTitle)}</strong>
                  <span>${escapeHtml(recentSummary)}</span>
                  <small>${escapeHtml(recentNote.date ?? "")} · 대화 다시 보기 →</small>
                </button>`
              : `
                <div class="hub-recent-empty">
                  <strong>첫 노트를 기다리고 있어요</strong>
                  <span>학습을 마치면 대화가 구조화된 노트로 자동 저장됩니다.</span>
                </div>`
          }
        </section>
      </div>

    </div>`;
}
