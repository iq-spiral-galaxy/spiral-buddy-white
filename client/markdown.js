// spiral-buddy-white client — Markdown, code highlight, KaTeX and safe streaming.
// 모든 의존성은 release에 함께 번들되어 네트워크 없이 동작한다.

import {
  marked,
  markedHighlight,
  markedKatex,
  hljs,
  DOMPurify,
} from "./vendor/markdown-deps.js";
import { normalizeMathDelimiters } from "./math.js";
import { escapeAttr } from "./util.js";

const SOURCE_BY_ELEMENT = new WeakMap();
const MATH_RENDER_INTERVAL_MS = 84;

marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    },
  }),
);

// AI 출력은 신뢰할 수 없는 입력으로 취급한다. 외부 리소스/HTML 명령은
// 차단하고, 과도한 크기와 매크로 확장을 제한한다. MathML을 함께 출력해
// 스크린 리더가 시각 수식과 같은 의미를 읽을 수 있게 한다.
const mathExtension = markedKatex({
  throwOnError: false,
  nonStandard: true,
  output: "htmlAndMathml",
  trust: false,
  strict: "ignore",
  maxSize: 20,
  maxExpand: 500,
  errorColor: "#b42318",
});

for (const extension of mathExtension.extensions ?? []) {
  const renderToken = extension.renderer;
  if (typeof renderToken !== "function") continue;
  extension.renderer = function renderAccessibleMath(token) {
    const html = renderToken.call(this, token);
    if (typeof html !== "string") return html;
    const source = String(token.text ?? "");
    const display = Boolean(token.displayMode);
    const hasError = html.includes("katex-error");
    const classes = [
      "math-src",
      display ? "math-src-display" : "",
      hasError ? "math-src-error" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const label = hasError
      ? "해석하지 못한 수식입니다. 원본 LaTeX를 복사하려면 누르세요."
      : "원본 LaTeX를 복사하려면 누르세요.";
    const newline = extension.name === "blockKatex" ? "\n" : "";
    return `<span class="${classes}" data-tex="${escapeAttr(source)}" data-display="${display ? "true" : "false"}" role="button" tabindex="0" aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}">${html}<span class="math-copy-feedback" aria-live="polite"></span></span>${newline}`;
  };
}

marked.use(mathExtension);
marked.setOptions({ breaks: true, gfm: true });

export async function copyText(text) {
  const value = String(text ?? "");
  if (globalThis.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(value);
    return;
  }
  if (typeof document === "undefined") {
    throw new Error("클립보드를 사용할 수 없습니다.");
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand?.("copy");
  textarea.remove();
  if (!copied) throw new Error("클립보드 복사에 실패했습니다.");
}

function wrappedMathSource(element) {
  const tex = element.dataset.tex ?? "";
  return element.dataset.display === "true" ? `$$${tex}$$` : `$${tex}$`;
}

async function copyMathElement(element) {
  const feedback = element.querySelector(".math-copy-feedback");
  try {
    await copyText(wrappedMathSource(element));
    element.classList.add("math-copied");
    if (feedback) feedback.textContent = "LaTeX를 복사했습니다.";
  } catch {
    element.classList.add("math-copy-failed");
    if (feedback) feedback.textContent = "복사하지 못했습니다.";
  }
  setTimeout(() => {
    element.classList.remove("math-copied", "math-copy-failed");
    if (feedback) feedback.textContent = "";
  }, 1400);
}

if (typeof document !== "undefined") {
  document.addEventListener("click", (event) => {
    const element = event.target?.closest?.(".math-src");
    if (!element) return;
    const selection = globalThis.getSelection?.();
    if (selection && !selection.isCollapsed) return;
    void copyMathElement(element);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const element = event.target?.closest?.(".math-src");
    if (!element) return;
    event.preventDefault();
    void copyMathElement(element);
  });
}

export function renderMarkdown(raw) {
  const normalized = normalizeMathDelimiters(raw);
  const rendered = marked.parse(normalized);
  return DOMPurify.sanitize(rendered, {
    USE_PROFILES: { html: true, mathMl: true },
    ADD_ATTR: ["data-tex", "data-display", "role", "tabindex", "aria-label"],
  });
}

export function safeMarkedInto(element, raw) {
  if (!element) return;
  const source = String(raw ?? "");
  SOURCE_BY_ELEMENT.set(element, source);
  try {
    element.innerHTML = renderMarkdown(source);
  } catch {
    element.textContent = source;
  }
}

export function getMarkdownSource(element) {
  return SOURCE_BY_ELEMENT.get(element) ?? "";
}

// 긴 증명이나 행렬을 스트리밍할 때 매 청크마다 전체 Markdown/KaTeX를
// 다시 파싱하지 않는다. 일정 간격으로 최신 누적본만 렌더하고 마지막에는
// 반드시 원문 전체를 한 번 확정 렌더한다.
export function createProgressiveMarkdownRenderer(
  element,
  { interval = MATH_RENDER_INTERVAL_MS, onRender } = {},
) {
  let source = "";
  let timer = null;
  let lastRenderAt = 0;

  const now = () =>
    globalThis.performance?.now?.() ?? Date.now();

  const render = () => {
    timer = null;
    lastRenderAt = now();
    safeMarkedInto(element, source);
    onRender?.();
  };

  element?.classList?.add("is-streaming-markdown");

  return {
    append(chunk) {
      source += String(chunk ?? "");
      if (timer !== null) return;
      const wait = Math.max(0, interval - (now() - lastRenderAt));
      timer = setTimeout(render, wait);
    },
    finish() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      safeMarkedInto(element, source);
      element?.classList?.remove("is-streaming-markdown");
      onRender?.();
      return source;
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      element?.classList?.remove("is-streaming-markdown");
    },
    get source() {
      return source;
    },
  };
}
