// v0.6 멀티 LLM — 프로바이더 프리셋 목록.
// 설정 모달의 "AI 프로바이더" 섹션에서 사용.
//
// models: 프로바이더별 현재 모델 목록 (2026-07 공식 문서 기준 스냅샷).
//   목록은 낡을 수 있음 — 설정의 "목록 불러오기" 버튼이 프로바이더 API에서
//   실시간 전체 목록을 받아오므로, 신모델은 그걸로 항상 조회 가능. 직접 입력도 가능.
// exampleModel: 프리셋 선택 시 기본 채움값 (해당 프로바이더의 권장 기본).
// baseUrl === null 이면 anthropic 네이티브 (SPIRAL_LLM_* env를 아예 안 씀 — 기존 동작).
// baseUrl === "" 이면 커스텀 (사용자가 직접 입력).

export const LLM_PRESETS = [
  {
    id: "anthropic",
    label: "Claude (Anthropic) — 기본·권장",
    baseUrl: null,
    exampleModel: "claude-sonnet-5",
    models: [], // Claude 모델은 기존 "기본 모델" 셀렉터(서버 목록)를 그대로 사용
    hint: "기본값입니다. 위의 Anthropic API Key와 기본 모델 설정을 그대로 사용합니다. 키 발급: console.anthropic.com",
  },
  {
    id: "openai",
    label: "OpenAI (GPT)",
    baseUrl: "https://api.openai.com/v1",
    exampleModel: "gpt-5.4",
    models: ["gpt-5.4", "gpt-5.5", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.5-pro"],
    hint: "키 발급: platform.openai.com → API keys. gpt-5.5=플래그십, gpt-5.4=균형(반값), 5.4-mini/nano=경량. '목록 불러오기'로 전체 조회.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    exampleModel: "gemini-3.5-flash",
    models: [
      "gemini-3.5-flash",
      "gemini-3.1-pro-preview",
      "gemini-3.1-flash-lite",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
    ],
    hint: "키 발급: aistudio.google.com → Get API key. 3.5-flash=최신 GA 플래그십. OpenAI 호환 엔드포인트 사용.",
  },
  {
    id: "kimi",
    label: "Kimi (Moonshot)",
    baseUrl: "https://api.moonshot.ai/v1",
    exampleModel: "kimi-k2.6",
    models: ["kimi-k2.6", "kimi-k2.5", "kimi-k2.7-code", "kimi-k2.7-code-highspeed"],
    hint: "키 발급: platform.kimi.ai → API Keys. k2.6=최신 플래그십, k2.7-code=코딩·에이전트 특화.",
  },
  {
    id: "qwen",
    label: "Qwen (Alibaba)",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    exampleModel: "qwen3.7-plus",
    models: [
      "qwen3.7-plus",
      "qwen3.7-max",
      "qwen3-max",
      "qwen3.6-flash",
      "qwen-plus",
      "qwen-flash",
    ],
    hint: "키 발급: Alibaba Cloud Model Studio (dashscope) → API-KEY 관리. 3.7-max=플래그십, 3.7-plus=균형, qwen-plus/flash=안정 알리아스.",
  },
  {
    id: "glm",
    label: "GLM (Z.ai)",
    baseUrl: "https://api.z.ai/api/paas/v4",
    exampleModel: "glm-4.7",
    models: ["glm-4.7", "glm-5.2", "glm-5.1", "glm-5-turbo", "glm-4.7-flashx", "glm-4.7-flash"],
    hint: "키 발급: z.ai → API Keys. 5.2=플래그십, 4.7=가성비 균형, 4.7-flash=무료 티어.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    exampleModel: "deepseek-v4-flash",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
    hint: "키 발급: platform.deepseek.com → API Keys. V4 세대 2종 — flash=균형(1M 컨텍스트), pro=플래그십. (구 deepseek-chat/reasoner는 종료됨)",
  },
  {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    exampleModel: "mistral-medium-latest",
    models: [
      "mistral-medium-latest",
      "mistral-large-latest",
      "mistral-small-latest",
      "magistral-medium-latest",
      "ministral-14b-latest",
    ],
    hint: "키 발급: console.mistral.ai → API Keys. medium=현행 최상위 API 모델, magistral=추론 특화.",
  },
  {
    id: "minimax",
    label: "MiniMax",
    baseUrl: "https://api.minimax.io/v1",
    exampleModel: "MiniMax-M2.7",
    models: ["MiniMax-M2.7", "MiniMax-M3", "MiniMax-M2.7-highspeed"],
    hint: "키 발급: platform.minimax.io → API Keys. M3=최신 플래그십(1M), M2.7=균형. (중국 본토 계정은 base URL을 api.minimaxi.com으로 변경)",
  },
  {
    id: "custom",
    label: "커스텀 (OpenAI-호환)",
    baseUrl: "",
    exampleModel: "",
    models: [],
    hint: "OpenAI 호환 API를 제공하는 어떤 서비스든 사용할 수 있습니다 (예: OpenRouter, Ollama, LM Studio, vLLM). Base URL·모델명·키를 직접 입력하세요.",
  },
];
