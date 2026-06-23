# Claude Code Context — spiral-buddy-white ⚪

**마음(Psyche) 버디.** Spiral Buddy 패밀리의 5번째. Blue(v0.5.107)에서 clone해 정체성만 입힌 **스캐폴드 상태**다. 도메인 성격에 맞춘 깊은 커스터마이즈(프롬프트·노트 구조·아이콘 등)는 아직 안 함 — 아래 TODO 참고.

## 정체성 (적용 완료)

- **테마**: **라이트 테마** — 흰 배경(`--bg:#ffffff`) + 검은 나선 + 핑크 accent(`--accent:#ec4899`, Psyche Lab 브랜드색 = "흰 명료함 속 피어나는 경험의 색"). 우주(검정)와 흑백 음양 대비. `client/styles.css :root` + `client/index.html` 스피럴 SVG에 반영.
- `package.json name`: `spiral-buddy-white` (userData 분리)
- `electron-builder.yml`: productName `Spiral Buddy White`, appId `com.iq-lab.spiral-buddy-white`, CFBundleName `Spiral Buddy White`
- `electron/main.cjs`: `GH_REPO = "spiral-buddy-white"`, BrowserWindow backgroundColor `#ffffff`
- **도메인 배선**: curatedOrg 기본값 `iq-psyche-lab` (config.ts + main.cjs). 큐레이트 콘텐츠를 [IQ Psyche Lab](https://github.com/iq-psyche-lab)에서 가져옴.
- version `0.1.0` (새 제품), git origin 제거됨(실수 push 방지).

## 성격 (Psyche — "Explain it, don't explain it away")

물질에서 마음을 쌓아 올리고, 끝내 환원되지 않는 '경험'을 정직하게 마주함. 모든 글의 흐름: **메커니즘(3인칭으로 어떻게 작동하나) → 간극(설명적 간극: 1인칭 경험이 어디서 빠지나) → 경험(그래서 무엇이 느껴지나)**. 뇌 미신·대중심리학 배제, 1인칭으로 종결.

## 남은 TODO (성격에 맞게 다듬기)

- [ ] **라이트 테마 마감** — :root 팔레트는 뒤집었지만, 코드 곳곳의 **하드코딩된 다크 색**(예: `rgba(0,0,0,0.5)` 그림자, var() 안 쓰는 색)을 라이트에 맞게 점검. dev로 띄워서 눈으로 훑으며 보정. (가장 손이 가는 부분.)
- [ ] **SESSION_SYSTEM 프롬프트** (`src/session-store.ts`) — Psyche 페르소나로. 3인칭 메커니즘 우선·간극 정직·1인칭 종결.
- [ ] **노트 8섹션 구조** (`src/note-writer.ts` STRUCTURE_SYSTEM + REQUIRED_SECTIONS) — `메커니즘 → 설명적 간극 → 1인칭 경험`. Green이 섹션을 도메인화(판단 규칙 추가 등)한 방식 참고: `iq-spiral-galaxy/spiral-buddy-green/src/note-writer.ts`.
- [ ] **아이콘** (`electron/build/icon.*`) — 흰 배경 검은 나선으로 재디자인 (현재 Blue 아이콘). dev 실행엔 불필요, 빌드 전 필요.
- [ ] **data/curated-categories.json** — iq-psyche-lab의 7-레이어/카테고리 매핑(현재 Blue 기준). 없어도 동작하나 사이드바 그룹핑이 정확해짐.
- [ ] **남은 "Spiral Buddy" 문자열** (`main.cjs` 다이얼로그/타이틀 + buildInstallScript의 DMG/볼륨/.app 이름) — 릴리스 전 일괄 리브랜드. (GH_REPO·productName·테마는 이미 됨.)
- [ ] **거버넌스** (LICENSE/CLA/CONTRIBUTING/README) — repo 이름 `spiral-buddy-white`로 갱신. (저작권자 = Donghee Han 유지.)
- [ ] **GitHub remote + CI** — 릴리스 준비되면 `iq-spiral-galaxy/spiral-buddy-white` 생성 + release.yml 연결.

## 실행

```bash
pnpm install
pnpm build          # TypeScript → dist
pnpm electron:dev   # 앱 실행 (첫 실행 시 API 키·vault 설정)
```

> 패밀리 공통 구조·릴리스 흐름은 Blue(`iq-agent-lab/iq-spiral-buddy`)와 Red/Green 참고. 멀티레포 포팅 함정은 메모리 `rgb-multirepo-port-gotchas` 참고.
