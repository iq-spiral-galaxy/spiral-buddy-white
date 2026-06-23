# 다음에 고민할 것들 — 깊은 분석

Phase 2.3 시점의 평가와, 무엇을 다음에 할지에 대한 솔직한 분석.

## 현재 상태 — 무엇이 진짜로 동작하나

### 동작이 검증된 것 ✅

- 동적 로드맵 탐지 (286개까지 잘 잡힘)
- GitHub Curated 클론 (on-demand, 캐시 정상)
- 8섹션 노트 생성 + 누락 자동 보충
- 옛 스키마 노트 호환 매칭
- MCP 7개 도구 (Claude Desktop에서 자연어로 사용 가능)
- 세션 인터럽트 3-way (저장/폐기/취소)
- End 진행 카드 (SSE 단계 시각화)
- 사이드바 3-level 계층 (Category → Repo → Sub-roadmap)
- 모델 선택 (Opus 4.7/4.6, Sonnet 4.6, Haiku 4.5)

### 아직 검증 안 된 핵심 가설 — 진짜 문제는 여기

| 가설 | 측정 가능한가 | 현재 상태 |
|---|---|---|
| **H1** — 로드맵 주도 세션이 그냥 채팅보다 학습 효과가 좋다 | 어려움 (주관적) | 미검증. dogfood 1-2주 후 본인 회고 필요 |
| **H2** — 자동 생성된 노트가 나중에 다시 봤을 때 쓸 만하다 | 측정 가능 (재방문 시 cite 빈도) | 미검증. 1개월+ 노트 축적 후 자기 평가 |
| **H3** — 나선형 감지(deeper/cross-link)가 의미 있는 연결을 찾는다 | 측정 가능 (사용자가 추천 따라가는 비율 / 추천 정확도) | 미검증. 추천 따라간 vs 무시한 비율 로그 필요 |

**이 셋이 검증 안 되면 다른 기능 추가는 무의미**. 다음 작업 1순위는 dogfood + 로깅.

---

## Tier 1 — 다음 1-2주 (dogfood + 핵심 부족점)

### 1.1 의미 있는 분석 로그 ⭐⭐⭐⭐⭐

**문제**: H3(나선형 감지)를 검증하려면 데이터가 필요한데 지금 없음. Claude의 suggestion이 정확한지 어떻게 알 수 있나?

**제안**:
- `<vault>/spiral-buddy/.metrics/` 폴더에 JSONL로 추적
  - `suggestions.jsonl` — suggest API 호출마다 `{ts, roadmapId, recommendedChapterId, mode, rationale}`
  - `sessions.jsonl` — 세션 시작/종료마다 `{ts, sessionId, chapterId, depth, suggestedByClaude: boolean, elapsedMs, inputTokens, outputTokens, model}`
  - `notes.jsonl` — 노트 저장마다 `{ts, path, depth, chapterId, bodyChars, missingSections, tags}`
- 간단한 분석 화면 (`/metrics` 라우트): 일별 세션 수, 평균 depth, 추천 따라간 비율, 가장 자주 deeper-layer로 돌아간 챕터 top-10

**왜 이게 첫 번째인가**: 도구의 핵심 가치를 검증할 데이터를 쌓아야 다음 결정을 정량적으로 할 수 있다. 지금은 직감으로만 평가 중.

### 1.2 세션 복원 (탭 닫혀도 살아남기) ⭐⭐⭐⭐

**문제**: 세션이 in-memory만 살아있어서 탭 닫으면 사라짐. `beforeunload` 경고는 있지만 컴퓨터 sleep, 브라우저 크래시, 노트북 닫음 등엔 무용.

**제안**:
- session-store.ts를 `<package>/.cache/sessions/<id>.json`에 주기적 flush (메시지 추가될 때마다)
- 부팅 시 .cache에 미완료 세션 있으면 자동 복원 + 사용자에게 "이전에 진행 중이던 X 세션이 있어요. 이어서 학습할까요?" 카드 노출
- 24시간 이상 된 미완료 세션은 자동 정리

**구현 난이도**: 중. SessionStore에 fs write 로직 추가, 부팅 시 복원 흐름 추가.

### 1.3 노트 검색/조회 ⭐⭐⭐⭐

**문제**: 옵시디언에서 검색은 가능하지만, spiral-buddy 안에서 "이거 비슷한 거 본 적 있나?" 묻기 어려움. 사이드바의 "Past sessions"는 현재 로드맵 기준만 보여줌.

**제안**:
- 사이드바 상단에 검색 박스 (Cmd+K): 노트 title/topic/tags/summary 검색
- 검색 결과 클릭 시 옵시디언으로 열림 (`obsidian://`)
- 또는: 진행 중 세션에 노트를 "참고 컨텍스트로 추가" 버튼 (Claude에게 이 노트도 알려주기)

### 1.4 챕터 본문 미리보기 ⭐⭐⭐

**문제**: 챕터 클릭 → 즉시 세션 시작. 챕터 내용이 뭔지 미리 못 봄.

**제안**:
- 챕터 hover 시 tooltip으로 첫 200자
- 또는 챕터 우측에 👁 버튼 → 모달로 본문 보기
- 학습 시작 전에 "이거 너무 어렵겠다, 다른 거 할까" 판단 가능

### 1.5 SPIRAL_ROADMAP_PATH legacy 제거 ⭐⭐

지금까지 backward compat 유지했는데 사용자(너)가 ROADMAP_ROOT 잘 쓰고 있음. 코드 단순화 위해 다음 마이너 버전에서 deprecation 경고 + 한 두 버전 후 제거.

---

## Tier 2 — 다음 1개월 (학습 효과 증폭)

### 2.1 진짜 spiral 평가 — 챕터 재방문 시 "지난 번에 헷갈렸던 것" 자동 확인 ⭐⭐⭐⭐⭐

**문제**: 현재 `spiral_get_chapter_context`가 이전 노트를 보여주긴 하지만, Claude가 "지난번에 어디서 막혔는지" 명확히 활용하는지 불확실.

**제안**:
- 노트의 "헷갈렸던 / 확인이 필요한 지점" 섹션을 **구조화된 형식**으로 (지금은 자유 텍스트)
  ```yaml
  uncertainties:
    - claim: "트랜잭션 isolation은 lock으로만 구현된다"
      type: "false-belief"
      revisit_priority: "high"
    - claim: "MVCC와 snapshot isolation의 차이"
      type: "fuzzy-understanding"
      revisit_priority: "medium"
  ```
- 다음 세션 시작 시 Claude가 이 목록 봐서 첫 질문 자동 생성
- 사용자가 다시 답하면 그 uncertainty를 `resolved: true`로 마킹 또는 새 uncertainty 추가

**효과**: 진짜 의미의 spiral. 지금은 "이전 노트 있다"까지만 알지 "정확히 뭘 다시 봐야 하는지" 모름.

### 2.2 멀티 vault / 멀티 user ⭐⭐

지금은 단일 vault 가정. 다른 사람도 같은 노트 vault 공유하면 충돌 가능.

**제안**: `<vault>/spiral-buddy/<username>/` 하위 구분. 단일 user면 그대로, 멀티면 디렉토리만 분리.

**현실성**: 학습 도구는 보통 1인 1 vault. 우선순위 낮음.

### 2.3 학습 통계 시각화 ⭐⭐⭐

1.1에서 쌓은 로그 기반:
- 일주일/한 달 학습 시간 차트
- depth 분포 (얼마나 깊이 갔는지)
- 카테고리별 균형 (Spring만 너무 많이 했다면 알림)
- "이번 주 가장 자주 cross-link된 챕터" 등 인사이트

D3 또는 Chart.js로 간단히. 사이드바 외 별도 `/insights` 페이지.

### 2.4 노트 품질 자동 평가 ⭐⭐⭐

**문제**: 8섹션 모두 채워졌어도 그게 진짜 가치 있는 노트인지 모름.

**제안**:
- 매주 일요일에 지난 주 노트들 Claude에게 batch로 평가시키기:
  - "각 노트가 1주 뒤에 다시 봤을 때 도움 될 정보를 담고 있는가? 1-5점."
  - 낮은 점수 노트는 "이 챕터 다시 학습 권장" 알림
- 노트 metadata에 `quality_score` 추가

### 2.5 챕터 진행 추천의 명시성 ⭐⭐⭐

**문제**: `suggest` API가 "transactions/01-acid 챕터를 deeper-layer로" 같이 명확히 알려줘도, 사용자가 "왜?"를 모름.

**제안**:
- suggestion 카드에 "근거 펼치기" 토글
- 펼치면 Claude가 참고한 이전 노트 발췌 + 추론 과정
- 사용자가 동의 안 하면 "다른 추천 보기" → 두 번째 추천

---

## Tier 3 — 더 멀리 (커뮤니티 / 플랫폼화)

### 3.1 Obsidian 플러그인 ⭐⭐⭐⭐

**현재 한계**: 웹앱은 별도 브라우저 탭에서 실행. 옵시디언과 컨텍스트 스위칭 발생.

**제안**: Obsidian 플러그인으로 right-pane에 spiral-buddy UI 임베드. 노트 클릭 즉시 spiral-buddy가 그 노트의 챕터 학습 세션 제안.

**난이도**: 큼. 웹앱 코드 재사용 가능하지만 Obsidian Plugin API 학습 필요. Tauri 대신 이 방향이 더 학습 친화적.

**현실성**: 옵시디언 사용자가 학습 도구 주 타겟이므로 가치 큼.

### 3.2 다중 Curated org 지원 ⭐⭐⭐

지금은 `SPIRAL_CURATED_ORG` 하나만. 여러 조직 동시 큐레이션 못 함.

**제안**: 쉼표로 구분 `SPIRAL_CURATED_ORGS=iq-dev-lab,iq-ai-lab,another-org`. UI에서 조직별 탭 또는 통합 표시.

### 3.3 노트 백링크 자동화 ⭐⭐⭐

지금은 frontmatter의 `related:` 필드에 Claude가 판단한 관련 노트만 추가. 옵시디언의 강력한 백링크/그래프 뷰를 활용 못 함.

**제안**: 노트 본문에 `[[2026-05-10-acid-d1]]` 같은 위키링크를 Claude가 자동 삽입 (cross-link 모드일 때 특히). 옵시디언 그래프 뷰에서 학습 궤적이 시각화됨.

### 3.4 Tauri standalone ⭐⭐

`pnpm dev` 안 치고 더블클릭으로 실행. 비개발자에게 배포 가능.

**현실성**: 도구 사용자가 결국 개발자라 우선순위 낮음. Obsidian 플러그인이 더 효과적.

### 3.5 학습 자료 작성 도구 (학습→문서 역방향) ⭐⭐⭐⭐

**아이디어 — 이게 가장 흥미로움**:

지금: 자료가 있고 → 학습 → 노트.
역방향: 노트가 쌓이면 → 자료 자동 생성 → 다른 사람도 학습 가능.

구체적으로:
- 한 카테고리(예: Spring Ecosystem)의 모든 spiral-buddy 노트를 input으로
- Claude가 "이 사람이 1년에 걸쳐 학습한 궤적 + 헷갈렸던 지점 + 진짜 이해한 직관"을 종합해서 새 deep-dive 레포 챕터 초안 생성
- 그러면 `iq-dev-lab`이 정적이 아니라 **사용자 학습 흔적으로 진화하는** 살아있는 자료가 됨

이게 진짜 비전. spiral-buddy → iq-blogger와 연결되는 그림.

**난이도**: 중. 노트 → 챕터 변환 프롬프트만 잘 만들면 됨. 너의 iq-blogger 인프라 그대로 활용 가능.

---

## Anti-patterns — 하지 말아야 할 것들

이건 명시하는 게 중요. 충동에 휘둘리면 안 좋아.

### ❌ AI 모델 추가 (다른 회사 API)
"OpenAI도 지원하면 좋잖아" — NO. spiral-buddy는 **Claude 전용 도구**. Anthropic의 시스템 프롬프트 따르기, tool use, MCP 등이 핵심. 다른 모델 지원하면 모든 곳에 if-else가 생기고 품질 떨어진다.

### ❌ 협업 기능 (실시간 공유 학습)
학습은 본질적으로 개인적. 다른 사람의 학습 흔적이 보이면 비교/조급함만 키운다. 노트는 공유 가능하지만 (3.5처럼 자료로 출판하는 방식) 실시간 채팅 같은 건 NO.

### ❌ 모바일 앱
학습은 데스크탑에서. 모바일은 노트 읽기 정도. 옵시디언 모바일이 이미 그 역할.

### ❌ 게임화 (streak, badge, leaderboard)
spiral-buddy는 외재적 동기가 아닌 **내재적 호기심** 도구. streak에 매여서 매일 형식적으로 학습하면 깊이가 사라진다. 진짜로 궁금할 때만 와야 됨.

### ❌ 비-마크다운 노트 포맷 지원
.docx, .pdf, Notion 등. NO. Obsidian + markdown이 핵심. 다른 거 지원하면 8섹션 구조의 의미 사라짐.

### ❌ 자료 통합 검색 (RAG)
"노트 + 챕터 본문 모두 임베딩해서 검색하자" — NO. 검색이 너무 쉬워지면 **명시적으로 spiral하는 동작**이 사라진다. 챕터를 두 번째 방문할 때 의식적으로 이전 노트 다시 읽는 게 핵심 학습 동작.

---

## 다음 1주 추천 액션

순서대로:

1. **dogfood 1주** — 새 기능 추가 멈추고 그냥 써. Spring, Redis 같이 너가 관심 있는 거로 매일 1-2세션.
2. **느낀 점 메모** — 진짜 거슬렸던 거 (UX, 노트 품질, 추천 정확도) 적기
3. **1.1 분석 로그 구현** — dogfood 데이터 모으기 시작
4. **2.1 uncertainty 구조화** — 노트 frontmatter에 추가, 다음 세션에서 활용
5. **사용자 피드백 정리 후 Phase 3 결정**

핵심 질문: **"내가 매일 spiral-buddy로 학습을 더 즐겁게 했는가, 아니면 다른 곳에서 배워와서 노트만 기록했는가?"** 후자라면 도구가 학습 과정에 깊이 들어가지 못한 거고, 그건 진짜 문제.

---

## 측정 지표 (4주 후 자기 평가용)

- 일 평균 세션 수: 목표 1-2회
- 평균 세션 시간: 15-30분이 sweet spot (5분 미만 = 빠져나옴, 60분 초과 = 산만)
- depth 분포: depth 2-3에 무게가 실려야 함 (depth 1만 많으면 spiral 안 일어난 것)
- 추천 따라간 비율: 60%+ (낮으면 추천 품질 문제)
- 1주 후 노트 재방문율: 30%+ (낮으면 노트가 일회용 dump)
