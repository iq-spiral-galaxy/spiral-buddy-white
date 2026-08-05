import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "./config.js";

export type ClaudeMessage = Anthropic.MessageParam;

/**
 * LLM 프로바이더 (v0.6 멀티 LLM):
 *  - "anthropic": Anthropic SDK 직접 (기본, 기존 동작)
 *  - "openai-compatible": OpenAI chat/completions 호환 엔드포인트 —
 *    GPT·Gemini·Kimi·Qwen·GLM 등이 전부 이 형식을 제공한다.
 */
export type LlmProvider = "anthropic" | "openai-compatible";

export interface ClaudeClient {
  raw: Anthropic;
  config: Config;
  /** 미지정 시 "anthropic" (기존 코드/테스트 하위호환). */
  provider?: LlmProvider;
  /** openai-compatible 전용 — 예: https://api.openai.com/v1 */
  baseUrl?: string | null;
}

export interface LlmTurnResult {
  text: string;
  usage: { input: number; output: number };
  /** Provider가 알려 준 정상/제한 종료 사유. 오래된 호환 서버는 생략할 수 있다. */
  stopReason?: string;
}

interface StreamTurnArgs {
  system: string;
  messages: ClaudeMessage[];
  onText?: (chunk: string) => void | Promise<void>;
  model?: string;
  maxTokens?: number;
  /** 출력 한도 종료를 감지하면 이미 쓴 답변 다음부터 한 번 더 이어 쓴다. */
  continueOnLength?: boolean;
  /** 기본 1회, 안전상 최대 2회. */
  maxContinuations?: number;
}

const MATH_GUIDANCE_MARKER = "<!-- spiral-math-output-guidance -->";

/**
 * 모든 LLM 호출에 공통으로 붙는 수식 출력 계약.
 * 화면/노트 렌더러가 같은 KaTeX 문법을 쓰므로 호출 경로별 프롬프트에
 * 복제하지 않고 어댑터 경계에서 한 번만 강제한다.
 */
export const MATH_OUTPUT_GUIDANCE = `${MATH_GUIDANCE_MARKER}
Math formatting contract:
- Use only $...$ for inline math and $$...$$ for display math.
- Never use \\(...\\), \\[...\\], or put LaTeX/math inside fenced code blocks. Fenced code blocks are only for actual source code.
- Keep explanatory prose outside math delimiters. Put an important standalone formula in its own $$...$$ block.
- Use common KaTeX 0.16-compatible TeX only. Fractions, roots, powers/subscripts, Greek letters, sums/products, limits, integrals, aligned equations, and small matrices are supported.
- Avoid custom macros, package-dependent commands/environments, and raw Unicode lookalike math symbols when a TeX command exists.`;

export function withMathOutputGuidance(system: string): string {
  if (system.includes(MATH_GUIDANCE_MARKER)) return system;
  return `${system.trimEnd()}\n\n${MATH_OUTPUT_GUIDANCE}`;
}

export function createClient(config: Config): ClaudeClient {
  // openai-compatible이어도 raw는 생성해 둔다(생성 자체는 네트워크 없음) —
  // 타입/테스트 하위호환을 위해 필드 형태를 바꾸지 않는 게 안전.
  const raw = new Anthropic({ apiKey: config.apiKey });
  return {
    raw,
    config,
    provider: config.llmProvider ?? "anthropic",
    baseUrl: config.llmBaseUrl ?? null,
  };
}

/**
 * Anthropic API의 일시적 에러인지 판단:
 *   - 529 overloaded_error: 클로드가 일시적으로 과부하 (자주 발생 — 30분 후 보통 회복)
 *   - 503 service unavailable
 *   - 502 bad gateway
 *   - 5xx 일반
 *   - ECONNRESET, ETIMEDOUT 등 네트워크
 */
export function isTransientApiError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  if (e._noRetry === true) return false;
  const status = typeof e.status === "number" ? e.status : null;
  if (status === 529 || status === 503 || status === 502 || status === 504) return true;
  if (status && status >= 500) return true;
  const errType =
    (e.error as { type?: string } | undefined)?.type ??
    (e.type as string | undefined);
  if (
    errType === "overloaded_error" ||
    errType === "rate_limit_error" ||
    errType === "api_error"
  ) {
    return true;
  }
  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  if (
    msg.includes("overloaded") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up")
  ) {
    return true;
  }
  return false;
}

/**
 * Anthropic 에러 객체에서 사람이 읽을 만한 메시지를 추출.
 * 너무 긴 JSON 통째로 보여주는 대신, 의미 있는 한 줄로.
 */
export function friendlyApiErrorMessage(err: unknown): string {
  if (!err) return "알 수 없는 오류";
  const e = err as Record<string, unknown>;
  const errType =
    (e.error as { type?: string } | undefined)?.type ??
    (e.type as string | undefined);
  if (errType === "overloaded_error") {
    return "Claude API가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도하거나, 설정에서 다른 모델로 변경해 보세요.";
  }
  if (errType === "rate_limit_error") {
    return "요청이 잠시 많이 몰렸습니다(rate limit). 잠시 후 다시 시도해 주세요.";
  }
  if (errType === "authentication_error") {
    return "API 키 인증이 실패했습니다. 설정에서 키를 확인해 주세요.";
  }
  if (errType === "permission_error") {
    return "이 모델에 대한 권한이 없습니다. 다른 모델로 시도해 보세요.";
  }
  if (errType === "not_found_error") {
    return "모델을 찾을 수 없습니다. 설정에서 다른 모델로 바꿔 주세요.";
  }
  if (e.message && typeof e.message === "string") {
    // JSON 노이즈 제거: "{...}" 로 시작하는 긴 메시지면 status/타입만 추출
    if (e.message.startsWith("{") || e.message.startsWith("[")) {
      const status = typeof e.status === "number" ? e.status : null;
      return status
        ? `Claude API 오류 (HTTP ${status}). 잠시 후 다시 시도해 주세요.`
        : "Claude API 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
    }
    return e.message;
  }
  return "Claude API 오류가 발생했습니다.";
}

async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { maxAttempts?: number; onRetry?: (n: number, err: unknown) => void },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isTransientApiError(err)) {
        throw err;
      }
      // exponential backoff with jitter: 1.5s, 4s, 9s (각 +0~500ms 랜덤)
      const baseMs = [1500, 4000, 9000][attempt - 1] ?? 9000;
      const wait = baseMs + Math.floor(Math.random() * 500);
      opts?.onRetry?.(attempt, err);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// ──────────────────────────────────────────────────────────
// OpenAI-호환 어댑터 (fetch 기반, 의존성 0)
// GPT·Gemini·Kimi·Qwen·GLM 등의 chat/completions 엔드포인트.
// ──────────────────────────────────────────────────────────

/** ClaudeMessage(content: string | blocks[]) → OpenAI 메시지(content: string). */
function toOpenAiMessages(
  system: string,
  messages: ClaudeMessage[],
): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [
    { role: "system", content: system },
  ];
  for (const m of messages) {
    const content =
      typeof m.content === "string"
        ? m.content
        : m.content
            .map((b) => ("text" in b && typeof b.text === "string" ? b.text : ""))
            .filter(Boolean)
            .join("\n");
    out.push({ role: m.role, content });
  }
  return out;
}

/** 프로바이더 에러 → isTransientApiError/friendlyApiErrorMessage가 이해하는 형태로. */
async function openAiHttpError(res: Response): Promise<Error> {
  let detail = "";
  let errType: string | undefined;
  try {
    const body = (await res.json()) as {
      error?: { message?: string; type?: string; code?: string };
    };
    detail = body?.error?.message ?? "";
    errType = body?.error?.type ?? body?.error?.code;
  } catch {
    // body 없음/비JSON — status만으로
  }
  const e = new Error(
    detail || `LLM API 오류 (HTTP ${res.status})`,
  ) as Error & { status?: number; type?: string };
  e.status = res.status;
  if (res.status === 401 || res.status === 403) e.type = "authentication_error";
  else if (res.status === 404) e.type = "not_found_error";
  else if (res.status === 429) e.type = "rate_limit_error";
  else if (errType) e.type = errType;
  return e;
}

/** Provider마다 다른 종료 사유를 호출부가 하나의 규칙으로 다룰 수 있게 한다. */
function normalizeStopReason(reason: string | null | undefined): string | undefined {
  if (!reason) return undefined;
  const normalized = reason.trim().toLowerCase();
  if (
    normalized === "length" ||
    normalized === "max_tokens" ||
    normalized === "max_output_tokens" ||
    normalized === "max_completion_tokens" ||
    normalized === "token_limit"
  ) {
    return "max_tokens";
  }
  if (normalized === "stop" || normalized === "end_turn") return "end_turn";
  return normalized;
}

/**
 * chat/completions 요청 1회. stream=true면 SSE를 파싱해 onText로 흘림.
 * max_tokens를 거부하는 신형 OpenAI 모델(max_completion_tokens 요구)은
 * 에러 메시지를 보고 파라미터명을 바꿔 1회 재시도.
 */
async function openAiChatOnce(
  client: ClaudeClient,
  args: {
    system: string;
    messages: ClaudeMessage[];
    onText?: (chunk: string) => void | Promise<void>;
    model?: string;
    maxTokens?: number;
  },
  stream: boolean,
  onTextStarted?: () => void,
): Promise<LlmTurnResult> {
  const base = (client.baseUrl ?? "").replace(/\/+$/, "");
  if (!base) {
    throw new Error(
      "LLM base URL이 설정되지 않았습니다. 설정에서 프로바이더/주소를 확인해 주세요.",
    );
  }
  const url = `${base}/chat/completions`;
  const maxTokens = args.maxTokens ?? client.config.maxTokens;

  const doFetch = async (tokenParam: "max_tokens" | "max_completion_tokens") => {
    const body: Record<string, unknown> = {
      model: args.model ?? client.config.model,
      messages: toOpenAiMessages(args.system, args.messages),
      stream,
      [tokenParam]: maxTokens,
    };
    if (stream) body.stream_options = { include_usage: true };
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${client.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  };

  let res = await doFetch("max_tokens");
  if (!res.ok) {
    // 신형 OpenAI 모델: max_tokens 거부 → max_completion_tokens로 재시도
    const errText = await res.clone().text().catch(() => "");
    if (res.status === 400 && errText.includes("max_completion_tokens")) {
      res = await doFetch("max_completion_tokens");
    }
  }
  if (!res.ok) throw await openAiHttpError(res);

  // ── non-stream ──
  if (!stream) {
    const data = (await res.json()) as {
      choices?: Array<{
        message?: { content?: string | null };
        finish_reason?: string | null;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const stopReason = normalizeStopReason(data.choices?.[0]?.finish_reason);
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      usage: {
        input: data.usage?.prompt_tokens ?? 0,
        output: data.usage?.completion_tokens ?? 0,
      },
      ...(typeof stopReason === "string" ? { stopReason } : {}),
    };
  }

  // ── SSE stream ──
  if (!res.body) throw new Error("LLM 응답 스트림이 비어 있습니다.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let fullText = "";
  let usage = { input: 0, output: 0 };
  let stopReason: string | undefined;
  const processSseLine = async (line: string) => {
    const t = line.trim();
    if (!t.startsWith("data:")) return;
    const payload = t.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let j: {
      choices?: Array<{
        delta?: { content?: string | null };
        finish_reason?: string | null;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
    };
    try {
      j = JSON.parse(payload) as typeof j;
    } catch {
      // 비JSON 프레임 — keep-alive나 provider 전용 메타데이터.
      return;
    }
    const choice = j.choices?.[0];
    const chunk = choice?.delta?.content;
    if (chunk) {
      fullText += chunk;
      onTextStarted?.();
      // 다음 네트워크 청크를 읽기 전에 소비자(stream.write 등)가 끝나야
      // 순서와 backpressure가 보장된다. 오류도 호출자까지 전파한다.
      await args.onText?.(chunk);
    }
    if (typeof choice?.finish_reason === "string") {
      stopReason = normalizeStopReason(choice.finish_reason);
    }
    if (j.usage) {
      usage = {
        input: j.usage.prompt_tokens ?? 0,
        output: j.usage.completion_tokens ?? 0,
      };
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE 프레임은 개행 단위 — 마지막 불완전 라인은 buf에 남김
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      await processSseLine(line);
    }
  }
  // 일부 OpenAI 호환 서버는 마지막 data 프레임 뒤 개행 없이 연결을 닫는다.
  // decoder와 buf를 flush하지 않으면 마지막 문장/finish_reason이 통째로 유실된다.
  buf += decoder.decode();
  for (const line of buf.split("\n")) await processSseLine(line);
  return {
    text: fullText,
    usage,
    ...(stopReason ? { stopReason } : {}),
  };
}

function stoppedByOutputLimit(reason?: string): boolean {
  return normalizeStopReason(reason) === "max_tokens";
}

const CONTINUE_AFTER_LIMIT = `The previous response stopped only because it reached the output-token limit.
Continue exactly where it stopped. Do not repeat any completed sentence, heading, list item, or code block. Complete the unfinished thought and any essential remaining answer, then end with a complete sentence. Output only the continuation.`;

/** 이어쓰기 모델이 앞부분을 조금 반복해도 화면/저장본에는 한 번만 남긴다. */
function removeRepeatedSeam(existing: string, continuation: string): string {
  const max = Math.min(500, existing.length, continuation.length);
  for (let size = max; size >= 24; size--) {
    if (existing.endsWith(continuation.slice(0, size))) {
      return continuation.slice(size);
    }
  }
  return continuation;
}

/** Streams an assistant turn. onText fires per text chunk (sync or async).
 *  과부하/일시적 에러 시 stream 시작 전이면 retry. 일단 텍스트가 흘러나간 후 에러나면 retry하지 않음.
 */
async function streamTurnOnce(
  client: ClaudeClient,
  args: StreamTurnArgs,
): Promise<LlmTurnResult> {
  const normalizedArgs = {
    ...args,
    system: withMathOutputGuidance(args.system),
  };
  const { system, messages, onText } = normalizedArgs;

  return withRetry(
    async () => {
      let fullText = "";
      let textStarted = false;

      // OpenAI-호환 프로바이더 분기 — retry/no-retry 의미는 Anthropic 경로와 동일:
      // 텍스트가 이미 흘러나간 후의 에러는 재시도하지 않음(중복 방지).
      if (client.provider === "openai-compatible") {
        try {
          return await openAiChatOnce(client, normalizedArgs, true, () => {
            textStarted = true;
          });
        } catch (err) {
          if (textStarted) {
            const e = new Error(friendlyApiErrorMessage(err));
            (e as Error & { _noRetry?: boolean })._noRetry = true;
            throw e;
          }
          throw err;
        }
      }

      // messages.stream() 편의 래퍼는 백그라운드에서 원시 스트림을 먼저
      // 소비한다. raw async stream을 직접 순회해야 onText가 끝날 때까지
      // 다음 이벤트를 읽지 않는 진짜 backpressure가 걸린다.
      const stream = await client.raw.messages.create({
        model: args.model ?? client.config.model,
        max_tokens: args.maxTokens ?? client.config.maxTokens,
        system,
        messages,
        stream: true,
      });

      try {
        let inputTokens = 0;
        let outputTokens = 0;
        let stopReason: string | undefined;
        for await (const event of stream) {
          if (event.type === "message_start") {
            inputTokens = event.message.usage.input_tokens;
          } else if (event.type === "message_delta") {
            outputTokens = event.usage.output_tokens;
            if (typeof event.delta?.stop_reason === "string") {
              stopReason = normalizeStopReason(event.delta.stop_reason);
            }
          } else if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const chunk = event.delta.text;
            fullText += chunk;
            textStarted = true;
            await onText?.(chunk);
          }
        }
        return {
          text: fullText,
          usage: {
            input: inputTokens,
            output: outputTokens,
          },
          ...(stopReason ? { stopReason } : {}),
        };
      } catch (err) {
        // 텍스트가 이미 클라이언트로 흘러나간 후 에러나면 재시도해도 중복만 발생함.
        // 그 경우 retry signal을 주지 말고 throw — 외부 catch에서 에러 메시지 출력.
        if (textStarted) {
          const e = new Error(friendlyApiErrorMessage(err));
          (e as Error & { _noRetry?: boolean })._noRetry = true;
          throw e;
        }
        throw err;
      }
    },
    {
      onRetry: (n, err) =>
        console.warn(
          `[streamTurn] transient error, retry ${n}: ${
            (err as Error)?.message ?? String(err)
          }`,
        ),
    },
  );
}

/**
 * Streams an assistant turn. 출력 제한에 닿은 사용자용 응답은 선택적으로
 * 한 번 이어 받아, 잘린 문장 대신 완결된 답변을 화면과 저장본에 동일하게 남긴다.
 */
export async function streamTurn(
  client: ClaudeClient,
  args: StreamTurnArgs,
): Promise<LlmTurnResult> {
  const first = await streamTurnOnce(client, args);
  if (!args.continueOnLength || !stoppedByOutputLimit(first.stopReason)) {
    return first;
  }

  const maxContinuations = Math.min(
    2,
    Math.max(1, Math.trunc(args.maxContinuations ?? 1)),
  );
  let text = first.text;
  let usage = { ...first.usage };
  let stopReason = first.stopReason;

  for (
    let attempt = 0;
    attempt < maxContinuations && stoppedByOutputLimit(stopReason);
    attempt++
  ) {
    let buffered = "";
    const continuationMessages: ClaudeMessage[] = text.trim()
      ? [
          ...args.messages,
          { role: "assistant", content: text },
          { role: "user", content: CONTINUE_AFTER_LIMIT },
        ]
      : [
          ...args.messages,
          {
            role: "user",
            content: `${CONTINUE_AFTER_LIMIT}\n\nNo visible answer was produced in the previous attempt, so answer from the beginning this time.`,
          },
        ];
    const next = await streamTurnOnce(client, {
      ...args,
      messages: continuationMessages,
      continueOnLength: false,
      onText: (chunk) => {
        buffered += chunk;
      },
    });
    const append = removeRepeatedSeam(text, buffered);
    if (append) await args.onText?.(append);
    text += append;
    usage = {
      input: usage.input + next.usage.input,
      output: usage.output + next.usage.output,
    };
    stopReason = next.stopReason;
  }

  return {
    text,
    usage,
    ...(stopReason ? { stopReason } : {}),
  };
}

/** Non-streaming single-shot completion. 일시적 에러 시 자동 재시도. */
export async function completeOnce(
  client: ClaudeClient,
  args: {
    system: string;
    messages: ClaudeMessage[];
    maxTokens?: number;
    model?: string;
    /** Markdown/학습 노트처럼 수식이 실제로 표시되는 출력에만 켠다. */
    mathOutput?: boolean;
  },
): Promise<LlmTurnResult> {
  const normalizedArgs = {
    ...args,
    system: args.mathOutput
      ? withMathOutputGuidance(args.system)
      : args.system,
  };
  return withRetry(
    async () => {
      if (client.provider === "openai-compatible") {
        return openAiChatOnce(client, normalizedArgs, false);
      }

      const response = await client.raw.messages.create({
        model: args.model ?? client.config.model,
        max_tokens: args.maxTokens ?? client.config.maxTokens,
        system: normalizedArgs.system,
        messages: args.messages,
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      return {
        text,
        usage: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
        ...(response.stop_reason
          ? { stopReason: normalizeStopReason(response.stop_reason) }
          : {}),
      };
    },
    {
      onRetry: (n, err) =>
        console.warn(
          `[completeOnce] transient error, retry ${n}: ${
            (err as Error)?.message ?? String(err)
          }`,
        ),
    },
  );
}
