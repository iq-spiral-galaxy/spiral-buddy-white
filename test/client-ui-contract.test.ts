import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  html,
  app,
  brandCss,
  productCss,
  helixCss,
  learningHub,
  electronMain,
  mcp,
] =
  await Promise.all([
  readFile(new URL("../client/index.html", import.meta.url), "utf8"),
  readFile(new URL("../client/app.js", import.meta.url), "utf8"),
  readFile(new URL("../client/white-brand.css", import.meta.url), "utf8"),
  readFile(new URL("../client/product-polish.css", import.meta.url), "utf8"),
  readFile(new URL("../client/helix.css", import.meta.url), "utf8"),
  readFile(new URL("../client/learning-hub.js", import.meta.url), "utf8"),
  readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
  readFile(new URL("../src/mcp.ts", import.meta.url), "utf8"),
]);

describe("client UI contracts", () => {
  test("workspace management lives in Settings, not the primary sidebar", () => {
    assert.doesNotMatch(html, /id="workspace-section"/);
    assert.match(html, /data-panel="workspaces"/);
    assert.match(html, /id="settings-workspace-active-name"/);
    assert.doesNotMatch(app, /renderWorkspaceSelector/);
    const initSettings = app.slice(
      app.indexOf("async function initSettings()"),
      app.indexOf("// v0.5.32+ — 업데이트 banner"),
    );
    assert.ok(
      initSettings.indexOf('addEventListener("click", openSettingsModal)') <
        initSettings.indexOf("await getSettingsWithTimeout()"),
      "the Settings button must be wired before the initial IPC request",
    );
    assert.match(app, /function getSettingsWithTimeout\(timeoutMs = 8_000\)/);
    assert.match(html, /id="settings-load-state"[^>]*aria-live="polite"/);
    assert.match(app, /element\.inert = blocked/);
    assert.match(app, /setSettingsLoadState\("loading"\)/);
  });

  test("sidebar search is self-evident without a repeated heading", () => {
    assert.match(
      html,
      /class="sidebar-search-section" role="search" aria-label="챕터 찾기"/,
    );
    assert.doesNotMatch(html, /id="sidebar-search-title"/);
    assert.match(html, /aria-controls="roadmap-list chapter-list"/);
    assert.match(html, /placeholder="챕터 찾기"/);
    assert.match(html, /aria-label="챕터 찾기"/);
    assert.doesNotMatch(html, /현재 경로에서 챕터 찾기/);
    assert.match(html, /id="sidebar-search-meta"[^>]*aria-live="polite"/);
    assert.doesNotMatch(html, /입력하는 즉시 학습 목록을 좁혀요/);
    assert.doesNotMatch(app, /입력하는 즉시 학습 목록을 좁혀요/);
    assert.match(brandCss, /\.sidebar-search-wrap:focus-within/);
    assert.ok(
      (app.match(/cancelPending\(\);/g) ?? []).length >= 3,
      "typing, Escape and the clear button must cancel stale debounce work",
    );
    assert.match(
      app,
      /classList\.contains\("sidebar-collapsed"\)[\s\S]*?sidebarToggle\?\.click\(\)/,
    );
  });

  test("the learning home opens directly with ambient geometry and a clear next action", () => {
    assert.doesNotMatch(html, /SPIRAL · BLUE/);
    assert.doesNotMatch(app, /SPIRAL · BLUE/);
    assert.doesNotMatch(html, /반복은 제자리가 아니라/);
    assert.doesNotMatch(app, /반복은 제자리가 아니라/);
    assert.doesNotMatch(learningHub, /반복은 제자리가 아니라/);
    assert.match(html, /id="blue-welcome-geometry"/);
    assert.match(html, /id="blue-organic-loop"/);
    assert.match(html, /id="blue-vortex-stack"/);
    assert.match(html, /class="blue-vortex-band"/);
    assert.match(html, /class="blue-vortex-line"/);
    assert.doesNotMatch(html, /<use href="#blue-welcome-geometry"><\/use>/);
    assert.doesNotMatch(app, /<use href="#blue-welcome-geometry"><\/use>/);
    assert.doesNotMatch(html, /class="hub-hero hub-hero--geometry"/);
    assert.doesNotMatch(app, /WELCOME_EMPTY_HTML/);
    assert.match(learningHub, /class="hub-ambient-geometry"/);
    assert.match(learningHub, /<use href="#blue-welcome-geometry"><\/use>/);
    assert.doesNotMatch(learningHub, /class="hub-hero/);
    assert.match(learningHub, /class="hub-focus"/);
    assert.match(learningHub, /data-hub-action="\$\{primaryAction\}"/);
    assert.match(learningHub, /class="hub-progress"/);
    assert.doesNotMatch(learningHub, /class="hub-flow"/);
    assert.match(
      app,
      /function renderLearningHub\(\{ loading = false \} = \{\}\)/,
    );
    assert.match(helixCss, /\.hub-ambient-geometry/);
    assert.doesNotMatch(helixCss, /\.hub-hero--geometry/);
    const bootstrap = app.slice(
      app.indexOf('document.addEventListener("DOMContentLoaded"'),
      app.indexOf("function wireEvents()"),
    );
    assert.ok(
      bootstrap.indexOf("renderLearningHub({ loading: true });") <
        bootstrap.indexOf("await loadInitial();"),
      "the learning home should render before initial data requests finish",
    );
    assert.match(app, /if \(!state\.session\) renderLearningHub\(\{ loading: true \}\);/);
    assert.doesNotMatch(html, /welcome-steps/);
  });

  test("secondary navigation stays compact and avoids duplicate next-learning UI", () => {
    assert.doesNotMatch(html, /id="suggestion-box"/);
    assert.doesNotMatch(app, /refreshLearningRecommendation|renderSuggestion/);
    assert.doesNotMatch(app, /오늘의 학습/);

    const lookupToggle = html.slice(
      html.indexOf('id="lookup-toggle"'),
      html.indexOf("</button>", html.indexOf('id="lookup-toggle"')),
    );
    assert.match(lookupToggle, /aria-label="보조 노트 열기"/);
    assert.doesNotMatch(lookupToggle, /<span>/);
    assert.doesNotMatch(html, /class="lookup-panel-title"/);
    assert.match(
      helixCss,
      /#actions \.lookup-toggle-btn \{[\s\S]*?width: 36px !important;/,
    );
  });

  test("global search uses one compact input surface without instructional chrome", () => {
    assert.match(html, /placeholder="로드맵 · 챕터 · 노트 검색"/);
    assert.match(
      html,
      /id="search-input"[^>]*role="combobox"[^>]*aria-expanded="false"/,
    );
    assert.match(html, /id="search-close-btn"[^>]*aria-label="검색 닫기"/);
    assert.match(html, /id="search-status"[^>]*role="status"[^>]*aria-live="polite"/);
    assert.doesNotMatch(html, /search-footer|search-esc-hint/);
    assert.doesNotMatch(app, /최소 2글자 입력해 검색/);
    assert.match(app, /els\.searchResults\?\.replaceChildren\(\)/);
    assert.match(app, /_searchState\.inflight = null;[\s\S]*?clearSearchResults\(\);/);
    assert.match(app, /document\.activeElement === last/);
    assert.match(app, /aria-activedescendant/);
    assert.match(
      helixCss,
      /#search-modal #search-input[\s\S]*?border: 0 !important;[\s\S]*?box-shadow: none !important;/,
    );
    assert.match(helixCss, /\.search-results:empty \{[\s\S]*?display: none;/);
  });

  test("the learning home appears before slow secondary requests and survives start failures", () => {
    const noRoadmapBranch = app.slice(
      app.indexOf("// 설치된 로드맵 없으면 placeholder"),
      app.indexOf("} catch (err)", app.indexOf("// 설치된 로드맵 없으면 placeholder")),
    );
    assert.ok(
      noRoadmapBranch.indexOf("renderLearningHub();") <
        noRoadmapBranch.indexOf("await loadCuratedAvailable();"),
    );
    const roadmapLoader = app.slice(
      app.indexOf("async function loadRoadmapData()"),
      app.indexOf("// ─────────────────────────────────────────", app.indexOf("async function loadRoadmapData()")),
    );
    assert.match(
      roadmapLoader,
      /state\.chapters = chaptersRes\.chapters \?\? \[\];[\s\S]*?renderLearningHub\(\);/,
    );
    const sessionStart = app.slice(
      app.indexOf("async function startSession(chapterId)"),
      app.indexOf("async function submitMessage()", app.indexOf("async function startSession(chapterId)")),
    );
    assert.match(
      sessionStart,
      /if \(!res\.ok\)[\s\S]*?state\.session = \{[\s\S]*?els\.messages\.innerHTML = "";/,
    );
    assert.match(
      sessionStart,
      /state\.session = null;[\s\S]*?renderLearningHub\(\);/,
    );
  });

  test("roadmap rows keep compact progress beside the title and dates in disclosure", () => {
    assert.match(app, /class="roadmap-item-heading"/);
    assert.match(app, /class="roadmap-item-brief"/);
    assert.match(app, /title="\$\{escapeAttr\(lastDateLabel\)\}"/);
    assert.doesNotMatch(
      app.slice(
        app.indexOf("function renderSubRoadmapItem"),
        app.indexOf("// 사이드바 expand 상태"),
      ),
      /class="roadmap-item-date"/,
    );
    assert.match(
      helixCss,
      /\.progress-mini \{[\s\S]*?height: 6px !important;/,
    );
    assert.doesNotMatch(html, /class="suggestion"/);
  });

  test("session actions use short labels that describe their real behavior", () => {
    assert.match(html, /id="quiz-btn"[\s\S]*?<span>퀴즈<\/span>/);
    assert.match(app, /next\.level === 1 \? "퀴즈" : `퀴즈 · \$\{next\.level\}`/);
    assert.match(html, /id="end-btn"[\s\S]*?<span>마치고 저장<\/span>/);
    assert.match(electronMain, /"마치고 저장"을 먼저 누르세요/);
    assert.match(html, /id="refine-btn"[\s\S]*?<span>다듬기<\/span>/);
    assert.match(app, /문장을 다듬는 중…/);
    assert.match(html, /aria-label="학습 대화 입력"/);
    assert.match(app, /궁금한 점이나 이해한 내용을 적어보세요\./);
    assert.doesNotMatch(app, /Enter로 보내기/);
  });

  test("workspace settings keep secondary information quiet and actions obvious", () => {
    assert.match(html, /<div class="settings-divider"><span>학습 자료<\/span><\/div>/);
    assert.doesNotMatch(html, /iq-dev-lab 학습 자료/i);
    assert.doesNotMatch(html, /워크스페이스마다 vault 안의 별도 폴더/);
    assert.match(html, /class="current-workspace-icon"/);
    assert.doesNotMatch(html, /📍 현재 워크스페이스/);
    assert.match(
      brandCss,
      /\.settings-wizard-link \{[\s\S]*?border: 1px solid var\(--blue-line\) !important;[\s\S]*?box-shadow: var\(--blue-shadow-sm\) !important;/,
    );
  });

  test("White note paths stay edition-safe while preserving explicit workspaces", () => {
    assert.match(app, /const DEFAULT_VAULT_SUBDIR = "spiral-buddy-white"/);
    assert.match(
      app,
      /w\.vaultSubDir \?\? DEFAULT_VAULT_SUBDIR/,
    );
    assert.match(
      app,
      /ws\.vaultSubDir \?\? DEFAULT_VAULT_SUBDIR/,
    );
    assert.doesNotMatch(app, /vaultSubDir \?\? "spiral-buddy"/);
    assert.doesNotMatch(app, /vault의 spiral-buddy\/\.trash\//);
    assert.match(app, /이 워크스페이스의 휴지통으로 이동/);

    assert.match(
      mcp,
      /process\.env\.SPIRAL_VAULT_SUBDIR\?\.trim\(\) \|\| "spiral-buddy-white"/,
    );
    assert.match(mcp, /const notesRoot = path\.join\(vaultPath, vaultSubDir\)/);
    assert.match(mcp, /path\.resolve\(notesRoot, relative_path\)/);
    assert.match(mcp, /path\.join\(notesRoot, rp\)/);
    assert.doesNotMatch(
      mcp,
      /path\.join\(vaultPath, "spiral-buddy-white"/,
    );
    assert.doesNotMatch(mcp, /vault의 spiral-buddy\/\.trash\//);
    assert.match(mcp, /현재 White 워크스페이스의 \.trash\//);

    assert.match(
      electronMain,
      /if \(Array\.isArray\(raw\.workspaces\)\) return ensureSonnetDefault\(dedupeWorkspaces\(raw\)\)/,
    );
    assert.match(
      electronMain,
      /if \(ws\?\.vaultSubDir\) process\.env\.SPIRAL_VAULT_SUBDIR = ws\.vaultSubDir/,
    );
  });

  test("current learning location expands, scrolls and remains keyboard discoverable", () => {
    assert.match(
      html,
      /id="roadmap-current"[\s\S]*?aria-controls="roadmap-list"[\s\S]*?aria-expanded="false"/,
    );
    assert.match(app, /function expandActiveRoadmapPath\(\)/);
    assert.match(app, /state\.expandedLocalDomains\.add\(domName\)/);
    assert.match(app, /state\.expandedLocalCategories\.add\(`\$\{domName\}::\$\{catName\}`\)/);
    assert.match(app, /state\.expandedLocalRepos\.add\(`\$\{domName\}::\$\{catName\}::\$\{repo\}`\)/);
    assert.match(app, /function revealActiveLearningLocation\(\)/);
    assert.match(
      app,
      /roadmapCurrent\.addEventListener\("click", \(event\) => \{[\s\S]*?event\.stopPropagation\(\)/,
    );
    assert.match(app, /class="current-chapter-jump"/);
    assert.match(
      app,
      /class="current-chapter-jump"[\s\S]*?aria-controls="roadmap-list"[\s\S]*?aria-expanded=/,
    );
    assert.match(
      app,
      /querySelector\("\.current-chapter-jump"\)[\s\S]*?setAttribute\("aria-expanded", String\(open\)\)/,
    );
    assert.match(app, /const currentChapterTrigger =/);
    assert.doesNotMatch(app, /!els\.topbar\?\.contains\(e\.target\)/);
    assert.match(app, /scrollActiveRoadmapIntoView/);
    assert.match(brandCss, /\.roadmap-reveal-target/);
  });

  test("saving the setup wizard from a running app restarts instead of double-booting", () => {
    assert.match(
      electronMain,
      /async function activateSavedSetupConfig\(cfg, relaunchAfterSave\)/,
    );
    assert.match(
      electronMain,
      /const relaunchAfterSave = Boolean\(serverStarted\)/,
    );
    assert.match(electronMain, /"저장하고 다시 시작"/);
    assert.match(electronMain, /"마치고 저장"을 눌러주세요/);
    assert.match(
      electronMain,
      /if \(relaunchAfterSave\) \{[\s\S]*?app\.relaunch\(\);[\s\S]*?app\.exit\(0\);/,
    );
    assert.match(
      electronMain,
      /return activateSavedSetupConfig\(existing, relaunchAfterSave\)/,
    );
    assert.match(
      electronMain,
      /return activateSavedSetupConfig\(cfg, relaunchAfterSave\)/,
    );
  });

  test("light composer has clear input and action surfaces with rounded desktop junctions", () => {
    assert.match(
      brandCss,
      /body\.light-mode \.composer #input \{[\s\S]*?background: transparent !important;/,
    );
    assert.match(
      brandCss,
      /body\.light-mode \.composer #input:focus \{[\s\S]*?inset 0 -2px 0 var\(--blue-cobalt\)[\s\S]*?outline: none !important;/,
    );
    assert.match(
      brandCss,
      /#topbar \{[\s\S]*?border-bottom-left-radius: 16px !important;/,
    );
    assert.match(
      brandCss,
      /\.composer \{[\s\S]*?border-top-left-radius: 16px !important;/,
    );
    assert.match(
      productCss,
      /body\.light-mode \.composer #input,[\s\S]*?border: 1px solid var\(--white-line\) !important;/,
    );
    assert.match(
      productCss,
      /body\.light-mode \.composer-btn-col \{[\s\S]*?border: 1px solid var\(--white-line\);/,
    );
    assert.match(
      productCss,
      /\.composer-btn-col \{[\s\S]*?flex: 0 0 112px;[\s\S]*?grid-template-rows: repeat\(3, 36px\);/,
    );
    assert.match(
      productCss,
      /\.composer-btn-col[\s\S]*?> :is\(\.mic-btn, \.refine-btn, \.send-btn\) \{[\s\S]*?align-self: stretch !important;[\s\S]*?width: 100% !important;[\s\S]*?max-width: 100% !important;[\s\S]*?height: 36px !important;[\s\S]*?flex-direction: row !important;/,
    );
    assert.match(
      productCss,
      /body\.light-mode[\s\S]*?:is\([\s\S]*?#input,[\s\S]*?textarea\.lookup-direct-input,[\s\S]*?\.lookup-direct-context,[\s\S]*?\.lookup-question-text[\s\S]*?\)::placeholder \{[\s\S]*?background: transparent !important;[\s\S]*?background-color: transparent !important;/,
    );
    assert.match(html, /white-brand\.css\?v=0\.6\.12/);
    assert.match(html, /helix\.css\?v=0\.6\.12/);
    assert.match(html, /product-polish\.css\?v=0\.6\.12/);
    assert.match(html, /app\.js\?v=0\.6\.12/);
  });

  test("the 820px mobile shell keeps the main column visible and hides inert resizers", () => {
    const mobileHelix = helixCss.slice(
      helixCss.indexOf("@media (max-width: 820px)"),
      helixCss.indexOf("@media (max-width: 560px)"),
    );
    assert.match(
      mobileHelix,
      /body\.sidebar-collapsed,[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 0 !important;/,
    );
    assert.match(
      mobileHelix,
      /#sidebar-resizer,[\s\S]*?#lookup-resizer \{[\s\S]*?display: none !important;/,
    );
    assert.match(
      mobileHelix,
      /body\.lookup-open \.lookup-panel,[\s\S]*?position: fixed;/,
    );
  });

  test("chapter progress separates current, completed, upcoming and recent", () => {
    assert.match(app, /state\.session\?\.chapterId \?\? null/);
    assert.match(
      app,
      /const progressState = isActive[\s\S]*?"current"[\s\S]*?"completed"[\s\S]*?"upcoming"/,
    );
    assert.match(app, /li\.classList\.add\(`chapter-item--\$\{progressState\}`\)/);
    assert.match(app, /class="chapter-last-badge"/);
    assert.match(app, /b\.modifiedAt \?\? b\.date/);
    assert.match(app, /class="chapter-actions-toggle"/);
    assert.match(app, /--chapter-step-tone/);
    assert.match(app, /chapter-item--roadmap-complete/);
    assert.match(app, /chapter-item--journey-complete/);
    assert.match(brandCss, /\.chapter-item--completed::before/);
    assert.match(brandCss, /\.chapter-item--upcoming/);
    assert.match(brandCss, /\.chapter-item--journey-complete/);
    assert.match(brandCss, /var\(--blue-success\)/);
    assert.match(
      brandCss,
      /\.chapter-item--completed:not\(\.chapter-item--active\)[\s\S]*?\.num \{[\s\S]*?color: var\(--blue-cobalt-strong\) !important;/,
    );
    assert.match(brandCss, /@media \(hover: none\), \(pointer: coarse\)/);
  });

  test("sidebar headings, chapter menu and activity footer stay visually flat", () => {
    assert.match(
      brandCss,
      /#sidebar h2::after,[\s\S]*?content: none !important;/,
    );
    assert.match(app, /<span class="chapter-action-label">미리보기<\/span>/);
    assert.match(app, /<span class="chapter-action-label">노트 열기<\/span>/);
    assert.match(app, /<span class="chapter-action-label">노트 삭제<\/span>/);
    assert.match(
      brandCss,
      /\.chapter-item:has\(\.chapter-actions\.actions-open\) \{[\s\S]*?z-index: 20;/,
    );
    assert.match(
      brandCss,
      /#sidebar[\s\S]*?> \.trash-section[\s\S]*?padding: 0 !important;/,
    );
    assert.match(
      brandCss,
      /> \.trash-section[\s\S]*?> \.trash-open-btn[\s\S]*?border: 0 !important;/,
    );
    assert.match(
      brandCss,
      /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.chapter-item:hover \.chapter-meta,[\s\S]*?display: inline-flex;/,
    );
  });

  test("the session depth badge stays attached to its chapter title", () => {
    assert.match(app, /<button class="current-chapter-jump"/);
    assert.match(
      app,
      /<strong class="topbar-chapter-title"[\s\S]*?<span class="depth">depth \$\{state\.session\.depth\}<\/span>/,
    );
    assert.match(
      brandCss,
      /\.topbar-chapter-title \{[\s\S]*?flex: 0 1 auto;/,
    );
    assert.match(
      brandCss,
      /#current-chapter \.depth \{[\s\S]*?margin-left: 0 !important;/,
    );
  });

  test("history details are disclosed on demand with explicit actions", () => {
    assert.match(app, /<details class="history-disclosure">/);
    assert.match(app, /history-conversation-btn/);
    assert.match(app, /class="history-date"/);
    assert.doesNotMatch(app, /li\.setAttribute\("role", "button"\)/);
    assert.match(brandCss, /cursor: default !important/);
  });

  test("user labels and content share a stable right-aligned reading row", () => {
    assert.match(
      brandCss,
      /\.messages \.message\.user \{[\s\S]*?display: grid !important;[\s\S]*?justify-items: end;/,
    );
    assert.match(
      brandCss,
      /\.message\.user \.content \{[\s\S]*?width: fit-content !important;[\s\S]*?justify-self: end;/,
    );
  });

  test("all message surfaces share safe progressive Markdown and raw-source copy", () => {
    assert.match(app, /createProgressiveMarkdownRenderer/);
    assert.match(app, /copyText/);
    assert.match(app, /getMarkdownSource/);
    assert.match(app, /renderMarkdown\(cleanUiLabel\(item\)\)/);

    const lookupStream = app.slice(
      app.indexOf("async function streamMarkdownInto"),
      app.indexOf("async function runLookup"),
    );
    assert.match(lookupStream, /createProgressiveMarkdownRenderer\(bodyEl\)/);
    assert.match(lookupStream, /renderer\.append\(chunk\)/);
    assert.match(lookupStream, /renderer\.finish\(\)/);

    const sessionStream = app.slice(
      app.indexOf("async function streamInto"),
      app.indexOf("function appendUserMessage"),
    );
    assert.match(sessionStream, /createProgressiveMarkdownRenderer\(contentEl/);
    assert.match(sessionStream, /renderer\.append\(chunk\)/);
    assert.match(sessionStream, /const raw = renderer\.finish\(\)/);

    const userMessage = app.slice(
      app.indexOf("function appendUserMessage"),
      app.indexOf("function appendAssistantMessage"),
    );
    assert.match(userMessage, /safeMarkedInto\(div\.querySelector\("\.content"\), text\)/);
    assert.doesNotMatch(userMessage, /\.textContent = text/);

    const lookupCard = app.slice(
      app.indexOf("function createLookupCard"),
      app.indexOf("async function streamMarkdownInto"),
    );
    assert.match(lookupCard, /getMarkdownSource\(bodyEl\)/);
    assert.match(lookupCard, /await copyText\(source\)/);
    assert.match(lookupCard, /복사하지 못했어요/);

    const transcript = app.slice(
      app.indexOf("function showPastConversationModal"),
      app.indexOf("let _sessionStartInFlight"),
    );
    assert.match(transcript, /safeMarkedInto\(contentEl/);

    const previewCard = app.slice(
      app.indexOf("function _renderAiCardMarkdown"),
      app.indexOf("/** CSS.escape polyfill"),
    );
    assert.match(previewCard, /renderMarkdown\(String\(value/);
    assert.match(previewCard, /_renderAiCardMarkdown\(card\.summary\)/);
    assert.doesNotMatch(previewCard, /escapeHtml\(card\.summary\)/);
  });

  test("theme migration and labels stay consistent without decorative emoji", () => {
    assert.match(app, /spiral-buddy:theme:v3/);
    assert.doesNotMatch(app, /spiral-buddy:theme:v2/);
    assert.match(
      app,
      /localStorage\.getItem\(THEME_KEY\) \|\| "light"/,
    );
    assert.match(app, /function displayRepoName\(name\) \{[\s\S]*?cleanUiLabel\(name\)/);
    assert.match(app, /const displayTitle = cleanUiLabel\(ch\.title\)/);
    assert.doesNotMatch(app, /[📕🔖📝🎤📖💬🎉✓✗❌⚠]/u);
  });
});
