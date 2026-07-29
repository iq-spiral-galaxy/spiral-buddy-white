// spiral-buddy-white client — 마크다운 렌더링 (marked 설정 + sanitize, 공유 모듈)
// 렌더러 의존성은 release에 함께 번들한다. CDN 연결이 늦거나 끊겨도
// app.js module graph가 멈추지 않아 초기 "불러오는 중…" 화면에 고착되지 않는다.

import {
  marked,
  markedHighlight,
  hljs,
  DOMPurify,
} from "./vendor/markdown-deps.js";

marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    },
  }),
);
marked.setOptions({ breaks: true, gfm: true });

// v0.5.77 — 모든 마크다운 → HTML 변환을 sanitize 통과시킴.
// LLM 출력은 챕터 본문(임의 마크다운 파일)의 영향을 받으므로
// <img onerror=...> 류가 본문을 타고 응답에 섞일 가능성을 차단.
// marked.parse를 직접 쓰지 말고 항상 이 함수를 거칠 것.
export function renderMarkdown(raw) {
  return DOMPurify.sanitize(marked.parse(raw));
}

// v0.5.75 — marked.parse 안전 래퍼.
// 기존엔 streamInto의 최종 parse가 무방비라, 특정 마크다운(깨진 테이블,
// 비정상 중첩 등)에서 marked가 throw하면 startSession catch로 전파 →
// enableSessionUi(false) → "Buddy 메시지는 보이는데 입력이 영구 비활성"
// 증상 발생. 파싱 실패 시 plain text로 graceful 표시.
export function safeMarkedInto(el, raw) {
  try {
    el.innerHTML = renderMarkdown(raw);
  } catch {
    el.textContent = raw;
  }
}
