// iq-spiral-buddy client — 순수 유틸리티 (DOM/state 비의존, 5색 공유 모듈)

/** HTML 텍스트 이스케이프 — &<>"' 전부 인코딩. */
export function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// escapeAttr는 escapeHtml과 동일(따옴표까지 인코딩) — 의도적 alias.
// 호출부 가독성(속성 컨텍스트 표시)을 위해 별도 이름 유지.
export function escapeAttr(s) {
  return escapeHtml(s);
}

/**
 * 외부 로드맵/노트 데이터가 제목 앞에 붙인 장식 emoji를 UI에서 제거한다.
 * 식별자나 저장 원문은 건드리지 않고 표시 직전에만 사용한다.
 */
export function cleanUiLabel(value) {
  const source = String(value ?? "");
  return source
    .replace(
      /^(?:(?:\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*|\p{Regional_Indicator}{2})[\s·:—-]*)+/u,
      "",
    )
    .trimStart();
}

const GENERIC_CONCEPT_LABEL = /^(?:답변|설명|정의|개념|핵심|핵심\s*(?:요약|정리|내용|원리|동작\s*원리)|요약|정리|결론|(?:짧은\s*)?예시|참고|좋은\s*질문|정답|이름|명칭)$/iu;
const QUESTION_LIKE_ENDING = /(?:[?？!！]|뭐(?:야|지|였지|인가요?)?|무엇(?:인가요?)?|어떤\s*(?:거|것)(?:야|지|인가요?)?|어떻게|알려\s*(?:줘|주세요)|설명(?:해\s*(?:줘|주세요))?|찾아\s*(?:줘|주세요)|기억\s*(?:나|나요)|(?:인|인\s*건|라는\s*건|하는\s*건|한\s*건|거|것)(?:가|지|야|인가요?)?)\s*$/iu;

function limitConceptLabel(value, maxLength = 160) {
  const chars = Array.from(String(value ?? "").trim());
  if (chars.length <= maxLength) return chars.join("");
  return `${chars.slice(0, maxLength - 1).join("").trimEnd()}…`;
}

function cleanConceptCandidate(value) {
  const cleaned = String(value ?? "")
    .replace(/\[([^\[\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/<[^>]*>/gu, "")
    .replace(/[`*_~]/gu, "")
    .replace(/^\s*(?:#{1,6}|[-–—:：])\s*/u, "")
    .replace(/\s+/gu, " ")
    .replace(/\s*(?:(?:이란|란)\s*(?:무엇인가요?|뭔가요?)?|(?:이란|란)[?？])\s*$/u, "")
    .replace(/[\s:：;；,，。.!！?？]+$/u, "")
    .trim();
  if (!cleaned || Array.from(cleaned).length > 160) return "";
  if (GENERIC_CONCEPT_LABEL.test(cleaned)) return "";
  if (/\s(?:입니다|이에요|예요|한다|합니다|했어요|해요)$/u.test(cleaned)) return "";
  return cleaned;
}

function isShortKeywordQuery(value) {
  const query = String(value ?? "").replace(/\s+/gu, " ").trim();
  if (!query || Array.from(query).length > 80 || /[\r\n]/u.test(query)) {
    return false;
  }
  if (QUESTION_LIKE_ENDING.test(query)) return false;
  return query.split(" ").filter(Boolean).length <= 4;
}

function isNaturalLanguageQuery(value) {
  const query = String(value ?? "").replace(/\s+/gu, " ").trim();
  return Array.from(query).length > 80 || QUESTION_LIKE_ENDING.test(query);
}

function looksTechnical(value) {
  return /[\p{Script=Latin}\p{Number}]/u.test(value) || /[-+/#()[\]_.]/u.test(value);
}

/**
 * lookup 질문과 답변에서 보관할 개념명을 보수적으로 고른다.
 * 짧은 키워드는 그대로 두고, 자연어 질문은 답변 초반의 이름 표기를 우선한다.
 */
export function inferConceptTerm(query, rawSource) {
  const fallback = limitConceptLabel(String(query ?? "").replace(/\s+/gu, " "));
  if (isShortKeywordQuery(fallback)) return fallback;

  const source = String(rawSource ?? "").replace(/\r\n?/gu, "\n");
  const openingLines = source
    .split("\n")
    .filter((line) => line.trim())
    .slice(0, 12);
  for (const line of openingLines) {
    const heading = line.match(/^\s*#{1,3}\s+(.+)$/u);
    const headingCandidate = cleanConceptCandidate(heading?.[1]);
    if (headingCandidate) return headingCandidate;
  }

  const explicitName = source.slice(0, 700).match(
    /(?:(?:정식|정확한|공식|기술적)\s*)?(?:이름|명칭)(?:은|는|이|가)?\s*(?:바로|정확히)?\s*(?:[:：=]\s*)?\*\*([^*\n]{1,180})\*\*/iu,
  );
  const explicitCandidate = cleanConceptCandidate(explicitName?.[1]);
  if (explicitCandidate) return explicitCandidate;

  if (isNaturalLanguageQuery(fallback)) {
    const initial = source.slice(0, 700);
    for (const match of initial.matchAll(/\*\*([^*\n]{1,180})\*\*/gu)) {
      const boldCandidate = cleanConceptCandidate(match[1]);
      if (boldCandidate && looksTechnical(boldCandidate)) return boldCandidate;
    }
  }

  return fallback;
}


/** CSS 셀렉터/식별자 이스케이프 — CSS.escape 우선, 폴백 정규식. */
export function cssEscape(s) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

/** 길이 n 초과 시 말줄임표. */
export function truncate(s, n) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

/** 상대 시간 — "방금" / "N분 전" / "N시간 전" / "N일 전". */
export function _relTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

export class FetchTimeoutError extends Error {
  constructor(url, timeoutMs) {
    super(`${timeoutMs}ms 안에 응답하지 않았어요`);
    this.name = "FetchTimeoutError";
    this.url = String(url);
    this.timeoutMs = timeoutMs;
  }
}

export class HttpResponseError extends Error {
  constructor(url, status, statusText = "") {
    super(`HTTP ${status}${statusText ? ` ${statusText}` : ""}`);
    this.name = "HttpResponseError";
    this.url = String(url);
    this.status = status;
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 로컬 JSON API 공통 fetch.
 * - 응답 상태 검증
 * - 요청 상한 시간
 * - GET의 일시적 네트워크/5xx 오류 재시도
 * - 외부 AbortSignal 전달
 *
 * `fetchImpl`은 테스트 주입용이며 실제 fetch 옵션에는 전달하지 않는다.
 */
export async function fetchJson(url, options = {}) {
  const {
    timeoutMs = 15_000,
    retries = 0,
    retryDelayMs = 240,
    fetchImpl = globalThis.fetch,
    signal: externalSignal,
    ...fetchOptions
  } = options;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch를 사용할 수 없어요");
  }

  const method = String(fetchOptions.method ?? "GET").toUpperCase();
  const maxAttempts = method === "GET" ? Math.max(1, retries + 1) : 1;
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    let didTimeout = false;
    const onExternalAbort = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) onExternalAbort();
    else externalSignal?.addEventListener("abort", onExternalAbort, {
      once: true,
    });
    const timer =
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? setTimeout(() => {
            didTimeout = true;
            controller.abort();
          }, timeoutMs)
        : null;

    try {
      const response = await fetchImpl(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new HttpResponseError(url, response.status, response.statusText);
      }
      return await response.json();
    } catch (error) {
      if (externalSignal?.aborted) throw error;
      lastError = didTimeout
        ? new FetchTimeoutError(url, timeoutMs)
        : error;
      const retryable =
        !(lastError instanceof HttpResponseError) ||
        lastError.status === 429 ||
        lastError.status >= 500;
      if (!retryable || attempt + 1 >= maxAttempts) throw lastError;
      await wait(retryDelayMs * (attempt + 1));
    } finally {
      if (timer) clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }
  }

  throw lastError ?? new Error("요청에 실패했어요");
}
