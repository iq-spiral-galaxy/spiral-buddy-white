# Phase 1 — MCP Integration

웹앱(Phase 0.5)과 별개로, Claude Desktop에서 spiral-buddy를 도구로 쓸 수 있게 MCP 서버 추가.

## 아키텍처 결정: Hybrid

웹앱 폐기하고 MCP만 가는 것도 가능했지만 그러지 않은 이유:
- 웹앱의 UX 자산(챕터 진도 뱃지, 마크다운 렌더링, suggestion UI)이 잘 작동 검증됨
- MCP에선 Claude가 시스템 프롬프트를 strictly 따르지 않아서 8섹션 구조 보장이 약해짐
- 둘 다 같은 코어 모듈(roadmap/vault/spiral) 공유 → 유지비용 ~0

웹앱과 MCP는 서로 다른 사용 시나리오:
- **웹앱**: 한 챕터를 집중해서 깊게 학습할 때. session-driven, structured.
- **MCP**: 다른 작업/대화 중에 spiral-buddy 데이터를 가볍게 참조/저장할 때. chat-driven, ad-hoc.

## 등록된 도구 5개

도구 인터페이스가 minimal한 이유: MCP-native 접근. Claude가 list_chapters + list_notes 보고 직접 판단하게 두는 게 도구로 미리 결정해주는 것보다 자연스러움. spiral suggestion 로직은 도구로 노출하지 않음.

1. **`spiral_list_chapters`** — 로드맵의 모든 챕터 + 각 챕터별 visit count, max depth, last date
2. **`spiral_get_chapter_context`** — 챕터 원문 + 이전 노트들 + nextDepth (세션 시작용)
3. **`spiral_list_notes`** — 과거 노트 인덱스 (메타데이터만, body 제외)
4. **`spiral_read_note`** — 특정 노트의 전체 본문
5. **`spiral_save_note`** — 8섹션 구조 노트를 vault에 저장 (Claude가 body 생성)

## 검증할 것 (Phase 0.5에서 이어짐)

Phase 0.5의 가설 H1/H2/H3는 여전히 검증 대상. MCP는 그 검증을 더 폭넓게 가능하게 함:
- H1 (로드맵 주도가 그냥 채팅보다 학습 효과 있나) — Claude Desktop에서 일상 채팅 중 spiral 흐름이 자연스럽게 들어가는지
- H2 (자동 노트가 1주 뒤 쓸 만한가) — 웹앱과 동일
- H3 (나선형 감지가 의미 있는 연결을 찾나) — MCP에선 Claude가 직접 판단하므로 결과가 다를 수 있음

MCP-specific 가설 추가:
- H4: Claude가 스스로 도구 호출 순서를 자연스럽게 결정하는가 (`list_chapters` → `get_chapter_context` → ... → `save_note`)
- H5: `save_note`의 8섹션 강제가 description만으로 충분한가, 아니면 validation 필요한가

## 알려진 한계

- 시스템 프롬프트가 없어서 Socratic 스타일이 보장되지 않음. Claude의 default 응답 스타일에 의존.
- session 단위가 명시적이지 않음. 사용자가 "마무리하자" 같은 신호를 줘야 함.
- 토큰 비용이 사용자 Claude 구독에 흡수 (장점이자 단점)

## 다음

Phase 2 후보:
- (a) Tauri로 웹앱 패키징 → 일반 사용자 배포 가능한 standalone .app
- (b) Obsidian 플러그인 → vault 내부에서 직접 동작 (외부 도구 없음)
- (c) 시스템 프롬프트 자동 주입 가능한 MCP 패턴 발견 시 H5 실험
