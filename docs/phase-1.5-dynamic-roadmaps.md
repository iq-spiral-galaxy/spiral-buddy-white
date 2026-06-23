# Phase 1.5 — 동적 로드맵 (Dynamic Roadmaps)

## 동기

Phase 1까지의 한계:
- `SPIRAL_ROADMAP_PATH`가 단일 디렉토리만 가리킴. 다른 로드맵으로 학습하려면 `.env` 수정 + 서버 재시작 필요.
- iq-dev-lab에는 86+ 레포 (redis, kafka, network, kubernetes, spring 시리즈 다수, ...) 학습 자료 누적. 로드맵 전환 비용이 학습 빈도를 깎는다.
- MCP의 응답이 JSON이라 Claude가 매번 마크다운 표로 다시 가공 → 출력 토큰 낭비 + 일관성 부족.

목표:
1. 하나의 root 디렉토리(`SPIRAL_ROADMAP_ROOT`)만 설정하면 그 아래 모든 로드맵이 자동으로 잡힌다
2. 웹앱: 사이드바에서 즉시 전환
3. MCP: `spiral_list_roadmaps` 도구 + 모든 응답을 풍부한 마크다운으로

## 식별 체계

| 필드 | 형식 | 예시 |
|---|---|---|
| `roadmap_id` | root-relative path | `spring ecosystem/spring-core-deep-dive/transaction-mvcc` |
| `roadmap_name` | basename | `transaction-mvcc` |
| `chapter_id` | roadmap 내부 path | `01-acid.md` |
| 글로벌 챕터 식별 | `(roadmap_id, chapter_id)` 튜플 | |

설계 근거:
- `roadmap_id`는 root-relative path로 글로벌 unique 보장
- `chapter_id`는 짧게 유지 → 옵시디언 frontmatter 가독성
- `roadmap_name`(basename)은 표시용으로만 사용. 충돌 가능성 있어 식별자로는 쓰지 않음.

## 자동 탐지 규칙

`discoverRoadmaps(rootPath)`:
- root 아래를 재귀 탐색 (최대 깊이 6)
- 디렉토리에 README.md를 제외한 .md 파일이 2개 이상 → 로드맵으로 인식
- 로드맵으로 인식된 디렉토리 내부는 더 탐색 안 함 (sub-section을 별도 로드맵으로 잘못 인식하는 것 방지)
- 결과는 `id` 알파벳 정렬

예시 iq-dev-lab 구조:
```
iq-dev-lab/
├── README.md                        ← 로드맵 아님 (root 자체)
├── redis-deep-dive/
│   ├── README.md
│   ├── 01-data-structures.md
│   ├── 02-persistence.md            ← 여기 .md 2개+ → 로드맵
│   └── ...
└── spring ecosystem/
    └── spring-core-deep-dive/
        ├── README.md
        ├── ioc-container/
        │   ├── 01-beanfactory.md
        │   └── 02-applicationcontext.md   ← 로드맵
        └── transaction-mvcc/
            ├── 01-acid.md
            └── 02-isolation.md            ← 로드맵
```

탐지 결과:
- `redis-deep-dive`
- `spring ecosystem/spring-core-deep-dive/ioc-container`
- `spring ecosystem/spring-core-deep-dive/transaction-mvcc`

## 노트 frontmatter 진화

Before (Phase 1):
```yaml
chapter_id: "ioc-container/01-foo.md"
roadmap: "ioc-container"
```

After (Phase 1.5):
```yaml
chapter_id: "01-foo.md"
roadmap: "ioc-container"
roadmap_id: "spring ecosystem/spring-core-deep-dive/ioc-container"
```

기존 노트 호환: `vault.ts`의 `noteMatchesChapter()`에서 `roadmap_id`가 없으면 `roadmap` (basename) + chapter_id suffix 매칭으로 fallback. 즉 옛 노트도 진도 계산에 포함됨.

## Vault 구조 (변함 없음)

A 결정에 따라 모든 노트는 `<vault>/spiral-buddy/` 한 폴더에 평평하게 누적. frontmatter의 `roadmap_id`로 구분.

```
<vault>/spiral-buddy/
  _index.md
  2026-05-13-acid-d1.md             # roadmap_id: ".../transaction-mvcc"
  2026-05-13-beanfactory-d2.md      # roadmap_id: ".../ioc-container"
  2026-05-14-data-structures-d1.md  # roadmap_id: "redis-deep-dive"
```

근거: 옵시디언은 frontmatter/tag 기반 정렬·검색이 강력해서 폴더 분리 이득이 작다. 노트 수 100+로 늘면 그때 sub-folder 옵션 추가 검토.

## API 변경

### 신규 endpoint

| 메소드 | 경로 | 응답 |
|---|---|---|
| GET | `/api/roadmaps` | 모든 로드맵 + 각자 진도 (visited/total, maxDepth, lastDate) |

### 변경된 endpoint

기존 모든 endpoint에 `roadmap_id` 쿼리/바디 파라미터 추가:

| 메소드 | 경로 | 변경 |
|---|---|---|
| GET | `/api/chapters?roadmap_id=...` | 특정 로드맵의 챕터만 |
| GET | `/api/history?roadmap_id=...` | 특정 로드맵의 노트만 (생략 시 전체) |
| GET | `/api/suggest?roadmap_id=...` | 특정 로드맵 컨텍스트에서 추천 |
| POST | `/api/session/start` | body에 `roadmapId` 추가, 응답 헤더 `X-Roadmap-Id`/`X-Roadmap-Name` |

### Config 변경

`SPIRAL_ROADMAP_PATH` (legacy) 처리:
- 설정 시: 그 부모를 root, 자신을 pinned 로드맵으로 (다른 로드맵은 안 보임)
- 새 설정인 `SPIRAL_ROADMAP_ROOT`가 우선
- 둘 다 없으면 에러

## MCP 변경

### 도구 6개 (이전 5개 → +1)

| 도구 | 변경 |
|---|---|
| `spiral_list_roadmaps` | **신규** — 모든 로드맵 + 진도 |
| `spiral_list_chapters` | `roadmap_id` 인자 필수 |
| `spiral_get_chapter_context` | `roadmap_id` + `chapter_id` 인자 |
| `spiral_list_notes` | `roadmap_id` 인자 (선택) |
| `spiral_read_note` | 변동 없음 |
| `spiral_save_note` | `roadmap_id` 인자 필수, body 검증 + 누락 섹션 자동 보충 |

### 응답 형식: 마크다운 우선

모든 도구의 응답을 풍부한 마크다운 표/리스트로. Claude Desktop에서 표가 그대로 렌더링되므로 별도 가공 없이 사용자에게 보여줄 수 있다.

도구 description에 명시: "응답은 사용자가 바로 읽을 수 있는 마크다운입니다 — 가공하지 말고 그대로 출력하거나 짧은 인삿말과 함께 인용하세요."

장점:
- Claude의 출력 토큰 절약 (표 재구성 안 함)
- 도구 출력의 일관성
- 디버깅 용이 (stderr에 도구 호출 결과 보존)

### 8섹션 자동 보충

`spiral_save_note`에서 body의 8개 헤딩 중 누락된 것이 있으면:
- 누락된 섹션을 `_이번 세션에서 다루지 않음._` 한 줄로 자동 보충
- 응답에 `⚠️ 누락된 섹션 자동 보충됨: ...` 메시지 포함
- 이로써 H5(8섹션 일관성) 가설을 자동 검증/강제

## 웹앱 UX

사이드바 상단에 로드맵 셀렉터 추가:

```
🌀 spiral-buddy
─────────────
ROADMAP
[ transaction-mvcc       2/7 ▼ ]   ← 클릭하면 드롭다운
─────────────
🧭 suggestion (이 로드맵 기준)
─────────────
CHAPTERS (이 로드맵의 챕터들)
  1. ACID  d2
  2. MVCC
  ...
─────────────
PAST SESSIONS (이 로드맵)
  ...
```

상호작용:
- 드롭다운에서 다른 로드맵 선택 → 챕터/노트/추천이 모두 갱신됨
- 진행 중인 세션이 있으면 confirm으로 경고
- 마지막 선택한 로드맵은 `localStorage`에 저장, 다음 부팅 시 복원
- topbar에 현재 활성 로드맵 뱃지 표시 (`<span class="roadmap-badge">transaction-mvcc</span>`)

## 검증 시나리오

### 시나리오 1: iq-dev-lab root 부팅
```bash
SPIRAL_ROADMAP_ROOT=/Users/ibm514/iq-lab/iq-dev-lab pnpm dev
```
기대:
- boot log에 `discovered: N roadmaps`
- 웹앱 부팅 시 사이드바에 다수 로드맵 목록
- 첫 번째 로드맵이 default 활성

### 시나리오 2: 옛 노트 호환
- `ioc-container/01-beanfactory-vs-applicationcontext.md` 형식 chapter_id를 가진 옛 노트
- 새 스키마 챕터(`chapter_id: "01-beanfactory-vs-applicationcontext.md"`, `roadmap_name: "ioc-container"`)와 매칭 성공
- 챕터 사이드바에 d2 뱃지 표시

### 시나리오 3: MCP에서 로드맵 발견 → 학습
- `spiral_list_roadmaps` → 표 출력
- 사용자: "transaction-mvcc에서 isolation 챕터 가자"
- Claude: `spiral_list_chapters({roadmap_id: "transaction-mvcc"})` → `spiral_get_chapter_context({roadmap_id, chapter_id: "02-isolation.md"})` → 학습 → `spiral_save_note`
- 노트 frontmatter에 `roadmap_id` 정확히 기록 확인

### 시나리오 4: 누락 섹션 자동 보충
- `spiral_save_note`에 헤딩 6개만 있는 body 전달
- 응답에 `⚠️ 누락된 섹션 자동 보충됨: '이전 학습과의 연결', '다음에 볼 것'`
- 저장된 노트에 두 섹션이 placeholder로 들어있음

## 결정 사항 (요약)

- **A** — 노트는 `<vault>/spiral-buddy/`에 평평하게, frontmatter `roadmap_id`로 구분
- **로드맵 id = root-relative path** (띄어쓰기 있는 폴더도 그대로)
- **chapter_id는 roadmap-internal path** (짧고 사용자 친화적)
- **README.md는 챕터로 계산하지 않음** (인덱스 역할로 간주)
- **legacy `SPIRAL_ROADMAP_PATH` 지원 유지** (부모를 root, 자신을 pinned로)

## 다음 (Phase 2 후보)

- Tauri standalone 패키징 또는 옵시디언 플러그인 (Phase 1.5 dogfood 1-2주 후 결정)
- 시스템 프롬프트 자동 주입 가능한 MCP 패턴 시도 (H5 개선)
- 로드맵 검색 캐싱 (현재는 호출마다 디렉토리 스캔)
- "Recent roadmaps" 정렬 옵션 (지금은 알파벳 고정)
