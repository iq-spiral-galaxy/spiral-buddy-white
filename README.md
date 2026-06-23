# 🌀 Spiral Buddy — ⚪ White

> AI 버디와 함께하는 **나선형 학습** 데스크톱 앱 — **마음·의식 학습용 버디**.
> 흰 배경에 검은 나선, 핑크 포인트. 물질에서 마음을 쌓아 올리되 끝내 남는 '경험'을 정직하게 — *"Explain it, don't explain it away."*

> [iq-spiral-galaxy](https://github.com/iq-spiral-galaxy) 패밀리:
> 🔴 [Red](https://github.com/iq-spiral-galaxy/spiral-buddy-red)(AI·수학) · 🟢 [Green](https://github.com/iq-spiral-galaxy/spiral-buddy-green)(실천적 지혜) · 🔵 [Blue](https://github.com/iq-spiral-galaxy/spiral-buddy-blue)(개발) · 🌑 [Black](https://github.com/iq-spiral-galaxy/spiral-buddy-black)(우주·물리) · **⚪ White(마음·의식)**

<p align="center">
  <img alt="release" src="https://img.shields.io/badge/release-v0.2.0-ec4899?style=flat-square">
  <img alt="platforms" src="https://img.shields.io/badge/macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-supported-555?style=flat-square">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-green?style=flat-square">
</p>

---

> ✅ **공개됨** — Blue 엔진에서 분기해 마음·의식(Psyche) 학습 버디로 완성했습니다. 아래 **한 줄 명령으로 바로 설치**하거나 아래 "소스에서 실행" 항목을 따르세요. (3-OS 자동 빌드 — macOS·Windows·Linux)

<details>
<summary>⚡ <b>30초 설치 — 한 줄 명령으로 바로 받기</b> &nbsp;(클릭해서 펼치기)</summary>

<br/>

> 코드서명을 하지 않은 빌드라 macOS Gatekeeper / Windows SmartScreen 경고가 뜰 수 있어요(실제 손상 아님). 아래 macOS 명령엔 `xattr -cr`이 포함돼 자동 해결되고, Windows는 "추가 정보 → 실행"으로 진행하면 됩니다.

**🍎 macOS — Apple Silicon (M1/M2/M3/M4)**

```bash
osascript -e 'tell application "Spiral Buddy White" to quit' 2>/dev/null; sleep 1; \
cd /tmp && \
curl -fL -o /tmp/spiral.dmg "https://github.com/iq-spiral-galaxy/spiral-buddy-white/releases/latest/download/Spiral-Buddy-White-latest-arm64.dmg" && \
MOUNT=$(hdiutil attach -nobrowse /tmp/spiral.dmg | grep -o '/Volumes/.*' | head -1) && \
rm -rf '/Applications/Spiral Buddy White.app' && \
cp -R "$MOUNT/Spiral Buddy White.app" /Applications/ && \
hdiutil detach -quiet "$MOUNT" && \
xattr -cr '/Applications/Spiral Buddy White.app' && \
rm -f /tmp/spiral.dmg && \
open '/Applications/Spiral Buddy White.app'
```

**🍎 macOS — Intel**

```bash
osascript -e 'tell application "Spiral Buddy White" to quit' 2>/dev/null; sleep 1; \
cd /tmp && \
curl -fL -o /tmp/spiral.dmg "https://github.com/iq-spiral-galaxy/spiral-buddy-white/releases/latest/download/Spiral-Buddy-White-latest.dmg" && \
MOUNT=$(hdiutil attach -nobrowse /tmp/spiral.dmg | grep -o '/Volumes/.*' | head -1) && \
rm -rf '/Applications/Spiral Buddy White.app' && \
cp -R "$MOUNT/Spiral Buddy White.app" /Applications/ && \
hdiutil detach -quiet "$MOUNT" && \
xattr -cr '/Applications/Spiral Buddy White.app' && \
rm -f /tmp/spiral.dmg && \
open '/Applications/Spiral Buddy White.app'
```

**🪟 Windows (PowerShell)**

```powershell
$ErrorActionPreference = "Stop"
Get-Process "Spiral Buddy White" -EA SilentlyContinue | Stop-Process -Force
$exe = "$env:TEMP\spiral-buddy-white-setup.exe"
Invoke-WebRequest -Uri "https://github.com/iq-spiral-galaxy/spiral-buddy-white/releases/latest/download/Spiral-Buddy-White-latest-Setup.exe" -OutFile $exe
Start-Process -FilePath $exe -ArgumentList "/S" -Wait
Remove-Item $exe -Force
$app = "$env:LOCALAPPDATA\Programs\spiral-buddy-white\Spiral Buddy White.exe"
if (Test-Path $app) { Start-Process $app }
```

**🐧 Linux**

```bash
curl -fL -o ~/SpiralBuddyWhite.AppImage "https://github.com/iq-spiral-galaxy/spiral-buddy-white/releases/latest/download/Spiral-Buddy-White-latest.AppImage"
chmod +x ~/SpiralBuddyWhite.AppImage
~/SpiralBuddyWhite.AppImage
```

</details>

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

> 큐레이트 콘텐츠 매핑(`curatedOrg = iq-psyche-lab`) 완료 — 7레이어 31개 레포가 사이드바에 도메인별로 묶여 보입니다.

## ⚪ White만의 기능 — "마음 학습 전용"

패밀리 공통 엔진 위에, 마음·의식 학습에 맞춘 장치를 얹었습니다. 모든 기능이 한 규율을 강제합니다 — **메커니즘은 끝까지 밝히되, 경험은 끝내 지우지 않는다.**

- 🌉 **설명적 간극 인덱스** — 사이드바의 *설명적 간극* 버튼. 지금까지 쓴 모든 노트에서 "메커니즘이 1인칭 경험을 다 설명하지 못한 지점"만 뽑아 **7레이어별로 모아 보여줍니다.** 학습이 쌓일수록 두꺼워지는 *"환원이 멈춘 경계들의 지도"* — 검색·옵시디언 바로열기 지원. White 철학의 핵심 산출물.
- 🔁 **원리 횡단 회수 (Synthesis)** — 표상·예측·통합·자기참조·창발 같은 본질 원리는 뉴런부터 자아까지 반복됩니다. Synthesis(L6) 챕터에 들어가면, 버디가 **다른 레이어에서 같은 원리를 만났던 당신의 과거 노트를 자동으로 들고 시작**해 "그때 그 구조랑 같지 않아?"라고 잇습니다.
- 🧭 **종료-전 간극 가드** — 메커니즘만 쌓고 간극을 한 번도 안 짚은 채 세션을 끝내려 하면, 저장 직전에 *"이 메커니즘이 경험을 어디서부터 못 설명하지?"* 한 턴을 권합니다.
- 📝 **마음 노트 8섹션** — 세션 종료 시 자동 생성되는 노트가 도메인 구조를 따릅니다: `한 줄 요약 · 메커니즘(3인칭) · 증거/실험 · 설명적 간극 · 1인칭 경험 · 헷갈렸던 지점 · 이전 학습과의 연결 · 다음에 볼 것`. (Obsidian 호환)
- 🧪 **버디 페르소나 (Psyche)** — 3인칭 메커니즘 먼저(Marr 레벨 구분), **3중 검증**(실험·현상학·계산모델 — *셋이 어긋나는 곳이 곧 간극*), 직관의 함정(호문쿨루스·데카르트 극장) 짚기, 1인칭으로 종결. 좌뇌/우뇌·MBTI·대중심리 같은 뇌 미신은 배제.
- 🎨 **테마** — 흰 배경 + 핑크 포인트의 "어두운 화이트"(라이트)와 **검정 우주 + 흰 나선 + 핑크**의 다크 모드(음양). 설정에서 전환. 7레이어마다 고유 아이콘.

## ✨ 공통 엔진 기능 (패밀리 공유)

- 🗺️ 로드맵 → 챕터 **나선형 학습** (depth 1 → 2 → 3, 이전 노트가 다음 세션 컨텍스트로 자동 합류)
- 💬 버디와 **Socratic 대화** — 스트리밍 · 모델 선택 · 세션 Pause/Resume
- 🎤 **음성 입력** (OS 받아쓰기) · 🔍 **Look-up** 사이드 패널(개념 즉석 검색) · 📊 학습 추적(활동 캘린더·streak)
- 🔁 **지난 대화 앱에서 다시보기** — 옵시디언 안 가도 그때 대화 재생
- 📚 **Curated 콘텐츠 자동 설치** — 설정에서 [iq-psyche-lab](https://github.com/iq-psyche-lab) 31개 레포를 역할 프리셋(마음의 언어부터 / 신경→인지 / 의식·자아 / 전체)으로 한 번에 받기
- 🔒 API 키 암호화 저장(safeStorage) · 자동 업데이트 · 고정 포트(4597, Blue/Green과 분리)
- 전체 엔진 상세는 동일 엔진인 [Blue README](https://github.com/iq-spiral-galaxy/spiral-buddy-blue) 참고

## 🏗️ 소스에서 실행

```bash
pnpm install
pnpm build            # TypeScript → dist
pnpm electron:dev     # 데스크톱 앱 (또는 pnpm dev 로 브라우저 모드)
```

첫 실행 시 Setup: **Anthropic API 키**(`sk-ant-...`) + **노트 보관함 폴더**(Obsidian vault 자동 감지).

## 📂 데이터 위치

- 노트: `<vault>/spiral-buddy-white/` · 휴지통: `…/.trash/` (30일 후 자동 청소) — Blue 등 다른 버디와 같은 vault를 써도 노트가 섞이지 않습니다.
- 앱 설정: `~/Library/Application Support/spiral-buddy-white/` (macOS)

재설치해도 위 데이터는 보존됩니다.

## 🤝 Contributing & License

PR/이슈 환영 (큰 변경은 이슈로 먼저 논의). 기여 전 [CLA](CLA.md)·[CONTRIBUTING](CONTRIBUTING.md) 확인.
**MIT** · © 2026 Donghee Han (한동희, @e9ua1)
