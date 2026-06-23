# 🌀 Spiral Buddy — ⚪ White

> AI 버디와 함께하는 **나선형 학습** 데스크톱 앱 — **마음·의식 학습용 버디**.
> 흰 배경에 검은 나선, 핑크 포인트. 물질에서 마음을 쌓아 올리되 끝내 남는 '경험'을 정직하게 — *"Explain it, don't explain it away."*

> [iq-spiral-galaxy](https://github.com/iq-spiral-galaxy) 패밀리:
> 🔴 [Red](https://github.com/iq-spiral-galaxy/spiral-buddy-red)(AI·수학) · 🟢 [Green](https://github.com/iq-spiral-galaxy/spiral-buddy-green)(실천적 지혜) · 🔵 [Blue](https://github.com/iq-spiral-galaxy/spiral-buddy-blue)(개발) · 🌑 [Black](https://github.com/iq-spiral-galaxy/spiral-buddy-black)(우주·물리) · **⚪ White(마음·의식)**

<p align="center">
  <img alt="status" src="https://img.shields.io/badge/status-준비_중(WIP)-444?style=flat-square">
  <img alt="platforms" src="https://img.shields.io/badge/macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-supported-555?style=flat-square">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-green?style=flat-square">
</p>

---

> 🚧 **준비 중 (WIP)** — Blue 엔진(v0.5.107)에서 분기한 초기 스캐폴드입니다. 정식 빌드와 한 줄 설치(macOS/Windows/Linux)는 라이트 테마 마감·도메인 콘텐츠·아이콘 정리 후 추가됩니다. 지금은 아래처럼 **소스에서 직접 실행**할 수 있어요.

## 🧠 무엇을 배우나 — IQ Psyche Lab

뉴런이라는 가장 단단한 바닥에서 *경험하는 나 자신*까지, 마음을 한 층씩 쌓아 올려 설명하되 **설명이 끝내 닿지 못하는 곳**(왜 거기에 '느낌'이 있나)을 지우지 않습니다. 모든 학습은 같은 흐름으로 닫힙니다 —
**메커니즘**(3인칭으로 어떻게 작동하나) → **간극**(어디서 1인칭 설명이 끊기나) → **경험**(그래서 무엇이 느껴지나).

7-레이어 스택 (학습 자료: [iq-psyche-lab](https://github.com/iq-psyche-lab)):

| | 레이어 |
|---|---|
| L0 | 마음의 언어 (심신 지형도·설명 층위·1인칭 방법) |
| L1 | 신경 기질 (뉴런·신경부호·가소성·신경조절) |
| L2 | 인지 (지각·주의·기억·학습·언어·감정) |
| L3 | 계산적 마음 (기능주의·인공망 대조·체화) |
| L4 | 의식 (어려운 문제·NCC·의식 이론·변성 상태) |
| L5 | 자아 (자유의지·타인의 마음·의미) |
| L6 | 합성 (표상·예측·통합·자기참조·창발) |

> 큐레이트 콘텐츠 매핑(`curatedOrg = iq-psyche-lab`)은 세팅 중입니다.

## ✨ 핵심 기능 (패밀리 공통 엔진)

- 🗺️ 로드맵 → 챕터 **나선형 학습** (depth 1 → 2 → 3, 이전 노트가 다음 세션 컨텍스트로 자동 합류)
- 💬 버디와 **Socratic 대화** — 스트리밍 · 모델 선택 · 세션 Pause/Resume
- 🎤 **음성 입력** (OS 받아쓰기) · 🔍 **Look-up** 사이드 패널 · 📊 학습 추적(활동 캘린더·streak)
- 📝 세션 종료 시 **구조화 노트** 자동 생성 (Obsidian 호환) — *Psyche는 `메커니즘→간극→경험` 구조로 맞춤 예정*
- 🔁 **지난 대화 앱에서 다시보기** — 옵시디언 안 가도 그때 대화 재생
- 전체 기능 상세는 동일 엔진인 [Blue README](https://github.com/iq-spiral-galaxy/spiral-buddy-blue) 참고

## 🏗️ 소스에서 실행

```bash
pnpm install
pnpm build            # TypeScript → dist
pnpm electron:dev     # 데스크톱 앱 (또는 pnpm dev 로 브라우저 모드)
```

첫 실행 시 Setup: **Anthropic API 키**(`sk-ant-...`) + **노트 보관함 폴더**(Obsidian vault 자동 감지).

## 📂 데이터 위치

- 노트: `<vault>/spiral-buddy/` · 휴지통: `…/.trash/` (30일 후 자동 청소)
- 앱 설정: `~/Library/Application Support/spiral-buddy-white/` (macOS)

재설치해도 위 데이터는 보존됩니다.

## 🤝 Contributing & License

PR/이슈 환영 (큰 변경은 이슈로 먼저 논의). 기여 전 [CLA](CLA.md)·[CONTRIBUTING](CONTRIBUTING.md) 확인.
**MIT** · © 2026 Donghee Han (한동희, @e9ua1)
